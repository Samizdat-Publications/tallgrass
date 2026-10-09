// a3 spike: checks an authored near-LOD mesh (public/models/a3/<species>.bin) against the procedural model's rig.
//   npx tsx tools/a3check.ts [bison wolf]
// Prints the leg rig (hip, knee, foot) the shader reads from each geometry, so any drift of the imported legs from the far LOD's shows up,
// and sanity-checks the labels (part ids, weights, pivots, finite numbers).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildBison } from '../src/render/models/bison';
import { buildWolf } from '../src/render/models/wolf';
import { legRigOf } from '../src/render/models/legmath';

const BUILD: Record<string, () => { geometry: THREE.BufferGeometry }> = { bison: buildBison, wolf: buildWolf };
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['bison', 'wolf'];
let bad = 0;
const f2 = (v: number[]): string => `(${v.map((x) => x.toFixed(3)).join(', ')})`;
for (const key of names) {
  const meta = JSON.parse(readFileSync(`public/models/a3/${key}.json`, 'utf8'));
  const buf = readFileSync(`public/models/a3/${key}.bin`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const g = new THREE.BufferGeometry();
  const n: number = meta.vertices;
  for (const a of meta.attributes as Array<{ name: string; size: number; offset: number }>) {
    g.setAttribute(a.name, new THREE.Float32BufferAttribute(new Float32Array(ab, a.offset, n * a.size).slice(), a.size));
    for (const v of g.getAttribute(a.name).array) if (!Number.isFinite(v)) { console.log('  non-finite value in', a.name); bad++; break; }
  }
  const far = BUILD[key]().geometry;
  const rf = legRigOf(far), rn = legRigOf(g);
  console.log(`${key}: ${n} verts, ${meta.triangles} tris`);
  for (const leg of ['front', 'hind'] as const) {
    const a = rf[leg], b = rn[leg];
    console.log(`  ${leg}: far hip ${f2(a.hip)} knee ${f2(a.knee)} foot ${f2(a.foot)} z ${a.z.toFixed(3)} | a3 hip ${f2(b.hip)} knee ${f2(b.knee)} foot ${f2(b.foot)} z ${b.z.toFixed(3)}`);
    const dh = Math.hypot(a.hip[0] - b.hip[0], a.hip[1] - b.hip[1]), dk = Math.hypot(a.knee[0] - b.knee[0], a.knee[1] - b.knee[1]), df = Math.hypot(a.foot[0] - b.foot[0], a.foot[1] - b.foot[1]);
    console.log(`    drift hip ${(dh * 100).toFixed(1)} cm, knee ${(dk * 100).toFixed(1)} cm, foot ${(df * 100).toFixed(1)} cm`);
    if (dh > 0.02 || dk > 0.02) { console.log('    FAIL: pivots differ from the rig'); bad++; }
    if (df > 0.1) { console.log('    WARN: lowest point of the paw is more than 10 cm from the rig foot'); }
  }
  const part = g.getAttribute('aPart').array;
  const counts = new Array(7).fill(0);
  let wmin = 1, wmax = 0, bmin = 1, bmax = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.round(part[i * 4]);
    if (p < 0 || p > 6) { console.log('  bad part id', p); bad++; break; }
    counts[p]++;
    const w1 = part[i * 4 + 1], wb = part[i * 4 + 3];
    wmin = Math.min(wmin, w1); wmax = Math.max(wmax, w1); bmin = Math.min(bmin, wb); bmax = Math.max(bmax, wb);
  }
  console.log(`  parts [body fl fr hl hr head tail] = ${counts.join(' ')}; w1 ${wmin.toFixed(2)}..${wmax.toFixed(2)}, skin blend ${bmin.toFixed(2)}..${bmax.toFixed(2)}`);
  const pos = g.getAttribute('position');
  const bb = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  console.log(`  bounds x ${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)} y ${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)} z ${bb.min.z.toFixed(2)}..${bb.max.z.toFixed(2)}`);
}
console.log(bad ? `FAILED (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
