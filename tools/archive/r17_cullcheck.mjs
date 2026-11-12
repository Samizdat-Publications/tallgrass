// R17: is the per-instance animal cull invisible? In one page (so the sim and the clock are identical), render each view with the cull on and
// off at dt = 0 and compare the frames pixel by pixel. node tools/r17_cullcheck.mjs [--size 1600x900] [--views low_golden,herd,...]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const views = arg('views', 'low_golden,wide_golden,herd,night,bison_close,wolf_close').split(',');
const what = arg('what', 'cull'); // cull | ao (AO at full size vs the shipped scale)
const outDir = resolve(arg('out', 'review/wip/r-perf/' + what + 'check'));
const VIEW = {
  wide_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); window.__followId(null); e.cam.preset('wide', true); }`,
  low_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); window.__followId(null); e.cam.preset('low', true); }`,
  herd: `() => { window.__followId(null); window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true); }`,
  night: `() => { Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__followId(null); window.__focusHerd(); }`,
  bison_close: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8 }); e.applyEnvNow(); const id = window.__find(0)[0]; window.__followId(id); e.cam.setView({ distance: 11, pitchDeg: 12 }, true); }`,
  wolf_close: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8 }); e.applyEnvNow(); const id = window.__find(1)[0]; window.__followId(id); e.cam.setView({ distance: 13, pitchDeg: 14 }, true); }`,
};
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r17'), server: { port: 7900 + Math.floor(Math.random() * 90), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**', '**/art/**', '**/journey/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const to = setTimeout(() => process.exit(2), 3000000);
let res;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'domcontentloaded', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  res = await page.evaluate(async ({ VIEW, views, what }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    const an = window.__animals;
    const cv = e.renderer.domElement;
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    const grab = () => { ctx.drawImage(cv, 0, 0); return ctx.getImageData(0, 0, c2.width, c2.height).data; };
    const out = {};
    const cam = an.cullCamera;
    for (const v of views) {
      (0, eval)(`(e) => (${VIEW[v]})`)(e)();
      for (let i = 0; i < 20; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 300));
      e.renderOnce(0);
      const on = new Uint8ClampedArray(grab());
      let counts = an.live.map((b) => [b.def.name ?? b.sp, b.count, b.nView]);
      if (what === 'cull') an.cullCamera = null; else e.post.setAoScale(1);
      e.renderOnce(0);
      const off = new Uint8ClampedArray(grab());
      if (what === 'cull') an.cullCamera = cam; else e.post.setAoScale(0.5);
      const png = (px) => { const c3 = document.createElement('canvas'); c3.width = cv.width; c3.height = cv.height; c3.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), cv.width, cv.height), 0, 0); return c3.toDataURL('image/png'); };
      const dif = new Uint8ClampedArray(on.length);
      for (let i = 0; i < on.length; i += 4) { const d = Math.max(Math.abs(on[i] - off[i]), Math.abs(on[i + 1] - off[i + 1]), Math.abs(on[i + 2] - off[i + 2])); dif[i] = dif[i + 1] = dif[i + 2] = Math.min(255, d * 6); dif[i + 3] = 255; }
      out[v + '_images'] = { on: png(on), off: png(off), diff: png(dif) };
      let nd = 0, maxd = 0, big = 0;
      for (let i = 0; i < on.length; i += 4) {
        const d = Math.max(Math.abs(on[i] - off[i]), Math.abs(on[i + 1] - off[i + 1]), Math.abs(on[i + 2] - off[i + 2]));
        if (d > 0) nd++;
        if (d > maxd) maxd = d;
        if (d > 8) big++;
      }
      out[v] = { pixels: on.length / 4, differing: nd, differing_gt8: big, maxDiff: maxd, batches: counts.filter((c) => c[1] > 0) };
    }
    return out;
  }, { VIEW, views, what });
} finally { clearTimeout(to); await browser.close(); await server.close(); }
mkdirSync(outDir, { recursive: true });
const summary = {};
for (const [k, v] of Object.entries(res)) {
  if (k.endsWith('_images')) { for (const [n, d] of Object.entries(v)) writeFileSync(resolve(outDir, `${k.replace('_images', '')}_${n}.png`), Buffer.from(d.split(',')[1], 'base64')); }
  else summary[k] = v;
}
writeFileSync(resolve(outDir, 'result.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
