// a3 spike: 1x clips and frame strips of one animal on the dev lineup page (manual clock: exact 30 fps, nothing dropped), to check that the
// feet stay planted and nothing tears at the joints. Fixed camera for a walk (a planted foot stays put on screen while the body passes),
// a following camera otherwise.
//   node tools/a3clip.mjs --out review/wip/a3-spike/clips [--sp bison,wolf] [--poses walk,run] [--a3 1] [--secs 4] [--dist 9]
// Writes <out>/<sp>_<pose>_<off|a3>.mp4 and <sp>_<pose>_<off|a3>_strip.jpg (8 frames 4 apart).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'review/wip/a3-spike/clips'));
const sps = arg('sp', 'bison,wolf').split(',');
const poses = arg('poses', 'walk,run').split(',');
const modes = arg('a3', '1').split(',');
const secs = Number(arg('secs', '4'));
const dist = Number(arg('dist', '9'));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const SPNUM = { bison: 0, wolf: 1 };
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('a3clip: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_a3clip'),
  server: { port: 5800 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  for (const sp of sps) for (const mode of modes) for (const pose of poses) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
    const fixed = pose === 'walk';
    await page.goto(`${base}/dev/animals.html?cam=lineup&only=${sp}&focus=${fixed ? 'none' : SPNUM[sp]}&a3=${mode}&az=100&el=8&dist=${dist}&fov=30&manual=1&move=1&pose=${pose}`, { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => typeof window.__advance === 'function', null, { timeout: 240000 });
    const tag = `${sp}_${pose}_${mode === '0' ? 'off' : 'a3'}`;
    const dir = resolve(out, '_f_' + tag);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 60; i++) await page.evaluate(() => window.__advance(1 / 60)); // settle (the layer eases into the gait)
    const n = Math.round(secs * 30);
    for (let k = 0; k < n; k++) {
      await page.evaluate(() => { window.__advance(1 / 60); window.__advance(1 / 60); });
      await page.screenshot({ path: resolve(dir, `f${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 });
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', resolve(dir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', resolve(out, tag + '.mp4')]);
    // strip: 8 frames, 4 apart, from the middle of the clip
    const start = Math.floor(n / 2) - 16;
    const picks = [0, 1, 2, 3, 4, 5, 6, 7].map((j) => resolve(dir, `f${String(start + j * 4).padStart(4, '0')}.jpg`));
    const list = resolve(dir, 'list.txt');
    writeFileSync(list, picks.map((p) => `file '${p.split(String.fromCharCode(92)).join('/')}'\nduration 1`).join('\n') + '\n');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'crop=iw*0.62:ih*0.62:iw*0.19:ih*0.25,tile=4x2', '-frames:v', '1', '-q:v', '3', resolve(out, tag + '_strip.jpg')]);
    rmSync(dir, { recursive: true, force: true });
    console.log('saved', tag);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
