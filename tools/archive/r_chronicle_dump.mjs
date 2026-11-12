// Chronicle text dump: runs ten valley years at 10x in the real page and writes every chronicle line, oldest first, to a text file,
// then reports verbatim repeats (anywhere in the run, and within any 30 consecutive lines).
//   node tools/r_chronicle_dump.mjs [out=review/wip/overlay-chronicle/chronicle_dump.txt] [years=10] [seed=tallgrass]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const out = resolve(process.argv[2] ?? 'review/wip/overlay-chronicle/chronicle_dump.txt');
const years = Number(process.argv[3] ?? 10);
const seed = process.argv[4] ?? 'tallgrass';
mkdirSync(dirname(out), { recursive: true });
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/rov/.vitecache'), server: { port: 7900 + Math.floor(Math.random() * 90), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => { errors.push(e.message.slice(0, 300)); console.log('[exc]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text().slice(0, 300)); console.log('[console.error]', m.text().slice(0, 300)); } });
try {
  await page.goto(`${base}/index.html?autoscale=0&autocam=0&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });

  await page.evaluate(async (years) => {
    window.__speed(10);
    const YEAR = 2400;
    const start = window.__snap().tick;
    const goal = start + years * YEAR;
    for (let guard = 0; guard < 3000 && window.__snap().tick < goal; guard++) {
      const prev = window.__snap();
      window.__step(300);
      for (let i = 0; i < 600 && window.__snap() === prev; i++) await new Promise((r) => setTimeout(r, 15));
      await new Promise((r) => setTimeout(r, 30));
    }
  }, years);
  await page.waitForTimeout(1500);
  const lines = await page.evaluate(() => {
    const c = window.__ui.chron;
    return c.entries.filter((e) => e.year <= 10).sort((a, b) => a.tick - b.tick || (c.seq.get(a) ?? 0) - (c.seq.get(b) ?? 0)).map((e) => ({ tick: e.tick, year: e.year, text: e.sentence }));
  });
  const txt = lines.map((l, i) => `${String(i + 1).padStart(3)}  Y${String(l.year).padStart(2)}  ${l.text}`).join('\n');
  writeFileSync(out, txt + '\n');
  // verbatim repeats: anywhere in the run, and inside any window of 30 consecutive lines
  const seen = new Map();
  const dups = [];
  lines.forEach((l, i) => { if (seen.has(l.text)) dups.push(`line ${seen.get(l.text) + 1} and ${i + 1}: ${l.text}`); else seen.set(l.text, i); });
  let worst = 0;
  for (let i = 0; i + 30 <= lines.length; i++) {
    const w = lines.slice(i, i + 30).map((l) => l.text);
    worst = Math.max(worst, w.length - new Set(w).size);
  }
  console.log(`lines ${lines.length}, years ${lines[0]?.year}..${lines[lines.length - 1]?.year}`);
  console.log(`verbatim repeats anywhere: ${dups.length}`);
  for (const d of dups) console.log('  ' + d);
  console.log(`worst repeats inside any 30-line window: ${worst}`);
  console.log('errors', errors.length);
} finally {
  clearTimeout(to);
  await browser.close();
  await server.close();
}
process.exit(0);
