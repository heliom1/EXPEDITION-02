// MCP stdio handshake probe: starts a server exactly as an MCP client would, sends initialize + tools/list, prints the
// server name/version and its tool names, then stops it. Verifies a server really runs (not just that it installed).
// Usage: node tools/mcp-probe.mjs <command> [args...]      (env vars pass through)
import { spawn } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32', env: process.env });
let buf = '', stderr = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    try { const m = JSON.parse(line); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch { /* non-JSON log line */ }
  }
});
child.stderr.on('data', (d) => { stderr += d; });
let id = 0;
const rpc = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  pending.set(n, res);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
  setTimeout(() => rej(new Error(`${method} timed out`)), 180_000);
});
const done = (code) => { try { child.kill(); } catch { /* already gone */ } process.exit(code); };
child.on('exit', (code) => { if (pending.size) { console.log(`server exited (${code}) before answering\n${stderr.slice(-1500)}`); done(1); } });
try {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cf2-probe', version: '1.0.0' } });
  if (init.error) throw new Error(JSON.stringify(init.error));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  console.log(`server: ${init.result.serverInfo?.name} ${init.result.serverInfo?.version} (protocol ${init.result.protocolVersion})`);
  const tools = await rpc('tools/list');
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  console.log(`tools (${names.length}): ${names.join(', ')}`);
  done(names.length ? 0 : 1);
} catch (e) {
  console.log(`probe failed: ${e.message}\n${stderr.slice(-1500)}`);
  done(1);
}
