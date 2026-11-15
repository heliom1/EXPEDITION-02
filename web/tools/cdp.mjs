// Minimal Chrome DevTools Protocol client for headless verification (no dependencies).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openBrowser({ width = 1600, height = 900, port = 9333 } = {}) {
  const exe = process.env.BROWSER ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  if (!exe) throw new Error('No Chrome/Edge found');
  // Fail fast if an orphaned browser from an interrupted run still holds the debugging port (otherwise this run would
  // silently attach to the stale, frozen page and hang).
  const stale = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
  if (stale) throw new Error(`Port ${port} is already used by another browser (orphan from an interrupted test run?). Close it and retry.`);
  // Throwaway browser profile on D: (C: is nearly full) — removed again in close().
  const tmpRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.tmp');
  mkdirSync(tmpRoot, { recursive: true });
  const profile = mkdtempSync(join(tmpRoot, 'cf2-cdp-'));
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11',
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    // CF_GPU=high selects the discrete GPU on hybrid laptops (headless Chrome otherwise picks the integrated one).
    ...(process.env.CF_GPU === 'high' ? ['--force_high_performance_gpu'] : []), 'about:blank',
  ], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(200); }
  }
  const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const logs = [];
  const handlers = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method && handlers.has(msg.method)) handlers.get(msg.method)(msg.params, msg.sessionId);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
      logs.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    if (msg.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push(`[log] ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  return {
    version, logs, send, evaluate,
    /** Subscribe to a CDP event (one handler per method). */
    on(method, fn) { handlers.set(method, fn); },
    async goto(url, timeoutMs = 60000) {
      await send('Page.navigate', { url });
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        await sleep(250);
        const s = await evaluate('JSON.stringify(window.__cf ?? null)').catch(() => null);
        const st = s ? JSON.parse(s) : null;
        if (st?.errors?.length) throw new Error(st.errors.join('; '));
        if (st?.ready && st.pending === 0) return Date.now() - t0;
      }
      throw new Error('timed out waiting for the game to load');
    },
    async key(code, key = '') {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: code === 'Tab' ? 9 : code === 'KeyE' ? 69 : 0 });
      await sleep(60);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
    },
    async screenshot() {
      return Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
    },
    close() {
      ws.close();
      proc.kill();
      // Chrome releases the profile shortly after exit; retry the removal for a few seconds.
      for (let i = 0; i < 20; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { const t = Date.now(); while (Date.now() - t < 250); } }
    },
  };
}
