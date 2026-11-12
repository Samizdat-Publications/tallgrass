// Prints a window of a saved camera log: node tools/camdump.mjs file.json fromSeconds toSeconds [every=1]
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const L = j.log, S = j.stride ?? 9, a = Number(process.argv[3]), b = Number(process.argv[4]), every = Number(process.argv[5] ?? 1);
const f = (x) => (x === undefined ? '-' : (+x).toFixed(2));
for (let i = 0; i < L.length / S; i += every) {
  const o = i * S, t = L[o];
  if (t < a || t > b) continue;
  console.log(`t=${f(t)} dt=${(L[o + 1] * 1000).toFixed(0)} cam=(${f(L[o + 2])},${f(L[o + 3])},${f(L[o + 4])}) foc=(${f(L[o + 5])},${f(L[o + 6])},${f(L[o + 7])}) cut=${L[o + 8]} boom=${f(L[o + 9])} swing=${f(L[o + 10])}`);
}
