// node scratch/r2/shots.mjs <outDir> <name1,name2,...|all> [size=1600x900]
// One page load, many stills. Each shot: env, camera, optional feature-off toggles. JPEG q90.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? 'review/wip/R2';
const want = (process.argv[3] ?? 'all').split(',');
const [W, H] = (process.argv[4] ?? '1600x900').split('x').map(Number);
mkdirSync(outDir, { recursive: true });

// concept: opts for __concept (it frames the creek bend and sets env), then `env` overrides, then `cam` runs.
const CAL = { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7 };
const SHOTS = {
  // god rays
  gr_concept_on: { concept: {}, env: { ...CAL, windStrength: 0.45 } },
  gr_concept_off: { concept: {}, env: { ...CAL, windStrength: 0.45 }, off: ['godrays'] },
  gr_lowback_on: { concept: { dist: 38, pitch: 6, sunOff: 8, shift: 0, side: 0 }, env: { ...CAL, windStrength: 0.45 } },
  gr_lowback_off: { concept: { dist: 38, pitch: 6, sunOff: 8, shift: 0, side: 0 }, env: { ...CAL, windStrength: 0.45 }, off: ['godrays'] },
  gr_dust_on: { concept: { dist: 60, pitch: 9, sunOff: 14 }, env: { ...CAL, weather: 2, windStrength: 0.45 } },
  // snow
  snow_low: { env: { dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.4, windDir: 0.6 }, cam: "e.cam.preset('low', true)", frames: 140 },
  snow_low2: { env: { dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.4, windDir: 0.6 }, cam: "e.cam.setView({ distance: 7, pitchDeg: 4 }, true)", frames: 140 },
  snow_mid: { env: { dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.4, windDir: 0.6 }, cam: "e.cam.setView({ distance: 60, pitchDeg: 20 }, true)", frames: 140 },
  snow_wide: { env: { dayFrac: 0.34, season: 3.2, weather: 4, windStrength: 0.4, windDir: 0.6 }, cam: "e.cam.preset('wide', true)", frames: 140 },
  blizzard_low: { env: { dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.88, windDir: 0.6 }, cam: "e.cam.preset('low', true)", frames: 140 },
  blizzard_mid: { env: { dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.88, windDir: 0.6 }, cam: "e.cam.setView({ distance: 60, pitchDeg: 20 }, true)", frames: 140 },
  blizzard_wide: { env: { dayFrac: 0.34, season: 3.2, weather: 4, windStrength: 0.88, windDir: 0.6 }, cam: "e.cam.preset('wide', true)", frames: 140 },
  snow_dbg: { env: { dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.4, windDir: 0.6 }, cam: "e.cam.preset('low', true); const so0 = e.post.snow.update.bind(e.post.snow); e.post.snow.update = (dt, c, p) => { so0(dt, c, p); e.post.snow.material.uniforms.uColor.value.setRGB(8, 0, 0); e.post.snow.material.uniforms.uAlpha.value = 1; }", frames: 60 },
  snow_dbg2: { env: { dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.4, windDir: 0.6 }, cam: "e.cam.preset('low', true); const m = e.post.snow.material; m.fragmentShader = m.fragmentShader.replace('a *= smoothstep(-0.05, 0.15, sceneZ - vZ);', ''); m.needsUpdate = true; const so0 = e.post.snow.update.bind(e.post.snow); e.post.snow.update = (dt, c, p) => { so0(dt, c, p); m.uniforms.uColor.value.setRGB(8, 0, 0); m.uniforms.uAlpha.value = 1; }", frames: 60 },
  nosnow_wide_winter: { env: { dayFrac: 0.34, season: 3.2, weather: 0, windStrength: 0.4 }, cam: "e.cam.preset('wide', true)" },
  // dawn fog (late summer, clear and calm), creek valley (concept framing)
  dawn_024_on: { concept: { day: 0.24, dist: 170, pitch: 16 }, env: { ...CAL, dayFrac: 0.24 } },
  dawn_024_off: { concept: { day: 0.24, dist: 170, pitch: 16 }, env: { ...CAL, dayFrac: 0.24 }, off: ['dawn'] },
  dawn_030_on: { concept: { day: 0.30, dist: 170, pitch: 16 }, env: { ...CAL, dayFrac: 0.30 } },
  dawn_030_off: { concept: { day: 0.30, dist: 170, pitch: 16 }, env: { ...CAL, dayFrac: 0.30 }, off: ['dawn'] },
  dawn_024_low: { concept: { day: 0.24, dist: 40, pitch: 5, sunOff: 40 }, env: { ...CAL, dayFrac: 0.24 } },
  dawn_024_wide: { env: { ...CAL, dayFrac: 0.24 }, cam: "e.cam.preset('wide', true)" },
  dawn_024_windy: { concept: { day: 0.24, dist: 170, pitch: 16 }, env: { ...CAL, dayFrac: 0.24, windStrength: 0.6 } },
  // regression: noon, night, concept with no snow (on vs everything off)
  reg_noon_on: { env: { ...CAL, dayFrac: 0.5, season: 1.8 }, cam: "e.cam.preset('wide', true)" },
  reg_noon_off: { env: { ...CAL, dayFrac: 0.5, season: 1.8 }, cam: "e.cam.preset('wide', true)", off: ['godrays', 'dawn', 'snow'] },
  reg_night_on: { env: { ...CAL, dayFrac: 0.97, season: 2.2 }, cam: "window.__focusHerd()" },
  reg_night_off: { env: { ...CAL, dayFrac: 0.97, season: 2.2 }, cam: "window.__focusHerd()", off: ['godrays', 'dawn', 'snow'] },
  reg_concept_on: { concept: {}, env: { ...CAL, windStrength: 0.45 } },
};
const names = want[0] === 'all' ? Object.keys(SHOTS) : want;

