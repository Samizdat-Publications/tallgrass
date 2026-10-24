// Showcase cut: turns chosen segments of a showcase take (tools/showcase_take.mjs) into the landing page and hub media, within the
// showcase kit's limits: site/media/hero.mp4 (H.264, faststart, no audio, under 8 MB), site/media/hero.jpg (1280x720 poster),
// site/media/og.jpg (1200x630 social card) and docs/media/hero.gif (640 px, 12 fps, under 10 MB).
//
// Usage: node tools/showcase_cut.mjs --take scratch/take1/take.mp4 --segs "12.5-20,44-52" [--poster 15.2] [--out site/media] [--gif docs/media/hero.gif] [--gifsecs 8]
// Segments are joined with a short crossfade. The poster and the social card come from --poster (seconds into the take).
import { execFileSync } from 'node:child_process';
import { statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const take = resolve(arg('take', ''));
const segs = arg('segs', '').split(',').filter(Boolean).map((s) => s.split('-').map(Number));
const posterT = Number(arg('poster', String(segs[0]?.[0] ?? 0)));
const outDir = resolve(arg('out', 'site/media'));
const gif = resolve(arg('gif', 'docs/media/hero.gif'));
const XF = 0.6; // crossfade seconds between segments
const gifSecs = Number(arg('gifsecs', '8')); // the README gif loops the opening seconds only (grass detail makes long gifs huge)
if (!segs.length) { console.error('give --segs "a-b,c-d"'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(gif), { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// 1. the clip: each segment trimmed and scaled to 1280x720, then chained with xfade
const inputs = [], filters = [];
segs.forEach(([a, b], i) => {
  inputs.push('-ss', String(a), '-t', String(b - a), '-i', take);
  filters.push(`[${i}:v]scale=1280:720:flags=lanczos,fps=30,format=yuv420p,setpts=PTS-STARTPTS[s${i}]`);
});
let last = 's0', offset = segs[0][1] - segs[0][0];
for (let i = 1; i < segs.length; i++) {
  const out = `x${i}`;
  filters.push(`[${last}][s${i}]xfade=transition=fade:duration=${XF}:offset=${(offset - XF).toFixed(3)}[${out}]`);
  offset += segs[i][1] - segs[i][0] - XF;
  last = out;
}
const clip = `${outDir}/hero.mp4`;
for (const crf of [23, 26, 29, 32]) {
  ff([...inputs, '-filter_complex', filters.join(';'), '-map', `[${last}]`, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip]);
  const mb = statSync(clip).size / 1048576;
  console.log(`hero.mp4 at CRF ${crf}: ${mb.toFixed(2)} MB, ${offset.toFixed(1)} s`);
  if (mb < 8) break;
}
// 2. poster and social card from one frame of the take
ff(['-ss', String(posterT), '-i', take, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '3', `${outDir}/hero.jpg`]);
ff(['-ss', String(posterT), '-i', take, '-frames:v', '1', '-vf', 'scale=1200:-2:flags=lanczos,crop=1200:630', '-q:v', '3', `${outDir}/og.jpg`]);
// 3. the README gif: palette pass, 640 px, 12 fps, shrunk until it is under 10 MB
for (const [w, fps] of [[640, 12], [560, 10], [480, 10], [420, 8]]) {
  const pal = `${outDir}/_pal.png`;
  ff(['-t', String(gifSecs), '-i', clip, '-vf', `fps=${fps},scale=${w}:-1:flags=lanczos,palettegen=stats_mode=diff`, pal]);
  ff(['-t', String(gifSecs), '-i', clip, '-i', pal, '-lavfi', `fps=${fps},scale=${w}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, gif]);
  const mb = statSync(gif).size / 1048576;
  console.log(`hero.gif ${w}px ${fps} fps: ${mb.toFixed(2)} MB`);
  if (mb < 10) break;
}
execFileSync(process.execPath, ['-e', `require('fs').rmSync(${JSON.stringify(`${outDir}/_pal.png`)}, { force: true })`]);
console.log('done:', clip, `${outDir}/hero.jpg`, `${outDir}/og.jpg`, gif);
