// Deterministic shot capture of the real game: the fixed shot list in tools/shots.json, rendered by the game page in its ?capture=1 mode
// (src/main.ts, window.__capture). Every shot is the sim paused on an absolute tick, a held env, a placed camera and a fixed number of
// 1/60 s frames; the last frame is read back from the canvas in the same task as its render (never a page screenshot) and saved as a
// lossless PNG. Two runs of the same shot agree to within a little cross-load noise (most are not byte-identical; see --verify), so a
// look change can still be measured pixel for pixel.
//
//   node tools/shots.mjs [--shots all|gate|id,id] [--out artifacts/shots/<stamp>] [--size WxH] [--verify] [--reverse]
//
// --shots    all (default), a tag (gate, or any other tag in shots.json) or a comma list of ids
// --out      output folder (default artifacts/shots/YYYYMMDD-HHMMSS)
// --size     viewport, default the "size" of shots.json
// --verify   render the list twice (every shot in a fresh page load both times) and classify each shot: identical (same sha256), noise
//            (mean absolute RGB difference <= NOISE_MEAN_MAX and share of pixels whose largest channel difference is over 8 <=
//            NOISE_SHARE_OVER_8_MAX) or differs. Prints status, mean, share over 8 and max per shot, records them in manifest.json under
//            "verify", and exits 1 only if a shot differs. The second load's PNGs go to <out>/second/ for every shot that is not identical.
// --reverse  render the list in reverse order (a check that no shot depends on the shots before it)
//
// Writes <id>.png and <id>.json per shot and manifest.json (git commit, dirty flag, GL renderer, size, per-shot sha256, seconds).
// Headless Chromium on the real GPU (the flags of tools/stills.mjs); fails loudly on a software rasterizer. Hard timeouts throughout.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (k) => argv.includes('--' + k);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const SOFTWARE_RE = /swiftshader|llvmpipe|software|basic render|softpipe|microsoft basic/i;
const LAUNCH_ARGS = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
const LOAD_TIMEOUT = 180000;
const SHOT_TIMEOUT = 180000;
// Cross-load noise thresholds, measured 2026-11-12 (two page loads, all 14 shots: mean <= 0.17, share over 8 <= 0.10%). Same values in tools/scorecard.py.
const NOISE_MEAN_MAX = 0.5;
const NOISE_SHARE_OVER_8_MAX = 0.0025;
const NOISE_PIXEL_THRESHOLD = 8;

const list = JSON.parse(readFileSync(resolve(ROOT, 'tools/shots.json'), 'utf8'));
if (list.version !== 1) throw new Error(`tools/shots.json: unknown version ${list.version}`);
const [W, H] = (arg('size', null) ?? `${list.size[0]}x${list.size[1]}`).split('x').map(Number);
const pickArg = arg('shots', 'all');
let shots;
if (pickArg === 'all') shots = list.shots;
else if (list.shots.some((s) => (s.tags ?? []).includes(pickArg))) shots = list.shots.filter((s) => (s.tags ?? []).includes(pickArg));
else {
  const ids = pickArg.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !list.shots.some((s) => s.id === id));
  if (unknown.length) { console.error(`shots: unknown shot id or tag: ${unknown.join(', ')}`); process.exit(1); }
  shots = list.shots.filter((s) => ids.includes(s.id));
}
if (has('reverse')) shots = shots.slice().reverse();
const verify = has('verify');
const stamp = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; })();
const out = resolve(process.cwd(), arg('out', `artifacts/shots/${stamp}`));

// ------------------------------------------------------------------ PNG (RGB, 8 bit, Paeth filter, zlib): deterministic for the same pixels

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** RGBA rows bottom-up (as gl.readPixels gives them) to a PNG of RGB rows top-down. */
function encodePng(rgbaBottomUp, w, h) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) { cur[x * 3] = rgbaBottomUp[src + x * 4]; cur[x * 3 + 1] = rgbaBottomUp[src + x * 4 + 1]; cur[x * 3 + 2] = rgbaBottomUp[src + x * 4 + 2]; }
    const o = y * (stride + 1);
    raw[o] = 4; // Paeth
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? cur[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[o + 1 + i] = (cur[i] - pr) & 255;
    }
    cur.copy(prev);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/**
 * Pixel difference over R, G and B (alpha ignored: always opaque): mean absolute difference over every channel value (0 to 255), largest
 * channel difference, share of pixels where any channel differs, and share of pixels whose largest channel difference is over 8.
 */
