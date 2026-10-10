// Client for tools/r_life_serve.mjs: node tools/r_life_cmd.mjs [--js "expr" | --file page.js] [--wait ms] [--shot path.jpg] [--reload]
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const dir = resolve('scratch/life_srv');
mkdirSync(dir, { recursive: true });
const name = String(Date.now());
const cmd = {};
if (arg('js', '')) cmd.js = arg('js', '');
if (arg('file', '')) cmd.js = readFileSync(resolve(arg('file', '')), 'utf8');
if (arg('wait', '')) cmd.wait = Number(arg('wait', 0));
if (arg('shot', '')) cmd.shot = arg('shot', '');
if (argv.includes('--reload')) cmd.reload = true;
writeFileSync(resolve(dir, name + '.cmd.json'), JSON.stringify(cmd));
const out = resolve(dir, name + '.out.json');
const t0 = Date.now();
while (!existsSync(out)) { await new Promise((r) => setTimeout(r, 200)); if (Date.now() - t0 > 20 * 60 * 1000) { console.log('timeout'); process.exit(1); } }
await new Promise((r) => setTimeout(r, 100));
console.log(readFileSync(out, 'utf8'));
