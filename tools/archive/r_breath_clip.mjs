// With --synthetic 1 (run as `node --import tsx tools/r_breath_clip.mjs ...`) the sim is paused and the page's env is driven at a true 100x
// pace (1000 ticks per second) from the real ClimateRegime series, so the renderer and UI can be judged at full fast-forward even
// while a busy machine holds the real sim to 10x. The climate values, the seasons and the days are the sim's own; weather stays clear.
// r-breath time-lapse check: about 60 s of the real game at 100x with climate regimes on, recorded to mp4, plus a per-second log of the
// sim rate and the engine's climate state.
//   node tools/r_breath_clip.mjs --out scratch/r-breath/breath_100x.mp4 [--secs 60] [--size 1280x720] [--query "p=climate2:0.3"]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/r-breath/breath_100x.mp4'));
const secs = Number(arg('secs', '60'));
const query = arg('query', 'p=climate2:0.3');
const speed = Number(arg('speed', '100'));
const graph = arg('graph', '0') === '1';
const synthetic = arg('synthetic', '0') === '1';
let synth = null;
if (synthetic) {
  const { ClimateRegime } = await import('../src/sim/climate.ts');
  const { hashSeed } = await import('../src/sim/rng.ts');
  const types = await import('../src/sim/types.ts');
  types.setCalendarScale(0.5); // the game's valley year is 1,200 ticks (calendarScale 0.5), which the regime's year indexing follows
  const reg = new ClimateRegime(hashSeed('tallgrass'), { climatePeriod: 40, climateMegaP: 0.03 });
  const STEP = 20, N = Math.ceil((secs + 4) * 1000 / STEP);
  synth = { step: STEP, climate: [], mega: [] };
  for (let i = 0; i <= N; i++) { synth.climate.push(reg.value(i * STEP)); synth.mega.push(reg.inMegadrought(i * STEP) ? 1 : 0); }
}
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const kill = setTimeout(() => { console.error('r_breath_clip: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/.vitecache-rbreath'),
  server: { port: 5700 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, fs: { allow: [resolve('.'), 'C:/Users/stewa/Documents/Claude/ecosystem-sim/node_modules'] }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const tmp = resolve('scratch/_clip_tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
let code = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: tmp, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const gpu = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log('gpu:', gpu);
  await page.waitForTimeout(1000);
  await page.evaluate((s) => { window.__cam('wide'); window.__speed(s); }, speed);
  if (synth) {
    await page.evaluate(({ synth, speed }) => {
      const e = window.__engine;
      window.__speed(0);
      e.setEnv = () => {};
      e.setStorms = () => {}; // (it carries the sim speed, which is 0 while the sim is paused here)
      e.simSpeed = speed;
      const t0 = performance.now();
      const YEAR = 1200, SEASON0 = 1.8, DAY0 = 0.27, DAYT = 800;
      e.onFrame(() => {
        const tick = ((performance.now() - t0) / 1000) * 10 * speed;
        const f = tick / synth.step, i = Math.min(synth.climate.length - 2, Math.floor(f)), k = f - i;
        const c = synth.climate[i] + (synth.climate[i + 1] - synth.climate[i]) * k;
        Object.assign(e.env, { tick, year: Math.floor(tick / YEAR), season: (((tick / YEAR) * 4 + SEASON0) % 4), dayFrac: (DAY0 + tick / DAYT) % 1, weather: 0, rain: 0, climate: c });
        e.megadrought = !!synth.mega[i];
      });
    }, { synth, speed });
  }
  if (graph) await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })));
  const t0 = Date.now();
  const log = [];
  while (Date.now() - t0 < secs * 1000) {
    await page.waitForTimeout(1000);
    log.push(await page.evaluate(() => {
      const s = window.__snap(), e = window.__engine;
      return { t: s?.tick ?? 0, et: Math.round(e.env.tick), ec: +(e.env.climate ?? 0).toFixed(2), mg: e.megadrought ? 1 : 0, tps: Math.round(s?.ticksPerSec ?? 0), season: +(s?.env.season ?? 0).toFixed(2), clim: +(s?.env.climate ?? 0).toFixed(2), climSm: +e.climSm.toFixed(2), dry: +e.dryLook.toFixed(2), wet: +e.wetLook.toFixed(2), drought: +e.uniforms.drought.value.toFixed(2), word: document.querySelector('.tg-slate-clim')?.textContent ?? '' };
    }));
  }
  const video = page.video();
  await ctx.close();
  const webm = await video.path();
  mkdirSync(dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', `-${secs}`, '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '30', out]);
  writeFileSync(out.replace(/\.mp4$/, '.log.json'), JSON.stringify(log, null, 1));
  console.log('saved', out, `(${secs} s)`);
  console.log(log.map((r) => `${String(r.t).padStart(7)} et${r.et} ec${r.ec} mg${r.mg} ${String(r.tps).padStart(5)}tps s${r.season} c${r.clim} sm${r.climSm} dry${r.dry} wet${r.wet} d${r.drought} ${r.word}`).join('\n'));
  if (errors.length) console.log('page errors:', [...new Set(errors)].join(' | '));
} catch (e) {
  console.error('r_breath_clip failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
process.exit(code);
