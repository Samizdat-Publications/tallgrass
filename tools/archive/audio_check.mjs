// Headless audio check (R14): loads the game on the GPU in Chromium, unlocks audio with a click, runs ~60 s at 10x and logs
// the music state machine (window.__audioState). Also forces a tension pulse and a crane flyover to exercise those paths.
//
// Usage: node tools/audio_check.mjs [--seconds 60] [--speed 10] [--timeout 150000]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
const seconds = Number(arg('seconds', 60));
const speed = Number(arg('speed', 10));
const timeout = Number(arg('timeout', 150000));
const killTimer = setTimeout(() => {
  console.error('audio_check: hard timeout, exiting');
  process.exit(2);
}, timeout + 60000);

const GPU_ARGS = [
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required',
];
const port = 5300 + Math.floor(Math.random() * 600);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
let code = 0;
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = m.text().slice(0, 300);
      errors.push(`[${m.type()}] ${t}`);
    }
  });
  pg.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  await pg.goto(url, { waitUntil: 'load', timeout });
  try {
    await pg.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  } catch {
    console.log('note: __ready never became true');
  }
  const gl = await pg.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const e = c && c.getExtension('WEBGL_debug_renderer_info');
    return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log('renderer:', gl);
  await pg.mouse.click(640, 360); // the user gesture that unlocks audio
  await pg.waitForFunction(() => window.__audioState && window.__audioState.ready, null, { timeout: 30000 });
  console.log('audio context running');
  await pg.evaluate((s) => window.__speed(s), speed);
  // count the sim events that reach the music, by kind
  await pg.evaluate(() => {
    const m = window.__audio.music;
    const orig = m.onEvent.bind(m);
    window.__evc = {};
    m.onEvent = (kind, a, prox) => { window.__evc[kind] = (window.__evc[kind] || 0) + 1; orig(kind, a, prox); };
  });

  const t0 = Date.now();
  let forced = argv.includes('--noforce');
  let flown = null;
  let lastCue = '';
  while ((Date.now() - t0) / 1000 < seconds) {
    await pg.waitForTimeout(1000);
    const el = (Date.now() - t0) / 1000;
    if (!forced && el >= seconds * 0.4) {
      forced = true;
      // a stampede-sized pulse: tension should climb over the threshold and bring in the tension cue
      await pg.evaluate(() => { for (let i = 0; i < 3; i++) window.__audio.music.policy.addPulse(0.5); });
      console.log(`t=${el.toFixed(0)}s forced tension pulse`);
    }
    if (flown === null && el >= seconds * 0.2) {
      flown = await pg.evaluate(() => {
        const a = window.__audio;
        let got = null;
        a.onFlyover = (f) => { got = f; };
        const r = a.scheduleFlyover(0.45, 0.3);
        return r ? { duration: r.duration, birds: r.birds, panFrom: r.panFrom, season: r.season, callback: !!got } : null;
      });
      console.log('flyover:', JSON.stringify(flown));
    }
    const st = await pg.evaluate(() => {
      const a = window.__audioState;
      const s = window.__snap && window.__snap();
      return {
        playing: a.music.playing, wanted: a.music.wanted, base: a.music.base, tension: a.music.tension, tt: a.music.tensionTarget, bl: a.music.baseline, pulse: a.music.pulse, sample: JSON.stringify(a.music.sample), bus: a.music.busGain,
        layers: a.music.layers.map((l) => `${l.cue}:${l.gain}${l.dir === 'out' ? 'v' : l.dir === 'in' ? '^' : ''}`).join(' '),
        loaded: a.music.loaded.join(','),
        day: s ? s.env.dayFrac.toFixed(2) : '?', season: s ? s.env.season.toFixed(2) : '?', weather: s ? s.env.weather : '?',
      };
    });
    if (st.playing !== lastCue || Math.round(el) % 5 === 0) {
      console.log(`t=${String(Math.round(el)).padStart(3)}s cue=${st.playing} wanted=${st.wanted} base=${st.base} tension=${st.tension} target=${st.tt} baseline=${st.bl} pulse=${st.pulse} bus=${st.bus} day=${st.day} season=${st.season} wx=${st.weather} layers[${st.layers}] loaded[${st.loaded}]`);
      lastCue = st.playing;
    }
  }
  const spots = await pg.evaluate(async () => {
    const a = window.__audio;
    const out = { decoded: {} };
    for (const k of ['blizzard', 'grasshopper', 'rut', 'crane']) out.decoded[k] = a.decoded[k] ? a.decoded[k].seconds.toFixed(1) + 's' : 'MISSING';
    const before = a.activeVoices;
    a.fireSpot('rut', { mean: 10, gain: 0.5, distance: 0.3 }, { env: { season: 1.8 }, nearby: { wolf: 0 } });
    out.rutVoices = a.activeVoices - before;
    return out;
  });
  console.log('new clips:', JSON.stringify(spots.decoded), '| rut bellow voices started:', spots.rutVoices);
  const fin = await pg.evaluate(() => {
    const a = window.__audioState;
    return { events: window.__evc, transitions: a.music.transitions, failed: a.music.failed, decoded: a.music.decoded, missing: a.missing, flyovers: a.flyovers, mix: a.mix, ctx: a.context };
  });
  console.log('\nTRANSITIONS');
  for (const t of fin.transitions) console.log(`  t=${t.t}s ${t.from ?? '(none)'} -> ${t.to}  [${t.reason}] tension=${t.tension} xfade=${t.xfade}s`);
  console.log('sim events seen by the music:', JSON.stringify(fin.events));
  console.log('music decoded:', JSON.stringify(fin.decoded), 'music failed:', JSON.stringify(fin.failed));
  console.log('ambience missing:', JSON.stringify(fin.missing), 'flyovers:', fin.flyovers, 'context:', fin.ctx);
  console.log('bed mix:', JSON.stringify(Object.fromEntries(Object.entries(fin.mix).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
  console.log('\nCONSOLE ERRORS/WARNINGS:', errors.length);
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
  if (errors.some((e) => e.startsWith('[error]') || e.startsWith('[exception]')) || fin.failed.length || fin.missing.length) code = 1;
  await ctx.close();
} catch (e) {
  console.error('audio_check failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(killTimer);
}
process.exit(code);