const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r2/.vitecache'), server: { port: 5900 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 900000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autocam=0&autoscale=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('h');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Interface hidden/.test(el.textContent || '')) { let n = el; while (n.parentElement && n.parentElement !== document.body && n.parentElement.children.length === 1) n = n.parentElement; n.style.display = 'none'; } });
  await page.evaluate(() => {
    window.__speed(0);
    const e = window.__engine;
    window.__off = {};
    window.__origSetEnv = e.setEnv.bind(e);
    const orig = e.post.apply.bind(e.post);
    e.post.apply = (L) => { orig(L); if (window.__off.dawn) e.post.fog.material.uniforms.uDawn.value = 0; };
    const so = e.post.snow.update.bind(e.post.snow);
    e.post.snow.update = (dt, cam, p) => { if (window.__off.snow) p = { ...p, fall: 0 }; so(dt, cam, p); };
  });
  for (const name of names) {
    const s = SHOTS[name];
    if (!s) { console.log('no shot', name); continue; }
    const info = await page.evaluate(async ({ s }) => {
      const e = window.__engine;
      window.__off = {}; for (const k of s.off ?? []) window.__off[k] = true;
      e.post.godrays.enabled = !window.__off.godrays;
      let info = {};
      e.setEnv = window.__origSetEnv;
      if (s.concept) info = window.__concept(s.concept);
      e.setEnv = () => {}; // hold the env from here on
      Object.assign(e.env, s.env ?? {});
      e.applyEnvNow();
      if (s.cam) (0, eval)(`(e) => { ${s.cam} }`)(e);
      for (let i = 0; i < (s.frames ?? 20); i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 400));
      for (let i = 0; i < 3; i++) e.renderOnce(0.016);
      const f = e.post.fog.material.uniforms;
      return { info, cam: [e.camera.position.x | 0, e.camera.position.y | 0, e.camera.position.z | 0], uDawn: +f.uDawn.value.toFixed(5), godray: +e.post.godrays.strength.toFixed(3), snowCount: e.post.snow.count, blizzard: +e.post.blizzard.toFixed(2) };
    }, { s });
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, name + '.jpg'), type: 'jpeg', quality: 90 });
    console.log(name, JSON.stringify(info));
  }
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(0);
