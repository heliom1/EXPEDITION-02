// Headless verification: opens the game in Chrome/Edge via the DevTools protocol, waits for the
// terrain to finish streaming, captures screenshots and reports console errors.
// No extra dependencies (Node's built-in WebSocket + fetch).
// Usage: node tools/shoot.mjs [baseUrl] [view ...]   views: menu spawn rover drill cliff vista
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const base = args[0]?.startsWith('http') ? args.shift() : 'http://localhost:5173/';
const views = args.length ? args : ['menu', 'spawn', 'rover', 'drill', 'cliff', 'vista'];
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const exe = process.env.BROWSER ?? browsers.find(existsSync);
if (!exe) throw new Error('No Chrome/Edge found');
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'cf2-shot-'));
const proc = spawn(exe, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1600,900', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11',
  '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let version;
for (let i = 0; i < 50 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(200); }
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
    logs.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  if (msg.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push(`[log] ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });

const report = { browser: version?.Browser, views: {} };
for (const v of views) {
  logs.length = 0;
  const t0 = Date.now();
  await send('Page.navigate', { url: `${base}?shot=${v}&dev` });
  let st;
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    st = await evaluate('JSON.stringify(window.__cf ?? null)');
    const s = st ? JSON.parse(st) : null;
    if (s?.errors?.length) break;
    if (s?.ready && s.pending === 0) break;
  }
  await sleep(2500);
  st = await evaluate('JSON.stringify(window.__cf ?? null)');
  const gpu = await evaluate(`(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c&&c.getExtension('WEBGL_debug_renderer_info');return c?(e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):c.getParameter(c.RENDERER)):'no webgl2'})()`);
  const devText = await evaluate(`document.querySelector('.dev')?.textContent ?? ''`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(out, `${v}.png`);
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  report.views[v] = { file, loadMs: Date.now() - t0, status: st ? JSON.parse(st) : null, gpu, dev: devText, logs: [...logs] };
  console.log(`${v}: ${file} (${Date.now() - t0} ms) fps=${report.views[v].status?.fps?.toFixed?.(1)} logs=${logs.length}`);
  for (const l of logs) console.log('   ', l.slice(0, 400));
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log('GPU:', report.views[views[0]]?.gpu);
ws.close();
proc.kill();
process.exit(0);
