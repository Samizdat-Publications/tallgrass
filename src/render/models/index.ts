import * as THREE from 'three';
import { SPECIES } from '../../sim/species';
import { buildBison } from './bison';
import { buildWolf } from './wolf';
import { buildRaven } from './raven';
import { buildPronghorn } from './pronghorn';
import { buildRabbit } from './rabbit';
import { buildCougar } from './cougar';
import { buildCoyote } from './coyote';
import { buildEagle } from './eagle';
import { buildHawk } from './hawk';
import { buildMuleDeer } from './muledeer';
import { buildBeaver } from './beaver';
import type { ModelDef } from './types';
import { a3Tune, getA3 } from './a3';

export type { ModelDef, AnimParams } from './types';

/** Model builders by registry key. A species with no entry here has no model and is not drawn (no crash, no placeholder). */
const BUILDERS: Record<string, () => ModelDef> = {
  bison: buildBison,
  wolf: buildWolf,
  raven: buildRaven,
  pronghorn: buildPronghorn,
  rabbit: buildRabbit,
  cougar: buildCougar,
  coyote: buildCoyote,
  eagle: buildEagle,
  hawk: buildHawk,
  muledeer: buildMuleDeer,
  beaver: buildBeaver,
};

const cache = new Map<number, ModelDef>();

/** Procedural model for a species id, built once and cached, or null when the species has no model yet. */
export function getModel(sp: number): ModelDef | null {
  let m = cache.get(sp);
  if (!m) {
    const key = SPECIES[sp]?.key;
    const build = key !== undefined ? BUILDERS[key] : undefined;
    if (!build) return null;
    m = build();
    // a3 spike (?a3=1): the authored mesh replaces the procedural near LOD of the species that have one
    const a3 = key !== undefined ? getA3(key) : null;
    if (a3) {
      m.nearGeometry = a3.whiteUV && m.nearGeometry ? withAntlers(m.nearGeometry, a3.geometry, a3.whiteUV, a3Tune(key!).antlerShift ?? [0, 0, 0], a3Tune(key!).antlerScale ?? 1, m.seasonal?.antlerBase ?? [0, 0, 0]) : a3.geometry;
      m.a3 = { map: a3.map, normalMap: a3.normalMap ?? undefined, ...a3Tune(key!) };
      tintFarTo(m, a3.avg);
    }
    cache.set(sp, m);
  }
  return m;
}

/**
 * The near and far LODs cross-fade by a dither, so their average colour has to match or the switch pops. The far mesh is the procedural one,
 * coloured by its paint and the species coat; scale its vertex colours so its mean (at a middling coat) equals the authored mesh's mean albedo.
 */
function tintFarTo(m: ModelDef, avg: [number, number, number]): void {
  const col = m.geometry.getAttribute('aColor');
  const part = m.geometry.getAttribute('aPart');
  const mid = [0, 1, 2].map((k) => 0.5 * (m.coatPale[k] + m.coatDark[k]));
  const far = [0, 0, 0];
  const n = col.count;
  for (let v = 0; v < n; v++) {
    if (part.getW(v) >= 0.5) continue;
    const c = part.getZ(v);
    for (let k = 0; k < 3; k++) far[k] += col.getComponent(v, k) * (1 - c + c * mid[k]);
  }
  const ratio = [0, 1, 2].map((k) => Math.min(2.5, Math.max(0.4, Math.pow(avg[k] / Math.max(1e-4, far[k] / n), 0.65))));
  for (let v = 0; v < n; v++) if (part.getW(v) < 0.5) for (let k = 0; k < 3; k++) col.setComponent(v, k, col.getComponent(v, k) * ratio[k]); // (antlers keep their paint)
  col.needsUpdate = true;
}

/**
 * The authored mule deer has no antlers (the source's were left out): the procedural near LOD's antler tubes (head vertices tagged in aPart.w, grown by
 * season in the vertex shader) are appended to the authored geometry, pointing at a white texel so the antler paint shows as it is.
 */
function withAntlers(proc: THREE.BufferGeometry, a3: THREE.BufferGeometry, white: [number, number], shift: [number, number, number], scale: number, base: [number, number, number]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'aColor', 'aPart', 'aPivot', 'aPivot2', 'aShade'];
  const pw = proc.getAttribute('aPart');
  const index = proc.getIndex();
  if (!index) return a3;
  const remap = new Map<number, number>();
  const keep: number[] = [];
  const tris: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    if (pw.getW(a) < 0.5 || pw.getW(b) < 0.5 || pw.getW(c) < 0.5) continue;
    for (const v of [a, b, c]) if (!remap.has(v)) { remap.set(v, keep.length); keep.push(v); }
    tris.push(remap.get(a)!, remap.get(b)!, remap.get(c)!);
  }
  const n0 = a3.getAttribute('position').count;
  const g = new THREE.BufferGeometry();
  for (const name of names) {
    const src = a3.getAttribute(name);
    const size = src.itemSize;
    const arr = new Float32Array((n0 + keep.length) * size);
    arr.set(src.array as Float32Array);
    const ps = name === 'uv' ? null : proc.getAttribute(name);
    // the antlers are scaled about their base and moved onto the authored head (positions, and the branch start points in aPivot2)
    const moved = name === 'position' || name === 'aPivot2';
    keep.forEach((v, k) => {
      for (let c = 0; c < size; c++) {
        let x = ps ? ps.getComponent(v, c) : white[c];
        if (moved) x = base[c] + (x - base[c]) * scale + shift[c];
        arr[(n0 + k) * size + c] = x;
      }
    });
    g.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
  }
  const idx = new Uint16Array(a3.getIndex()!.count + tris.length);
  idx.set(a3.getIndex()!.array as Uint16Array);
  tris.forEach((v, k) => { idx[a3.getIndex()!.count + k] = v + n0; });
  g.setIndex(new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
