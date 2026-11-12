// r-alert2 CPU check: the animal layer's update() cost per frame in a herd view with a wolf running through the herd (the sim's own bison, a real herd),
// with the alert pass on and off (interleaved 5 s windows). Run it from each build's own directory to compare builds.
// Usage: node tools/r_alert2_bench.mjs [--size 1280x720] [--rounds 3]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const rounds = Number(arg('rounds', 3));
const kill = setTimeout(() => { console.error('r_alert2_bench: hard timeout'); process.exit(2); }, 20 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_alert2') });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(`(() => {
    const e = window.__engine, an = window.__animals;
    window.__speed(1); window.__followId(null);
    window.__envO = { season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.5 };
    e.onFrame(() => e.setEnv(window.__envO)); e.setEnv(window.__envO); e.applyEnvNow();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    const sn = window.__snap(), A = sn.agents, n = sn.count;
    const bis = []; for (let i = 0; i < n; i++) if ((A[i * 12] | 0) === 0) bis.push(i);
    let best = -1, bc = 0;
    for (const i of bis) { let c = 0; for (const j of bis) { const dx = A[i * 12 + 1] - A[j * 12 + 1], dz = A[i * 12 + 2] - A[j * 12 + 2]; if (dx * dx + dz * dz < 900) c++; } if (c > bc) { bc = c; best = i; } }
    const hx = A[best * 12 + 1], hz = A[best * 12 + 2];
    const wolves = []; for (let i = 0; i < n; i++) if ((A[i * 12] | 0) === 1) wolves.push(sn.ids[i]);
    const wid = wolves[0];
    const t0 = performance.now();
    const puppet = (s) => { if (!s) return; for (let i = 0; i < s.count; i++) if (s.ids[i] === wid) { const o = i * 12, t = (performance.now() - t0) / 1000; const u = (((t * 4.5) % 80) + 80) % 80 - 40; s.agents[o + 1] = hx + u; s.agents[o + 2] = hz + 12; s.agents[o + 3] = 0; s.agents[o + 4] = 3; s.agents[o + 7] = 2; } };
    const orig = an.update.bind(an);
    an.update = (...a) => { puppet(an.curr); if (an.prev && an.prev !== an.curr) puppet(an.prev); orig(...a); };
    e.cam.setView({ x: hx, y: hz, distance: 45, pitchDeg: 14, yawDeg: 0 }, true);
    return { herd: bc, hx, hz, bison: bis.length };
  })()`);
  console.log('herd of', info.herd, 'bison within 30 m, total bison', info.bison);
  await page.waitForTimeout(4000);
  const r = await page.evaluate(`(async () => {
    const an = window.__animals, orig = an.update.bind(an); let acc = 0, n = 0;
    an.update = (...a) => { const t = performance.now(); orig(...a); acc += performance.now() - t; n++; };
    const out = { on: [], off: [], alerting: 0 };
    for (let k = 0; k < ${rounds}; k++) for (const mode of [true, false]) {
      an.alertEnabled = mode; acc = 0; n = 0;
      await new Promise((r) => setTimeout(r, 5000));
      out[mode ? 'on' : 'off'].push(+(acc / Math.max(1, n)).toFixed(3));
      if (mode) { const S = an.slots; let c = 0; for (const [, k2] of S.map) if (S.al[k2] > 0.5) c++; out.alerting = Math.max(out.alerting, c); }
    }
    an.update = orig; an.alertEnabled = true;
    return out;
  })()`);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log('animals.update ms per frame, alert on:', JSON.stringify(r.on), 'mean', mean(r.on).toFixed(3), '| off:', JSON.stringify(r.off), 'mean', mean(r.off).toFixed(3), '| most grazers alerting at once:', r.alerting);
} catch (e) {
  console.error('r_alert2_bench failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
