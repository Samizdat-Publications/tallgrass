#!/usr/bin/env node
/**
 * Finishes a built landing site for Cloudflare Pages (from the showcase kit):
 *
 *   node finish-site.mjs <site-dist> [--root <repo root>]
 *
 * - writes <site-dist>/_headers (long cache for media and fonts, a day for /play/assets)
 * - routes only the .mp4 files through functions/media/[[path]].js (byte ranges, so Safari plays them)
 *   by writing <site-dist>/_routes.json and <root>/functions/media/sizes.json
 * - fails if any file is over Cloudflare's 25 MiB per-file limit
 *
 * Copy the kit's cloudflare/functions/media/[[path]].js into <root>/functions/media/ once.
 * Adapted from woolgather/tools/build-site.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const out = path.resolve(args[0] ?? 'site-dist');
const rootIdx = args.indexOf('--root');
const root = path.resolve(rootIdx >= 0 ? args[rootIdx + 1] : path.dirname(out));

fs.writeFileSync(
  path.join(out, '_headers'),
  ['/media/*', '  Cache-Control: public, max-age=604800', '/fonts/*', '  Cache-Control: public, max-age=31536000, immutable', '/play/assets/*', '  Cache-Control: public, max-age=86400', ''].join('\n'),
);

const mediaDir = path.join(out, 'media');
const videos = fs.existsSync(mediaDir)
  ? fs.readdirSync(mediaDir, { recursive: true }).filter((f) => String(f).endsWith('.mp4')).map((f) => `/media/${String(f).replaceAll('\\', '/')}`)
  : [];
if (videos.length) {
  fs.writeFileSync(path.join(out, '_routes.json'), JSON.stringify({ version: 1, include: videos, exclude: [] }, null, 1));
  const sizes = Object.fromEntries(videos.map((v) => [v, fs.statSync(path.join(out, v)).size]));
  fs.mkdirSync(path.join(root, 'functions/media'), { recursive: true });
  fs.writeFileSync(path.join(root, 'functions/media/sizes.json'), `${JSON.stringify(sizes, null, 1)}\n`);
  if (!fs.existsSync(path.join(root, 'functions/media/[[path]].js'))) {
    console.warn('warning: functions/media/[[path]].js is missing; copy it from the showcase kit or Safari will not play the videos');
  }
}

const files = fs.readdirSync(out, { recursive: true, withFileTypes: true }).filter((d) => d.isFile());
const bytes = files.reduce((s, d) => s + fs.statSync(path.join(d.parentPath, d.name)).size, 0);
console.log(`${path.basename(out)}: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB, ${videos.length} videos`);
const tooBig = files.map((d) => path.join(d.parentPath, d.name)).filter((f) => fs.statSync(f).size > 25 * 1024 * 1024);
if (tooBig.length) throw new Error(`over the 25 MiB Cloudflare Pages limit:\n${tooBig.join('\n')}`);
if (files.length > 20000) throw new Error('over the 20,000 file Cloudflare Pages limit');
