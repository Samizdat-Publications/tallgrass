// Contact sheet of stills (JPEG q90), composed in headless Chromium: node tools/r8_sheet.mjs --out sheet.jpg --cols 4 --w 640 [--crop x,y,w,h] a.jpg b.jpg ...
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const files = [];
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1]; i++; } else files.push(resolve(argv[i]));
}
const cols = Number(opt.cols ?? 4), cw = Number(opt.w ?? 640);
const crop = opt.crop ? opt.crop.split(',').map(Number) : null; // x,y,w,h in source pixels
const imgs = files.map((f) => 'data:image/jpeg;base64,' + readFileSync(f).toString('base64'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: cols * cw, height: 800 } });
  const ar = crop ? crop[3] / crop[2] : 9 / 16;
  const ch = Math.round(cw * ar);
  const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${cw}px)">${imgs.map((s, i) => crop
    ? `<div style="width:${cw}px;height:${ch}px;overflow:hidden;position:relative"><img src="${s}" style="position:absolute;left:${-crop[0] * cw / crop[2]}px;top:${-crop[1] * cw / crop[2]}px;width:${1600 * cw / crop[2]}px"><span style="position:absolute;left:4px;top:2px;color:#fff;font:12px monospace">${files[i].split(/[\\/]/).pop().replace(/\.jpg$/, '')}</span></div>`
    : `<div style="position:relative"><img src="${s}" style="width:${cw}px;display:block"><span style="position:absolute;left:4px;top:2px;color:#fff;font:12px monospace">${files[i].split(/[\\/]/).pop().replace(/\.jpg$/, '')}</span></div>`).join('')}</body>`;
  await page.setContent(html);
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(opt.out ?? 'sheet.jpg'), type: 'jpeg', quality: 90, fullPage: true });
  console.log('saved', resolve(opt.out ?? 'sheet.jpg'));
} finally { await browser.close(); }
