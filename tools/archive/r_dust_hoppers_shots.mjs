// S12 render check: dust storm and grasshopper outbreak stills, console errors, and an in-page GPU timing (A,B,B,A blocks).
//   node tools/r_dust_hoppers_shots.mjs [storm|hop|bench|all] [outDir=review/wip/dust-hoppers] [size=1600x900]
// Runs a short Vite server and headless Chromium on the real GPU. The storm run forces a drought and loosens the sim's trigger
// (dustBare 0, dustWind 0, dustP 1) so a storm starts at once; the hop run raises the growth of the field so an outbreak builds in the summer.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const mode = process.argv[2] ?? 'all';
const outDir = resolve(process.argv[3] ?? 'review/wip/dust-hoppers');
const [W, H] = (process.argv[4] ?? '1600x900').split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/rdh/.vitecache'), server: { port: 7600 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000);
const errors = [];

async function open(params) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => { errors.push(e.message.slice(0, 300)); console.log('[exc]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text().slice(0, 300)); console.log('[console.error]', m.text().slice(0, 300)); } });
  await page.goto(`${base}/index.html?autoscale=0&autocam=0&p=${params}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('h');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Interface hidden/.test(el.textContent || '')) { let n = el; while (n.parentElement && n.parentElement !== document.body && n.parentElement.children.length === 1) n = n.parentElement; n.style.display = 'none'; }
    window.__speed(0);
    // helpers used by every run: step the sim and wait for the next snapshot; freeze the env push so a held view is repeatable
    window.__stepWait = async (n) => {
      const prev = window.__snap();
      window.__step(n);
      for (let i = 0; i < 400 && window.__snap() === prev; i++) await new Promise((r) => setTimeout(r, 15));
      return window.__snap();
    };
  });
  return page;
}
const shot = async (page, name) => {
  await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log('shot', name);
};

async function storm() {
  const page = await open('dustStorms:1,dustBare:0,dustWind:0,dustP:1,dustCooldown:0');
  const info = await page.evaluate(async () => {
    window.__apply({ kind: 'drought', ticks: 4000, severity: 1 });
    let s = await window.__stepWait(10);
    let found = null;
    for (let i = 0; i < 120; i++) {
      s = await window.__stepWait(10);
      if (s.dust && s.dust[0] >= 0.85 * s.dust[4] && s.dust[3] >= 0.9) { found = Array.from(s.dust); break; }
    }
    return { found, tick: s.env.tick, season: s.env.season, weather: s.env.weather, wind: s.env.windDir, wstr: s.env.windStrength, day: s.env.dayFrac };
  });
  console.log('storm', JSON.stringify(info));
  if (!info.found) { console.log('NO STORM'); await page.close(); return; }
  const dir = info.found[1];
  await page.evaluate(() => { window.__engine.setEnv = () => {}; window.__engine.setDust = () => {}; });
  const views = {
    // yaw is relative to the wind: 0 looks straight upwind (the dust blows at the camera), 70 sees it drifting across the view
    wide_low: () => ({ yaw: 70, pitchDeg: 8, distance: 190 }),
    ground: () => ({ yaw: 70, pitchDeg: 5, distance: 16 }),
    high: () => ({ yaw: 40, pitchDeg: 38, distance: 330 }),
  };
  const place = async (v) => page.evaluate(({ v, dir }) => {
    const e = window.__engine;
    const S = e.uniforms.worldSize.value;
    const o = { x: S * 0.5, y: S * 0.5, yawDeg: (Math.atan2(Math.cos(dir), Math.sin(dir)) * 180) / Math.PI + v.yaw, pitchDeg: v.pitchDeg, distance: v.distance };
    window.__followId(null);
    e.cam.setView(o, true);
    return { cam: e.camera.position.toArray().map((n) => +n.toFixed(1)), focus: e.cam.getFocus().toArray().map((n) => +n.toFixed(1)) };
  }, { v: v(512), dir });
  for (const [name, v] of Object.entries(views)) {
    console.log(name, JSON.stringify(await place(v)));
    await page.waitForTimeout(2500);
    const amt = await page.evaluate(() => window.__engine.dustStorm.amount);
    console.log('  storm amount', amt.toFixed(3));
    await shot(page, `dust_${name}_storm`);
    if (process.env.DBG) {
      await page.evaluate(() => { const e = window.__engine; if (!e.__a) { e.__a = e.post.apply.bind(e.post); e.post.apply = (L) => { e.__a(L); e.post.fog.material.uniforms.uDustStorm.value = 0; }; } });
      await page.waitForTimeout(400);
      await shot(page, `dbg_${name}_nofog`);
      await page.evaluate(() => { const e = window.__engine; e.post.apply = e.__a; e.__a = null; });
    }
    if (name === 'wide_low' || name === 'ground') {
      await page.evaluate(() => { const e = window.__engine; e.setDust = () => {}; e.dustStorm.setFrame(undefined); });
      await page.waitForTimeout(4500);
      await shot(page, `dust_${name}_clear`);
      await page.evaluate((f) => window.__engine.dustStorm.setFrame(new Float32Array(f)), info.found);
      await page.waitForTimeout(500);
    }
  }
  await page.close();
}

async function hop() {
  // drive the field up: a low critical heat and a fast rate, so the summer builds an outbreak in a few valley months
  const page = await open('grasshoppers:1,hopperCrit:0.1,hopperR:90,hopperSeed:0.25,hopperEat:0.1');
  const info = await page.evaluate(async () => {
    let s = await window.__stepWait(10);
    let best = null;
    for (let i = 0; i < 300; i++) {
      s = await window.__stepWait(100);
      const h = s.hoppers;
      if (h) {
        let m = 0, mi = 0;
        for (let k = 0; k < h.length; k++) if (h[k] > m) { m = h[k]; mi = k; }
        best = { max: m, cell: mi, mean: h.reduce((a, b) => a + b, 0) / h.length, season: s.env.season };
        if (m >= 200 && s.env.season > 0.6 && s.env.season < 2.2) break;
      }
    }
    // to mid-morning, so the stills are in daylight
    for (let t = 0; t < 4 && !(s.env.dayFrac > 0.38 && s.env.dayFrac < 0.5); t++) {
      const prev = window.__snap();
      window.__timeOfDay(0.42);
      for (let i = 0; i < 400 && window.__snap() === prev; i++) await new Promise((r) => setTimeout(r, 15));
      for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 30)); const d = window.__snap().env.dayFrac; if (d > 0.38 && d < 0.5) break; }
      s = window.__snap();
    }
    return { best, tick: s.env.tick, weather: s.env.weather, day: s.env.dayFrac, warmth: s.env.warmth };
  });
  console.log('hop', JSON.stringify(info));
  if (!info.best || info.best.max < 60) { console.log('NO OUTBREAK'); await page.close(); return; }
  await page.evaluate(() => { const e = window.__engine; e.setEnv = () => {}; e.setHoppers = () => {}; Object.assign(e.env, { weather: 0, rain: 0, windStrength: 0.25, warmth: 0.75, dayFrac: 0.42, season: 1.6 }); e.applyEnvNow(); });
  const cx = ((info.best.cell % 32) + 0.5) * 16, cz = (Math.floor(info.best.cell / 32) + 0.5) * 16;
  const place = (o) => page.evaluate(({ cx, cz, o }) => {
    const e = window.__engine;
    window.__followId(null);
    e.cam.setView({ x: cx, y: cz, yawDeg: o.yaw, pitchDeg: o.pitch, distance: o.dist }, true);
    return { cam: e.camera.position.toArray().map((n) => +n.toFixed(1)), vis: e.hoppers.mesh.visible };
  }, { cx, cz, o });
  if (process.env.DBGH) await page.evaluate(() => {
    const m = window.__engine.hoppers.mat;
    m.fragmentShader = m.fragmentShader.replace('gl_FragColor = vec4(min(col, vec3(2.0)), vC.a * a);', 'gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);');
    m.vertexShader = m.vertexShader.replace('gl_PointSize = clamp(', 'gl_PointSize = 6.0 + 0.0 * clamp(');
    m.depthTest = false; m.needsUpdate = true;
  });
  for (const [name, o] of Object.entries({ close: { yaw: 150, pitch: 5, dist: 6 }, mid: { yaw: 150, pitch: 9, dist: 20 }, wide: { yaw: 150, pitch: 14, dist: 200 } })) {
    const r = await place(o);
    await page.waitForTimeout(2500);
    console.log(name, JSON.stringify(r), 'visible', await page.evaluate(() => { const u = window.__engine.uniforms; return JSON.stringify({ vis: window.__engine.hoppers.mesh.visible, light: u.lightColor.value.toArray().map((n) => +n.toFixed(2)), mid: u.skyMid.value.toArray().map((n) => +n.toFixed(2)), hor: u.skyHorizon.value.toArray().map((n) => +n.toFixed(2)) }); }));
    await shot(page, `hoppers_${name}`);
  }
  await page.close();
}

async function bench() {
  // default: both params off, nothing may be visible or drawn
  const d = await open('');
  console.log('default', JSON.stringify(await d.evaluate(() => ({ dust: window.__engine.dustStorm.mesh.visible, hop: window.__engine.hoppers.mesh.visible, level: window.__engine.dustStorm.amount }))));
  await d.close();
  const page = await open('dustStorms:1,dustBare:0,dustWind:0,dustP:1,dustCooldown:0,grasshoppers:1,hopperCrit:0.1,hopperR:90,hopperSeed:0.25');
  const res = await page.evaluate(async () => {
    const e = window.__engine;
    window.__apply({ kind: 'drought', ticks: 4000, severity: 1 });
    let s = await window.__stepWait(10);
    let frame = null;
    for (let i = 0; i < 160 && !frame; i++) { s = await window.__stepWait(10); if (s.dust && s.dust[0] >= 0.85 * s.dust[4] && s.dust[3] >= 0.9) frame = Array.from(s.dust); }
    for (let i = 0; i < 200 && !(s.hoppers && Math.max(...s.hoppers) > 120); i++) s = await window.__stepWait(100);
    const hf = s.hoppers ? new Uint8Array(s.hoppers) : null;
    let mi = 0; if (hf) for (let k = 0; k < hf.length; k++) if (hf[k] > hf[mi]) mi = k;
    e.setEnv = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    const dir = frame ? frame[1] : 0;
    const cx = ((mi % 32) + 0.5) * 16, cz = (Math.floor(mi / 32) + 0.5) * 16;
    const VIEWS = {
      storm_low: () => { e.cam.setView({ x: 256, y: 256, yawDeg: (Math.atan2(Math.cos(dir), Math.sin(dir)) * 180) / Math.PI, pitchDeg: 8, distance: 190 }, true); },
      storm_ground: () => { e.cam.setView({ x: 256, y: 256, yawDeg: (Math.atan2(Math.cos(dir), Math.sin(dir)) * 180) / Math.PI, pitchDeg: 5, distance: 16 }, true); },
      hop_close: () => { e.cam.setView({ x: cx, y: cz, yawDeg: 40, pitchDeg: 6, distance: 7 }, true); },
      hop_mid: () => { e.cam.setView({ x: cx, y: cz, yawDeg: 40, pitchDeg: 10, distance: 22 }, true); },
    };
    const F = {
      storm: { set: (on) => { const d = e.dustStorm; if (on) { d.setFrame(new Float32Array(frame)); d.level = d.target; } else { d.setFrame(undefined); d.level = 0; d.mesh.visible = false; d.amount = 0; } } },
      hop: { set: (on) => { e.hoppers.field.on = on && !!hf; if (!on) e.hoppers.mesh.visible = false; else e.hoppers.setField(hf); } },
    };
    const block = async (setOn, on) => {
      setOn(on);
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 200));
      const qs = [];
      for (let i = 0; i < 40; i++) {
        setOn(on);
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
      }
      let tries = 0;
      while (tries++ < 200 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
      const t = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (t.length < 20) return NaN;
      return +t[Math.floor(t.length / 2)].toFixed(3);
    };
    const out = {};
    const plan = [['storm', 'storm_low'], ['storm', 'storm_ground'], ['hop', 'hop_close'], ['hop', 'hop_mid']];
    for (const [fname, vname] of plan) {
      const f = F[fname];
      VIEWS[vname]();
      for (let i = 0; i < 12; i++) e.renderOnce(0.016);
      const A = [], B = [];
      for (let r = 0; r < 5; r++) { A.push(await block(f.set, true)); B.push(await block(f.set, false)); B.push(await block(f.set, false)); A.push(await block(f.set, true)); }
      out[vname] = { A, B };
      f.set(false);
    }
    return { rend, out, haveFrame: !!frame, haveField: !!hf };
  });
  console.log('renderer', res.rend, W + 'x' + H, 'storm frame', res.haveFrame, 'field', res.haveField);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(14), 'fastA(on)', fa.length, med(fa).toFixed(3), 'fastB(off)', fb.length, med(fb).toFixed(3), 'DELTA(on-off)', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
  await page.close();
}

try {
  if (mode === 'storm' || mode === 'all') await storm();
  if (mode === 'hop' || mode === 'all') await hop();
  if (mode === 'bench') await bench();
  console.log('console errors:', errors.length, JSON.stringify(errors));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
