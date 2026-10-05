// R7: vertex and triangle counts of the far and near LOD of each quadruped (and how many of the near ones are wool shells).
//   npx tsx dev/lodstats.ts
import { SPECIES } from '../src/sim/species';
import { getModel } from '../src/render/models';

for (let sp = 0; sp < SPECIES.length; sp++) {
  const m = getModel(sp);
  if (!m) continue;
  const row = (g: { getAttribute(n: string): { count: number; array: ArrayLike<number> } | undefined; index: { count: number } | null }) => {
    const pos = g.getAttribute('position')!;
    const sh = g.getAttribute('aShade');
    let shell = 0;
    if (sh) for (let i = 0; i < pos.count; i++) if (sh.array[i * 3 + 1] > 0) shell++;
    return { verts: pos.count, tris: (g.index?.count ?? 0) / 3, shellVerts: shell };
  };
  const far = row(m.geometry as never);
  const near = m.nearGeometry ? row(m.nearGeometry as never) : null;
  console.log(SPECIES[sp].key.padEnd(10), 'far', JSON.stringify(far), 'near', near ? JSON.stringify(near) : '-', m.lod ? `lod ${m.lod.d0}-${m.lod.d1} m` : '');
}
