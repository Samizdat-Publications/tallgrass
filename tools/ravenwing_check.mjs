// Raven wing attachment check (r-ravenwing). Renders ONE raven of the real game (its own shader, geometry and material) through every pose its vertex
// shader has (stand, peck, glide, a full flap cycle at several seeds, every fold weight, the landing blend of flap into fold, the takeoff flare from first
// motion to the end of the leap, the two-footed hop, the flutter) from four fixed angles, against a flat magenta backdrop, and measures how far the
// silhouette reaches from the bird's own axes. A primary feather flung off its hand shows up as a reach far beyond what the rest-pose geometry allows.
//
//   node tools/ravenwing_check.mjs [--out scratch/v1-ravenwing] [--tag after] [--dir <checkout>] [--size 900x700] [--sheet 1]
//
// How the limit is made (no tuning by eye): R0 is the largest distance of any vertex of the raven mesh from the body centre in the rest pose. Posing
// only rotates parts about the shoulder or the elbow, so a wing vertex stays within R0 (plus a little for the neck and pitch). The shader's only
// translations are vertical (bob, hop lift, takeoff leap), so in the HORIZONTAL plane every bird pixel must lie within R0 + MARGIN of the vertical
// axis through the bird (the top view measures that radius; the side and front views measure the horizontal reach), and the silhouette height in the
// side and front views must stay within 2 x (R0 + MARGIN). A stretched feather fails one of the three. A fourth check catches the quieter failure that
// an unpacked weight causes (one wing's hand never bending, so a folded wing stays a long straight blade without ever exceeding the reach): in the top view
// the left half of the silhouette must overlap the mirror image of the right half (see SYM_BY_KIND). The same fault is also pinned, without a browser,
// by src/render/models/ravenwings.test.ts. Exit code 1 on any failure. --gallery <regex> writes a picture sheet of matching poses instead of checking.
// Needs the GPU (headless Chromium + d3d11 angle); always runs under a hard timeout. Saves one PNG sheet of the worst poses per run, never an OS screen grab.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/v1-ravenwing'));
const tag = arg('tag', 'run');
const dir = resolve(arg('dir', '.'));
const [W, H] = arg('size', '900x700').split('x').map(Number);
const wantSheet = arg('sheet', '1') !== '0';
const replayFile = arg('replay', '');   // a JSON log of real in-game instance rows (see the header): poses come from it instead of the built-in grid
const replayMax = Number(arg('replay-max', '600'));
const gallery = arg('gallery', '');    // a regex on pose names: skip the check and write a picture sheet of the matching poses (top, side and a close 3/4 view) instead
const MARGIN = 0.12;
// Wing symmetry (top view IoU of the left half against the mirrored right half). Measured on the fixed build: stand, peck and walk 0.71 to 0.90, glide 0.78 to 0.96,
// blend 0.83 to 0.97, hop 0.81 to 0.92, flutter 0.62 to 0.92; with one wing's hand never bending (the bug) the same poses read 0.06 to 0.30. Poses in the beat,
// the takeoff flare and the mixes are left out: wings up are seen end on from above and the two wings are legitimately a little out of phase there.
const SYM_BY_KIND = { stand: 0.55, peck: 0.55, walk: 0.55, glide: 0.55, blend: 0.55, hop: 0.55, flutter: 0.5 };
const symMinOf = (name) => SYM_BY_KIND[name.split(' ')[0]] ?? 0;
// A folded wing (r-fold) lies flat along the flank, inside the +-0.12 m strip the symmetry measure leaves out, so for a tucked bird the measure has nothing to
// compare. A pose whose whole top view stays within TUCK_W of the body axis counts as tucked: the symmetry test is skipped for it, and the standing poses
// (stand, peck, walk) must be tucked (a wing or a fan of primaries sticking out sideways fails). A wing that does not fold (one hand never bending) sticks
// out far beyond TUCK_W, so it fails the tucked test for a standing bird and the symmetry test for the mixes. Measured: standing poses 0.09 to 0.18 m (the pecking head swings out).
const TUCK_W = 0.2;
const SYM_FROM = 0.3; // the symmetry measure applies only to a bird whose top view reaches farther than this from the axis
const MUST_TUCK = new Set(['stand', 'peck', 'walk']);
if (!existsSync(resolve(dir, 'index.html'))) throw new Error('no index.html in ' + dir);
const req = createRequire(resolve(dir, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
process.chdir(dir);
const kill = setTimeout(() => { console.error('ravenwing_check: hard timeout'); process.exit(2); }, 10 * 60 * 1000);
const server = await vite.createServer({
  root: dir, configFile: resolve(dir, 'vite.config.ts'), cacheDir: resolve(dir, 'node_modules/.vite-ravenwing'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let code = 0;
const errors = [];

// The poses. Each is [name, gait(4), look(4), fx(4), fx2(4), uTime]. Layouts (see the top of src/render/models/shader.ts):
//   gait = (walk phase, speed, flap weight, 0)   look = (coat, seed, wing fold, 0)   fx = (peck, altitude m, effort, 0)
//   fx2  = (hop 0..1 or -1, walk phase or -1, seconds into a takeoff or -1, flutter 0..1)
function poses() {
  const P = [];
  const seeds = [0.07, 0.31, 0.58, 0.83];
  const add = (name, o) => P.push({ symMin: symMinOf(name), name, gait: o.gait ?? [0, 0, 0, 0], look: o.look ?? [0.5, 0.3, 0, 0], fx: o.fx ?? [0, 6, 0, 0], fx2: o.fx2 ?? [-1, -1, -1, 0], t: o.t ?? 1.0 });
  // standing on the ground, folded, with and without the peck and the walk
  for (const s of seeds) {
    add('stand s' + s, { look: [0.5, s, 1, 0], fx: [0, 0, 0, 0], t: 3 + 11 * s });
    add('peck s' + s, { look: [0.5, s, 1, 0], fx: [0.5 + 0.5 * s, 0, 0, 0], t: 2 + 5 * s });
    for (const w of [0, 0.25, 0.5, 0.75]) add('walk s' + s + ' w' + w, { look: [0.5, s, 1, 0], fx: [0, 0, 0, 0], fx2: [-1, w, -1, 0], t: 4 + w });
  }
  // glide: held wings, the dihedral drifting over time, each seed
  for (const s of seeds) for (let k = 0; k < 8; k++) add('glide s' + s + ' k' + k, { look: [0.5, s, 0, 0], fx: [0, 8, 0, 0], t: 3 * k + 20 * s });
  // a full flap cycle (3.4 Hz, and the effort-scaled rates): 16 steps over 0.7 s per seed, forced to beat (flap weight 1, effort 0 and 1)
  for (const s of seeds) for (const ef of [0, 1]) for (let k = 0; k < 16; k++) add('flap s' + s + ' e' + ef + ' k' + k, { gait: [0, 0, 1, 0], look: [0.5, s, 0, 0], fx: [0, 8, ef, 0], t: 5 + 0.7 * k / 16 });
  // every fold weight, standing and flapping (the landing and the lift-off blend through all of these)
  for (const s of seeds) for (const f of [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1]) for (const fl of [0, 0.5, 1]) for (const k of [0, 1, 2]) {
    add('blend s' + s + ' fold' + f + ' flap' + fl + ' k' + k, { gait: [0, 0, fl, 0], look: [0.5, s, f, 0], fx: [0, 0.5, 0.3, 0], t: 9 + 0.23 * k + 3 * s });
  }
  // the takeoff: seconds into it from 0 to the end of the leap and a little beyond, from a standing (fold 1) and an already half open wing
  for (const s of seeds) for (const f of [1, 0.6, 0]) for (let k = 0; k <= 30; k++) {
    const tk = 0.04 * k;
    add('takeoff s' + s + ' fold' + f + ' t' + tk.toFixed(2), { gait: [0, 0, tk > 0.3 ? 1 : 0, 0], look: [0.5, s, f, 0], fx: [0, 0, 0.6, 0], fx2: [-1, -1, tk, 0], t: 6 + tk });
  }
  // the hop: 0..1, wings flicked half open
  for (const s of seeds) for (let k = 0; k <= 20; k++) add('hop s' + s + ' u' + (k / 20).toFixed(2), { look: [0.5, s, 1, 0], fx: [0, 0, 0, 0], fx2: [k / 20, -1, -1, 0], t: 7 + k * 0.01 });
  // the flutter back from a wolf: weight 0..1 with the 9 rad/s beat running
  for (const s of seeds) for (const w of [0.05, 0.3, 0.6, 1]) for (let k = 0; k < 8; k++) add('flutter s' + s + ' w' + w + ' k' + k, { look: [0.5, s, 1, 0], fx: [0, 0, 0, 0], fx2: [-1, -1, -1, w], t: 8 + 0.08 * k });
  // a hop landing while the fold is still easing in, and a takeoff while a flutter is on (mixed states that the sim can overlap)
  for (const s of seeds) for (let k = 0; k <= 10; k++) {
    add('mix hop+flutter s' + s + ' k' + k, { look: [0.5, s, 0.7, 0], fx: [0, 0, 0, 0], fx2: [k / 10, -1, -1, 0.5], t: 8 + 0.05 * k });
    add('mix takeoff+flutter s' + s + ' k' + k, { look: [0.5, s, 0.4, 0], fx: [0, 0, 0.5, 0], fx2: [-1, -1, 0.07 * k, 0.5], t: 8 + 0.05 * k });
    add('mix walk+hop s' + s + ' k' + k, { look: [0.5, s, 1, 0], fx: [0, 0, 0, 0], fx2: [k / 10, k / 10, -1, 0], t: 8 + 0.05 * k });
  }
  return P;
}

try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 400)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });

  // Take the real raven batch over: stop the game loop and the animal layer, hide the world, put a flat backdrop behind one bird.
  const setup = await page.evaluate(() => {
    const e = window.__engine, A = window.__animals;
    window.__speed(0);
    e.stop();
    e.frameCbs.length = 0; e.preRenderCbs.length = 0;
    e.cam.update = () => {};
    A.update = () => {}; A.commit = () => {};
    const b = A.batches.find((x) => x && x.def.params.kind === 2 && !x.def.params.raptor);
    if (!b) return { error: 'no raven batch' };
    window.__lab = { e, A, b };
    // rest-pose bound: the largest distance of a vertex from the body centre (0, comY, 0)
    const pos = b.def.geometry.getAttribute('position');
    const cy = b.def.params.comY ?? 0.15;
    let r0 = 0, rxz = 0, ymin = 1e9, ymax = -1e9;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) - cy, z = pos.getZ(i);
      r0 = Math.max(r0, Math.hypot(x, y, z)); rxz = Math.max(rxz, Math.hypot(x, z)); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    }
    return { r0, rxz, ymin, ymax, cy, bodyLen: b.def.params.length, count: pos.count, batchSp: b.sp };
  });
  if (setup.error) throw new Error(setup.error);
  console.log('rest pose', JSON.stringify(setup));
  const limit = setup.rxz + MARGIN;       // horizontal reach limit (m), from the rest pose
  const limitH = 2 * (setup.r0 + MARGIN); // silhouette height limit in the side and front views (m)

  // Scene prep (one evaluate): hide everything but the raven mesh, add the backdrop sphere.
  await page.evaluate(() => {
    const { e, b } = window.__lab;
    const keep = new Set();
    for (let o = b.mesh; o; o = o.parent) keep.add(o);
    e.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o !== b.mesh) o.visible = false; });
    for (const o of keep) o.visible = true;
    b.mesh.visible = true;
    if (b.nearMesh) b.nearMesh.visible = false;
  });

  // The backdrop needs THREE classes: pull them from the page's module graph (the same instance the game uses).
  await page.evaluate(async () => {
    // the page's own three instance (vite pre-bundles it; the bare specifier does not resolve from here)
    const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /three[^/]*\.js(\?|$)/.test(n) && !/examples/.test(n));
    const T = await import(url);
    const { e, b } = window.__lab;
    const sphere = new T.Mesh(new T.SphereGeometry(300, 24, 16), new T.MeshBasicMaterial({ color: 0xff00ff, side: T.BackSide, toneMapped: false, fog: false }));
    sphere.frustumCulled = false;
    e.scene.add(sphere);
    window.__lab.T = T; window.__lab.sphere = sphere;
    e.camera.far = Math.max(e.camera.far, 1200); e.camera.near = 1; e.camera.fov = 10; e.camera.updateProjectionMatrix();
    void b;
  });

  const views = [
    { name: 'top', cam: [0, 40, 0], look: [0, 0.15, 0], up: [1, 0, 0] },
    { name: 'side', cam: [0, 0.15, 40], look: [0, 0.15, 0], up: [0, 1, 0] },
    { name: 'front', cam: [40, 0.15, 0], look: [0, 0.15, 0], up: [0, 1, 0] },
    { name: 'q3', cam: [24, 22, 24], look: [0, 0.15, 0], up: [0, 1, 0] },
  ];
  let P = poses();
  if (replayFile) {
    // real rows logged from the running game (gait, look, fx, fx2, the clock and the instance scale): an even sample of them, always including the extremes of the fold and the takeoff
    const L = JSON.parse(readFileSync(resolve(replayFile), 'utf8'));
    const rows = L.map((r, i) => ({ name: 'game#' + i + ' fold' + r.l[2].toFixed(2) + ' flap' + r.g[2].toFixed(2) + ' hop' + r.f2[0].toFixed(2) + ' tk' + r.f2[2].toFixed(2), gait: r.g, look: r.l, fx: r.f, fx2: r.f2, t: r.t, sc: Math.hypot(r.m[0], r.m[1], r.m[2]) }));
    const step = Math.max(1, Math.floor(rows.length / replayMax));
    P = rows.filter((_, i) => i % step === 0);
    console.log('replaying', P.length, 'of', rows.length, 'logged rows');
  }
  console.log('poses', P.length, 'views', views.length);

  // The renderer helpers, installed once: shoot(pose, view) draws one frame and returns the pixels; proj() maps a model point to pixels.
  await page.evaluate(({ cy }) => {
    const { e, A, b, T } = window.__lab;
    const cam = e.camera, ren = e.renderer;
    const OY = 50; // the bird hangs at y = 50 over nothing (no terrain is drawn anyway)
    const cv = ren.domElement;
    const w = cv.width, h = cv.height;
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    const mat = b.mesh.instanceMatrix.array;
    const set = (arr, v) => { for (let i = 0; i < 4; i++) arr.array[i] = v[i]; arr.needsUpdate = true; };
    window.__lab.shoot = (pose, v, readPixels = true) => {
      b.nView = pose ? 1 : 0; b.count = pose ? 1 : 0; b.mesh.count = b.nView;
      if (pose) { const sc = pose.sc ?? 1; mat.fill(0); mat[0] = sc; mat[5] = sc; mat[10] = sc; mat[15] = 1; mat[13] = OY; b.mesh.instanceMatrix.needsUpdate = true; set(b.gait, pose.gait); set(b.look, pose.look); set(b.fx, pose.fx); set(b.fx2, pose.fx2); A.uTime.value = pose.t; e.time = pose.t; e.uniforms.time.value = pose.t; }
      cam.fov = v.fov ?? 10;
      cam.updateProjectionMatrix();
      cam.position.set(v.cam[0], v.cam[1] + OY, v.cam[2]);
      cam.up.set(v.up[0], v.up[1], v.up[2]);
      cam.lookAt(v.look[0], v.look[1] + OY, v.look[2]);
      cam.updateMatrixWorld();
      window.__lab.sphere.position.set(0, OY, 0);
      e.renderOnce(0);
      if (!readPixels) return null;
      ctx.drawImage(cv, 0, 0);
      return ctx.getImageData(0, 0, w, h).data;
    };
    window.__lab.proj = (x, y, z) => { const p = new T.Vector3(x, y + OY, z).project(cam); return [(p.x * 0.5 + 0.5) * w, (1 - (p.y * 0.5 + 0.5)) * h]; };
    window.__lab.dims = { w, h, OY, cy };
  }, { cy: setup.cy });

  if (gallery) {
    // picture mode: every matching pose in three views, 8 poses per row group
    const rx = new RegExp(gallery);
    const pick = P.filter((q) => rx.test(q.name)).slice(0, 40);
    console.log('gallery poses', pick.length);
    const png = await page.evaluate(({ pick, views }) => {
      const { shoot, proj, dims } = window.__lab;
      const tile = 360, pad = 2, vs = [views[0], views[1], { name: 'q', cam: [-1.6, 0.9, 1.9], look: [0, 0.2, 0], up: [0, 1, 0], fov: 50 }];
      const cols = vs.length, rows = pick.length;
      const sc = document.createElement('canvas'); sc.width = cols * (tile + pad); sc.height = rows * (tile + pad);
      const sx = sc.getContext('2d'); sx.fillStyle = '#222'; sx.fillRect(0, 0, sc.width, sc.height);
      pick.forEach((pose, r) => vs.forEach((v, c) => {
        shoot(pose, v, false);
        const o = proj(0, dims.cy, 0), cv = window.__lab.e.renderer.domElement;
        const S = v.fov > 20 ? Math.min(cv.width, cv.height) : 220;
        sx.drawImage(cv, o[0] - S / 2, o[1] - S / 2, S, S, c * (tile + pad), r * (tile + pad), tile, tile);
        sx.fillStyle = '#fff'; sx.font = '11px monospace'; sx.fillText(v.name + ' ' + pose.name.slice(0, 34), c * (tile + pad) + 3, r * (tile + pad) + 12);
      }));
      return sc.toDataURL('image/png');
    }, { pick, views });
    writeFileSync(`${out}/ravenwing_${tag}_gallery.png`, Buffer.from(png.split(',')[1], 'base64'));
    console.log('wrote', `${out}/ravenwing_${tag}_gallery.png`);
    throw new Error('gallery done');
  }

  const res = await page.evaluate(({ P, views, limit, limitH, wantSheet, TUCK_W, SYM_FROM, MUST_TUCK }) => {
    const { shoot, proj, dims } = window.__lab;
    const { w, h, cy } = dims;
    const cv = window.__lab.e.renderer.domElement;
    const results = [];
    const sheet = [];
    const mask = new Uint8Array(w * h);
    for (const v of views) {
      const bg = shoot(null, v).slice();
      const o = proj(0, cy, 0), ox = proj(1, cy, 0), oy = proj(0, cy + 1, 0), oz = proj(0, cy, 1);
      // pixels per metre in the image plane, from a 1 m step along each world axis (the camera is almost orthographic: 10 deg field of view at 40 m)
      const ppm = Math.max(Math.hypot(ox[0] - o[0], ox[1] - o[1]), Math.hypot(oy[0] - o[0], oy[1] - o[1]), Math.hypot(oz[0] - o[0], oz[1] - o[1]));
      for (let pi = 0; pi < P.length; pi++) {
        const pose = P[pi];
        const img = shoot(pose, v);
        let n = 0, rmax = 0, ax = 0, ay = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        mask.fill(0);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const d = Math.abs(img[i] - bg[i]) + Math.abs(img[i + 1] - bg[i + 1]) + Math.abs(img[i + 2] - bg[i + 2]);
          if (d < 60) continue;
          mask[y * w + x] = 1;
          n++;
          const dx = x - o[0], dy = y - o[1];
          const r = Math.hypot(dx, dy);
          if (r > rmax) { rmax = r; ax = dx; ay = dy; }
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        // wing symmetry (top view): the two wings of a pose are driven by the same weights, so the silhouette on the left of the body axis must
        // match the mirror image of the right one (IoU of the two halves, leaving out the strip around the axis where the head, tail and body are)
        let sym = 1;
        if (v.name === 'top') {
          let inter = 0, uni = 0;
          const strip = Math.round(0.12 * ppm * (pose.sc ?? 1)), ox = Math.round(o[0]);
          for (let y = 0; y < h; y++) for (let dx = strip; dx < ox && ox + dx < w; dx++) {
            const a = mask[y * w + ox - dx], c = mask[y * w + ox + dx];
            if (a && c) inter++;
            if (a || c) uni++;
          }
          sym = uni >= 150 ? inter / uni : 1; // (a few stray pixels beyond the strip, a head turned or a wing tip just out, are nothing to compare)
        }
        const sc = pose.sc ?? 1; // (everything is measured in model metres: the instance scale is divided out)
        let latPx = 0; // sideways reach from the body axis (the top view's horizontal) of the bird itself: the pixels joined to the body centre (the dust motes drifting round it are not)
        if (v.name === 'top') {
          const seen = new Uint8Array(w * h), stack = [];
          const sx0 = Math.round(o[0]), sy0 = Math.round(o[1]);
          let start = -1;
          for (let r = 0; r < 12 && start < 0; r++) for (let yy = sy0 - r; yy <= sy0 + r && start < 0; yy++) for (let xx = sx0 - r; xx <= sx0 + r; xx++) if (mask[yy * w + xx]) { start = yy * w + xx; break; }
          if (start >= 0) {
            stack.push(start); seen[start] = 1;
            while (stack.length) {
              const q = stack.pop(), qx = q % w, qy = (q - qx) / w;
              latPx = Math.max(latPx, Math.abs(qx - o[0]));
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = qx + dx, ny = qy + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ni = ny * w + nx;
                if (mask[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
              }
            }
          }
        }
        const lat = latPx / ppm / sc;
        const tucked = v.name === 'top' && lat <= TUCK_W;
        if (v.name === 'top' && lat <= SYM_FROM) sym = 1; // (a bird that is folded, or only a little open, has no wing out to compare; a twisting body fools the measure)
        const reach = rmax / ppm / sc; // metres from the body centre's projection (top view: the horizontal radius)
        const hx = Math.max(Math.abs(x0 - o[0]), Math.abs(x1 - o[0])) / ppm / sc; // horizontal reach in the side and front views
        const height = (y1 - y0) / ppm / sc;
        let bad = null;
        if (n === 0) bad = 'no pixels';
        else if (v.name === 'top' && MUST_TUCK.includes(pose.name.split(' ')[0]) && !tucked) bad = 'a standing wing sticks out sideways: ' + lat.toFixed(2) + ' m from the axis > ' + TUCK_W;
        else if (v.name === 'top' && sym < (pose.symMin ?? 0)) bad = 'wings differ: left/right silhouette overlap ' + sym.toFixed(2) + ' < ' + pose.symMin;
        else if (v.name === 'top' && reach > limit) bad = 'top radius ' + reach.toFixed(2) + ' > ' + limit.toFixed(2);
        else if ((v.name === 'side' || v.name === 'front') && hx > limit) bad = v.name + ' reach ' + hx.toFixed(2) + ' > ' + limit.toFixed(2);
        else if ((v.name === 'side' || v.name === 'front') && height > limitH) bad = v.name + ' height ' + height.toFixed(2) + ' > ' + limitH.toFixed(2);
        results.push({ pose: pose.name, view: v.name, n, sym: +sym.toFixed(3), reach: +reach.toFixed(3), hx: +hx.toFixed(3), height: +height.toFixed(3), bad });
        if (wantSheet) sheet.push({ key: results.length - 1, score: v.name === 'top' ? reach : Math.max(hx, height / 2), view: v.name, bad, pose: pose.name });
      }
    }
    // the sheet: the worst 2 poses per view as crops (re-rendered), plus a fixed reference row of calm poses
    let sheetPng = null;
    if (wantSheet) {
      const tiles = [];
      const tile = 240, pad = 4;
      const pick = [];
      for (const v of views.slice(0, 3)) {
        const worst = sheet.filter((s) => s.view === v.name).sort((a, b2) => b2.score - a.score).slice(0, 4);
        for (const wv of worst) pick.push({ v, wv });
      }
      const cols = 4, rows = Math.ceil(pick.length / cols);
      const sc = document.createElement('canvas'); sc.width = cols * (tile + pad); sc.height = rows * (tile + pad) + 0;
      const sx = sc.getContext('2d'); sx.fillStyle = '#222'; sx.fillRect(0, 0, sc.width, sc.height);
      pick.forEach((pk, i) => {
        const pose = P.find((q) => q.name === pk.wv.pose);
        const img = shoot(pose, pk.v);
        void img;
        const o2 = proj(0, cy, 0);
        const sizePx = tile * 1.0;
        const col = i % cols, row = Math.floor(i / cols);
        sx.drawImage(cv, o2[0] - sizePx * 1.25, o2[1] - sizePx * 1.25, sizePx * 2.5, sizePx * 2.5, col * (tile + pad), row * (tile + pad), tile, tile);
        sx.fillStyle = '#fff'; sx.font = '11px monospace';
        sx.fillText(pk.v.name + ' ' + pk.wv.pose.slice(0, 30), col * (tile + pad) + 4, row * (tile + pad) + 13);
        sx.fillText(pk.wv.score.toFixed(2) + ' m', col * (tile + pad) + 4, row * (tile + pad) + 27);
      });
      sheetPng = sc.toDataURL('image/png');
    }
    return { results, sheetPng, w, h };
  }, { P, views, limit, limitH, wantSheet, TUCK_W, SYM_FROM, MUST_TUCK: [...MUST_TUCK] });

  const bad = res.results.filter((r) => r.bad);
  const worstTop = res.results.filter((r) => r.view === 'top').sort((a, b) => b.reach - a.reach)[0];
  const worstH = res.results.filter((r) => r.view !== 'top' && r.view !== 'q3').sort((a, b) => Math.max(b.hx, b.height / 2) - Math.max(a.hx, a.height / 2))[0];
  console.log(`renders ${res.results.length} (canvas ${res.w}x${res.h}), limit radius ${limit.toFixed(2)} m, limit height ${limitH.toFixed(2)} m`);
  console.log('worst top radius', JSON.stringify(worstTop));
  console.log('worst side/front', JSON.stringify(worstH));
  const worstSym = res.results.filter((r) => r.view === 'top').sort((a, b) => a.sym - b.sym)[0];
  const symAll = res.results.filter((r) => r.view === 'top').map((r) => r.sym).sort((a, b) => a - b);
  console.log('least symmetric wings', JSON.stringify(worstSym), 'median sym', symAll[symAll.length >> 1], '5th percentile', symAll[Math.floor(symAll.length * 0.05)]);
  const byKind = {};
  for (const r of bad) { const k = r.pose.replace(/ s[\d.]+.*$/, ''); byKind[k] = (byKind[k] ?? 0) + 1; }
  console.log('failing renders', bad.length, JSON.stringify(byKind));
  for (const r of bad.slice(0, 12)) console.log('  FAIL', r.pose, r.view, r.bad);
  writeFileSync(`${out}/ravenwing_${tag}.json`, JSON.stringify({ limit, limitH, setup, bad: bad.length, total: res.results.length, worstTop, worstH, failing: bad.slice(0, 200), all: res.results }, null, 1));
  if (res.sheetPng) writeFileSync(`${out}/ravenwing_${tag}_worst.png`, Buffer.from(res.sheetPng.split(',')[1], 'base64'));
  console.log(bad.length ? `RAVEN WING CHECK FAILED: ${bad.length} of ${res.results.length} renders` : `RAVEN WING CHECK PASSED: ${res.results.length} renders`);
  if (bad.length) code = 1;
} catch (e) {
  if (e.message === 'gallery done') code = 0;
  else { console.error('ravenwing_check failed:', e.message); code = 3; }
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'PAGE ERRORS:\n' + uniq.join('\n') : 'no page exceptions or console errors');
process.exit(code);
