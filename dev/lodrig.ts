// R7: the near LOD must share the far LOD's rig (hip, knee and foot of both leg pairs, which the shader reads from the far mesh), and every
// vertex must be well formed. Prints the rig differences in mm. Exit code 1 when a rig differs by more than 5 mm.
//   npx tsx dev/lodrig.ts
import { SPECIES } from '../src/sim/species';
import { getModel } from '../src/render/models';
import { legRigOf } from '../src/render/models/legmath';

let bad = 0;
for (let sp = 0; sp < SPECIES.length; sp++) {
  const m = getModel(sp);
  if (!m || !m.nearGeometry) continue;
  const a = legRigOf(m.geometry as never), b = legRigOf(m.nearGeometry as never);
  let worst = 0;
  for (const leg of ['front', 'hind'] as const) {
    for (const k of ['hip', 'knee', 'foot'] as const) {
      for (let i = 0; i < 2; i++) worst = Math.max(worst, Math.abs(a[leg][k][i] - b[leg][k][i]));
    }
  }
  const g = m.nearGeometry;
  const part = g.getAttribute('aPart').array, pos = g.getAttribute('position').array, shade = g.getAttribute('aShade').array;
  let nan = 0, headW = 0, badAo = 0;
  for (let i = 0; i < g.getAttribute('position').count; i++) {
    if (!isFinite(pos[i * 3]) || !isFinite(pos[i * 3 + 1]) || !isFinite(pos[i * 3 + 2])) nan++;
    if (Math.round(part[i * 4]) === 5 && (part[i * 4 + 1] < 0 || part[i * 4 + 1] > 1)) headW++;
    if (shade[i * 3] < 0 || shade[i * 3] > 0.71) badAo++;
  }
  console.log(SPECIES[sp].key.padEnd(10), 'rig diff', (worst * 1000).toFixed(2), 'mm', 'nonfinite', nan, 'bad head weights', headW, 'bad AO', badAo);
  if (worst > 0.005 || nan || headW || badAo) bad++;
}
process.exit(bad ? 1 : 0);