function pixelDiff(a, b) {
  let max = 0, n = 0, over = 0, sum = 0;
  const px = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i] - b[i]), dg = Math.abs(a[i + 1] - b[i + 1]), db = Math.abs(a[i + 2] - b[i + 2]);
    sum += dr + dg + db;
    const d = Math.max(dr, dg, db);
    if (d > 0) { n++; if (d > max) max = d; if (d > NOISE_PIXEL_THRESHOLD) over++; }
  }
  return { mean: sum / (px * 3), max, share: n / px, shareOver8: over / px };
}

/** identical (same bytes), noise (within the measured cross-load noise) or differs. */
function classify(same, d) {
  if (same) return 'identical';
  return d.mean <= NOISE_MEAN_MAX && d.shareOver8 <= NOISE_SHARE_OVER_8_MAX ? 'noise' : 'differs';
}

function gitInfo() {
  const run = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };
  const dirty = run(['status', '--porcelain', '--', 'src', 'index.html', 'public', 'vite.config.ts', 'tools/shots.json', 'tools/shots.mjs']);
  return { commit: run(['rev-parse', 'HEAD']), dirty: !!dirty, dirtyFiles: dirty ? dirty.split(/\r?\n/).map((l) => l.trim()) : [] };
}

// ------------------------------------------------------------------ one pass: each shot in its own page load

