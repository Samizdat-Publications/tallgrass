// Standalone dev page for the renderer foundation: terrain, water, trees, sky, post, camera.
// Query: ?seed=1&day=0.3&season=1.2&weather=0&cam=wide|low|top&animate=1&q=high|medium&tm=aces|agx|neutral
//        &wind=0.35&burn=0|1&fear=0.5&exp=1&hud=1
import { generateWorld } from '../src/sim/world';
import type { EnvState } from '../src/sim/types';
import { Engine } from '../src/render/engine';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const seed = num('seed', 1);
const world = generateWorld(seed);
const host = document.getElementById('app')!;
const engine = new Engine(host, world, {
  quality: q.get('q') === 'medium' ? 'medium' : 'high',
  toneMapping: (q.get('tm') as 'aces' | 'agx' | 'neutral') ?? 'aces',
  exposure: num('exp', 1),
});

// ---- fake vegetation: lush and grazed patches, a burn scar in one corner, a fear blob
{
  const n = world.n;
  const v = new Uint8Array(n * n * 4);
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vn = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * u) * (1 - w) + (c + (d - c) * u) * w;
  };
  const fbm = (x: number, y: number) => 0.55 * vn(x, y) + 0.3 * vn(x * 2.1 + 5, y * 2.1) + 0.15 * vn(x * 4.3, y * 4.3 + 9);
  const burn = q.get('burn') !== '0';
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i;
      const x = (i + 0.5) * world.cell, y = (j + 0.5) * world.cell;
      let g = world.capacity[c] * (0.6 + 0.6 * fbm(x / 28, y / 28));
      const graze = fbm(x / 34 + 40, y / 34 - 7);
      if (graze > 0.6) g *= 0.12 + 0.5 * (1 - Math.min(1, (graze - 0.6) / 0.12));
      let b = 0;
      if (burn) {
        const d = Math.hypot(x - 70, y - 440);
        if (d < 30) b = 120 + 100 * (1 - d / 30);
        else if (d < 40) b = 255;
        if (d < 40) g *= 0.1;
      }
      const fd = Math.hypot(x - 330, y - 300);
      v[c * 4] = Math.round(Math.max(0, Math.min(1, g)) * 255);
      v[c * 4 + 1] = Math.round(world.soilBase[c] * 255);
      v[c * 4 + 2] = Math.round(b);
      v[c * 4 + 3] = Math.round(255 * Math.exp(-(fd * fd) / (2 * 40 * 40)));
    }
  }
  engine.setVeg(v);
}
if (q.has('fear')) engine.setFearOverlay(num('fear', 0));

// ---- environment
const env: EnvState = {
  tick: 0, year: 0,
  season: num('season', 1.2),
  dayFrac: num('day', 0.3),
  weather: num('weather', 0) as EnvState['weather'],
  rain: num('rain', 0),
  windDir: num('winddir', 0.35),
  windStrength: num('wind', 0.35),
  warmth: num('warmth', 0.7),
};
engine.setEnv(env);
engine.applyEnvNow();
const cam0 = (q.get('cam') ?? 'wide') as 'wide' | 'low' | 'top';
engine.cam.preset(cam0, true);
if (q.get('cin') === '1') engine.cam.setCinematic(true);

const w = window as unknown as Record<string, unknown>;
w.__engine = engine;
w.__cam = (name: 'wide' | 'low' | 'top') => { engine.applyEnvNow(); engine.cam.preset(name, true); };
w.__env = (partial: Partial<EnvState>) => { Object.assign(env, partial); engine.setEnv(partial); engine.applyEnvNow(); };
w.__ready = false;
w.__fps = 0;

const animate = q.get('animate') === '1';
const hud = q.get('hud') === '1' ? document.getElementById('hud')! : null;
const dts: number[] = [];
let frames = 0;
engine.onFrame((dt, t) => {
  frames++;
  dts.push(dt);
  if (dts.length > 90) dts.shift();
  if (dts.length > 5) {
    const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
    w.__fps = Math.round(10 / avg) / 10;
  }
  if (animate) {
    env.dayFrac = (0.28 + t / 40) % 1;
    env.season = (num('season', 1.2) + t / 60) % 4;
    engine.setEnv({ dayFrac: env.dayFrac, season: env.season });
  }
  if (frames === 6) w.__ready = true;
  if (hud && frames % 15 === 0) {
    hud.textContent = `fps ${w.__fps}  day ${env.dayFrac.toFixed(3)}  season ${env.season.toFixed(2)}  sun ${engine.lighting.sunElDeg.toFixed(1)} deg`;
  }
});

/** Synchronous benchmark: GPU-synchronized ms per frame (readPixels forces a full pipeline wait) at the current size and view. */
w.__bench = (count = 120) => {
  engine.stop();
  const gl = engine.renderer.getContext() as WebGL2RenderingContext;
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 0; i < 10; i++) engine.renderOnce(0.016);
  sync();
  const t0 = performance.now();
  for (let i = 0; i < count; i++) engine.renderOnce(0.016);
  sync();
  const ms = (performance.now() - t0) / count;
  const info = engine.renderer.info;
  info.autoReset = false;
  info.reset();
  engine.renderOnce(0.016);
  w.__info = { calls: info.render.calls, tris: info.render.triangles };
  info.autoReset = true;
  engine.start();
  return Math.round(ms * 100) / 100;
};

engine.start();
