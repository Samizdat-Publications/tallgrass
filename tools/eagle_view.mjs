// Eagle versus raven comparison stills (r-eagle-v1). Renders ONE eagle and ONE raven of the real game (their own shaders, geometry and materials, at
// the game's own species scale) side by side on a plain sky backdrop, in soaring, flapping and perched poses from a few camera angles at 10 to 60 m,
// and writes one PNG per view into --out. One headless browser, wrapped in a hard timeout.
//
//   node tools/eagle_view.mjs [--out scratch/v1-eagle] [--tag after] [--dir <checkout>] [--size 1000x560] [--sky 9fb4c8]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/v1-eagle'));
const tag = arg('tag', 'run');
const dir = resolve(arg('dir', '.'));
const [W, H] = arg('size', '1000x560').split('x').map(Number);
const sky = parseInt(arg('sky', '9fb4c8'), 16);
if (!existsSync(resolve(dir, 'index.html'))) throw new Error('no index.html in ' + dir);
const req = createRequire(resolve(dir, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
process.chdir(dir);
const kill = setTimeout(() => { console.error('eagle_view: hard timeout'); process.exit(2); }, 6 * 60 * 1000);
const server = await vite.createServer({
  root: dir, configFile: resolve(dir, 'vite.config.ts'), cacheDir: resolve(dir, 'node_modules/.vite-eagleview'),
  server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let code = 0;
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(300000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 400)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });

  const setup = await page.evaluate(async (skyHex) => {
    const e = window.__engine, A = window.__animals;
    window.__speed(0);
    e.stop();
    e.frameCbs.length = 0; e.preRenderCbs.length = 0;
    e.cam.update = () => {};
    A.update = () => {}; A.commit = () => {};
    const bs = A.batches.filter((x) => x && x.def.params.kind === 2);
    const raven = bs.find((x) => !x.def.params.raptor);
    const eagle = bs.find((x) => x.def.params.raptor && x.def.params.length > 0.8);
    if (!raven || !eagle) return { error: 'missing batch ' + bs.length };
    const keep = new Set();
    for (const b of [raven, eagle]) for (let o = b.mesh; o; o = o.parent) keep.add(o);
    e.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o !== raven.mesh && o !== eagle.mesh) o.visible = false; });
    for (const o of keep) o.visible = true;
    for (const b of [raven, eagle]) { b.mesh.visible = true; if (b.nearMesh) b.nearMesh.visible = false; }
    const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /three[^/]*\.js(\?|$)/.test(n) && !/examples/.test(n));
    const T = await import(url);
    const sphere = new T.Mesh(new T.SphereGeometry(300, 24, 16), new T.MeshBasicMaterial({ color: skyHex, side: T.BackSide, toneMapped: false, fog: false }));
    sphere.frustumCulled = false;
    e.scene.add(sphere);
    e.camera.far = Math.max(e.camera.far, 1200); e.camera.near = 0.5; e.camera.updateProjectionMatrix();
    const OY = 50;
    const cv = e.renderer.domElement;
    const w = cv.width, h = cv.height;
    window.__lab = { e, A, T, sphere, raven, eagle, OY };
    window.__lab.shoot = (b, other, pose, v, sc) => {
      other.nView = 0; other.count = 0; other.mesh.count = 0;
      b.nView = 1; b.count = 1; b.mesh.count = 1;
      const mat = b.mesh.instanceMatrix.array;
      mat.fill(0); mat[0] = sc; mat[5] = sc; mat[10] = sc; mat[15] = 1; mat[13] = OY; b.mesh.instanceMatrix.needsUpdate = true;
      const set = (arr, vv) => { for (let i = 0; i < 4; i++) arr.array[i] = vv[i]; arr.needsUpdate = true; };
      set(b.gait, pose.gait); set(b.look, pose.look); set(b.fx, pose.fx); set(b.fx2, pose.fx2);
      A.uTime.value = pose.t; e.time = pose.t; e.uniforms.time.value = pose.t;
      const cam = e.camera;
      cam.fov = v.fov; cam.updateProjectionMatrix();
      cam.position.set(v.cam[0], v.cam[1] + OY, v.cam[2]);
      cam.up.set(0, 1, 0);
      cam.lookAt(v.look[0], v.look[1] + OY, v.look[2]);
      cam.updateMatrixWorld();
      sphere.position.set(0, OY, 0);
      e.renderOnce(0);
    };
    return { w, h, eagleLen: eagle.def.params.length, ravenLen: raven.def.params.length };
  }, sky);
  if (setup.error) throw new Error(setup.error);
  console.log('setup', JSON.stringify(setup));

  // poses. gait = (walk phase, speed, flap weight, perch upright), look = (coat, seed, wing fold, 0), fx = (peck, altitude, effort, stoop), fx2 = (hop, walk, takeoff, flutter / preen)
  const soar = (seed, t) => ({ gait: [0, 6, 0, 0], look: [0.5, seed, 0, 0], fx: [0, 30, 0, 0], fx2: [-1, -1, -1, 0], t });
  const flap = (seed, t) => ({ gait: [0, 6, 1, 0], look: [0.5, seed, 0, 0], fx: [0, 30, 0.3, 0], fx2: [-1, -1, -1, 0], t });
  const perch = (seed, t) => ({ gait: [0, 0, 0, 1], look: [0.5, seed, 1, 0], fx: [0, 0, 0, 0], fx2: [-1, -1, -1, 0], t });
  // coat 0.5 is the game's mean; the eagle uses the coat lerp coatPale..coatDark, so show a pale and a dark individual too
  const shots = [
    { name: 'soar_under_30m', pose: soar(0.31, 12), cam: [6, -26, 12], look: [0, 0, 0], fov: 16 },
    { name: 'soar_under_60m', pose: soar(0.31, 12), cam: [12, -52, 24], look: [0, 0, 0], fov: 16 },
    { name: 'soar_front_15m', pose: soar(0.58, 7), cam: [13, -4, 5], look: [0, 0, 0], fov: 30 },
    { name: 'soar_above_20m', pose: soar(0.58, 7), cam: [3, 16, 11], look: [0, 0, 0], fov: 22 },
    { name: 'flap_under_20m', pose: flap(0.07, 5.3), cam: [7, -17, 8], look: [0, 0.3, 0], fov: 22 },
    { name: 'perch_9m', pose: perch(0.31, 3), cam: [3, 1.2, 7.5], look: [0, 1.0, 0], fov: 28 },
    { name: 'perch_close_4m', pose: perch(0.58, 4), cam: [3.2, 1.6, 3.2], look: [0, 1.1, 0], fov: 30 },
  ];
  for (const s of shots) {
    const png = await page.evaluate(({ s, W, H }) => {
      const { e, raven, eagle, shoot } = window.__lab;
      const cv = e.renderer.domElement;
      const c2 = document.createElement('canvas'); c2.width = cv.width * 2; c2.height = cv.height;
      const x2 = c2.getContext('2d');
      // the species scale in animals.ts (eagle 1.7, raven 1.7): read it from the layer so the picture follows the game
      const sc = window.__animals.speciesScale;
      const spE = eagle.sp, spR = raven.sp;
      shoot(eagle, raven, s.pose, s, sc[spE]);
      x2.drawImage(cv, 0, 0);
      // the raven stands in the same place; it flaps/soars with its own pose layout (look.z fold, fx.y altitude)
      shoot(raven, eagle, s.pose, s, sc[spR]);
      x2.drawImage(cv, cv.width, 0);
      x2.fillStyle = '#fff'; x2.font = '22px monospace'; x2.fillText('eagle  x' + sc[spE], 10, 26); x2.fillText('raven  x' + sc[spR], cv.width + 10, 26);
      return c2.toDataURL('image/png');
    }, { s, W, H });
    const file = `${out}/${tag}_${s.name}.png`;
    writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
    console.log('wrote', file);
  }
} catch (e) {
  console.error('eagle_view failed:', e.message);
  code = 3;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'PAGE ERRORS:\n' + uniq.join('\n') : 'no page exceptions or console errors');
process.exit(code);