async function renderPass(browser, base, label) {
  // Every shot gets its own fresh page load: render state that eases or caches across frames (the camera rig, tree level-of-detail
  // bands, eye adaptation, particles) then never carries over from an earlier shot, so a shot is the same in any order or subset.
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const t0 = Date.now();
  const url = `${base}/index.html?capture=1&seed=${encodeURIComponent(list.seed)}&q=high&autoscale=0&autocam=0`;
  const res = [];
  let renderer = null;
  for (const s of shots) {
    const t1 = Date.now();
    const page = await ctx.newPage();
    page.setDefaultTimeout(LOAD_TIMEOUT);
    page.on('pageerror', (e) => console.log(`[${label} ${s.id} page exception]`, e.message.slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[${label} ${s.id} page error]`, m.text().slice(0, 300)); });
    await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT });
    await page.waitForFunction(() => window.__captureReady === true, null, { timeout: LOAD_TIMEOUT });
    const rnd = await page.evaluate(() => window.__capture.renderer);
    if (SOFTWARE_RE.test(rnd) || rnd === 'unknown') throw new Error(`software or unknown GL renderer "${rnd}": refusing to capture`);
    if (renderer === null) { renderer = rnd; console.log(`[${label}] GL renderer: ${renderer}`); }
    const spec = { id: s.id, tick: s.tick, env: s.env, camera: s.camera, frames: s.frames };
    let timer;
    const r = await Promise.race([
      page.evaluate((sp) => window.__capture.shot(sp), spec),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`shot ${s.id} timed out`)), SHOT_TIMEOUT); }),
    ]);
    clearTimeout(timer);
    await page.close();
    if (r.width !== W || r.height !== H) throw new Error(`shot ${s.id}: drawing buffer ${r.width}x${r.height}, expected ${W}x${H}`);
    const rgba = Buffer.from(r.rgbaBottomUp, 'base64');
    const png = encodePng(rgba, r.width, r.height);
    const seconds = (Date.now() - t1) / 1000;
    res.push({ shot: s, rgba, png, sha: sha256(png), camera: r.camera, tick: r.tick, seconds });
    console.log(`[${label}] ${s.id.padEnd(18)} ${seconds.toFixed(1).padStart(5)} s  ${sha256(png).slice(0, 16)}`);
  }
  await ctx.close();
  return { renderer, results: res, seconds: (Date.now() - t0) / 1000 };
}

function writeShot(dir, r) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${r.shot.id}.png`), r.png);
  const s = r.shot;
  const meta = {
    id: s.id, tick: r.tick, env: s.env, camera: { spec: s.camera, resolved: r.camera }, frames: s.frames, size: [W, H],
    sha256: r.sha, seconds: +r.seconds.toFixed(2),
  };
  if (s.reference) meta.reference = s.reference;
  if (s.tags) meta.tags = s.tags;
  writeFileSync(resolve(dir, `${s.id}.json`), JSON.stringify(meta, null, 2) + '\n');
}

// ------------------------------------------------------------------ main

const tStart = Date.now();
const killer = setTimeout(() => { console.error('shots: hard timeout'); process.exit(2); }, (verify ? 2 : 1) * (4 * 60 * 1000 + shots.length * 90 * 1000));
let code = 0, server, browser;
try {
  console.log(`shots: ${shots.length} shot(s) at ${W}x${H}${verify ? ', verify (two page loads)' : ''}${has('reverse') ? ', reverse order' : ''} -> ${out}`);
  const prevCwd = process.cwd();
  process.chdir(ROOT); // (vite.config.ts reads the working directory)
  server = await createServer({
    root: ROOT,
    configFile: resolve(ROOT, 'vite.config.ts'),
    cacheDir: resolve(ROOT, 'node_modules/.vite-shots'),
    server: {
      port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false,
      watch: { ignored: ['**/artifacts/**', '**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**', '**/reference/**'] },
    },
    optimizeDeps: { entries: ['index.html'] },
    logLevel: 'error',
  });
  await server.listen();
  process.chdir(prevCwd);
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch({ headless: true, timeout: 120000, args: LAUNCH_ARGS });
  const a = await renderPass(browser, base, verify ? 'load 1' : 'run');
  for (const r of a.results) writeShot(out, r);
  let verifyReport = null;
  if (verify) {
    const b = await renderPass(browser, base, 'load 2');
    verifyReport = {};
    const counts = { identical: 0, noise: 0, differs: 0 };
    console.log('\nverify: load 1 against load 2');
    console.log(`noise thresholds: mean <= ${NOISE_MEAN_MAX}, share over ${NOISE_PIXEL_THRESHOLD} <= ${(NOISE_SHARE_OVER_8_MAX * 100).toFixed(2)} %`);
    console.log('shot'.padEnd(20) + 'status'.padEnd(11) + 'mean'.padStart(7) + `   over ${NOISE_PIXEL_THRESHOLD}`.padEnd(14) + 'max'.padStart(5) + '  pixels differing');
    for (let i = 0; i < a.results.length; i++) {
      const ra = a.results[i], rb = b.results[i];
      const same = ra.sha === rb.sha;
      const d = same ? { mean: 0, max: 0, share: 0, shareOver8: 0 } : pixelDiff(ra.rgba, rb.rgba);
      const status = classify(same, d);
      counts[status]++;
      if (!same) writeShot(resolve(out, 'second'), rb);
      verifyReport[ra.shot.id] = {
        status, identical: same, meanDiff: +d.mean.toFixed(4), shareOver8: +d.shareOver8.toFixed(6), maxDiff: d.max,
        shareDiffering: +d.share.toFixed(6), sha256: [ra.sha, rb.sha],
      };
      console.log(ra.shot.id.padEnd(20) + (status === 'differs' ? 'DIFFERS' : status).padEnd(11) + d.mean.toFixed(3).padStart(7)
        + `   ${(d.shareOver8 * 100).toFixed(4)} %`.padEnd(14) + String(d.max).padStart(5) + `  ${(d.share * 100).toFixed(4)} %`);
    }
    const tally = `${counts.identical} identical, ${counts.noise} noise, ${counts.differs} differs`;
    console.log(counts.differs ? `\nverify FAILED: ${tally} (of ${a.results.length} shot(s))` : `\nverify passed: ${tally} (of ${a.results.length} shot(s))`);
    if (counts.differs) code = 1;
  }
  const manifest = {
    tool: 'tools/shots.mjs', date: new Date().toISOString(), ...gitInfo(), renderer: a.renderer, size: [W, H], seed: list.seed,
    order: has('reverse') ? 'reverse' : 'list', selection: pickArg,
    shots: Object.fromEntries(a.results.map((r) => [r.shot.id, r.sha])),
    seconds: { total: +((Date.now() - tStart) / 1000).toFixed(1), pass: +a.seconds.toFixed(1), perShot: Object.fromEntries(a.results.map((r) => [r.shot.id, +r.seconds.toFixed(2)])) },
  };
  if (verifyReport) manifest.verify = verifyReport;
  writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nshots: wrote ${a.results.length} shot(s) and manifest.json to ${out} in ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
} catch (e) {
  console.error('shots failed:', e.message);
  code = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* already gone */ }
  try { if (server) await server.close(); } catch { /* already gone */ }
  clearTimeout(killer);
}
process.exit(code);
