// a3 spike: authored near-LOD meshes (public/models/a3/<species>.bin + .json, made by tools/import_animal.py and tools/label_animal.py).
// Off by default; `?a3=1` turns it on for the species that have an asset. The data loads before the animal layer is built (preloadA3, awaited
// in main.ts), so the model builders stay synchronous.
import * as THREE from 'three';

export interface A3Asset {
  geometry: THREE.BufferGeometry;
  map: THREE.Texture;
  normalMap: THREE.Texture | null;
  /** Mean albedo of the mesh (linear rgb) and the coat influence its vertices carry (the far LOD is tinted toward it). */
  avg: [number, number, number];
  coat: number;
  /** A white texel of the albedo (and a flat one of the normal map) for geometry added at load time (antlers), when the asset reserves one. */
  whiteUV: [number, number] | null;
}

/** Per species pose tuning of the authored mesh (see ModelDef.a3): graze head angle multiplier, forebody pitch (rad) and neck drop (m). */
export const A3_TUNE: Record<string, { grazeK?: number; grazePitch?: number; grazeDrop?: number; antlerShift?: [number, number, number]; antlerScale?: number; spineK?: number }> = {
  bison: { grazeK: 1.3, grazePitch: 0.12, grazeDrop: 0.12 },
  muledeer: { antlerShift: [0.12, 0.07, 0], antlerScale: 1.15 },
  coyote: { spineK: 0.5 },
  cougar: { spineK: 0.5 },
};

const assets = new Map<string, A3Asset>();
/** Species keys with an authored mesh. */
export const A3_SPECIES = ['bison', 'wolf', 'pronghorn', 'muledeer', 'coyote', 'cougar'];

/** The authored meshes are the default; `?a3=0` switches them off (the procedural near LOD returns). */
export function a3Enabled(): boolean {
  if (typeof location === 'undefined') return false;
  const v = new URLSearchParams(location.search).get('a3');
  return v === null || v !== '0';
}

/** On by default; the coyote and cougar stay off until their gallop is tuned (turn them on with `?a3=all` or by name). */
export const A3_DEFAULT = ['bison', 'wolf', 'pronghorn', 'muledeer'];

/** The species a3 applies to for this page: no parameter, the default set; `?a3=1` or `all` every species with an asset; `?a3=bison,wolf` a list. */
function wanted(): string[] {
  if (!a3Enabled()) return [];
  const v = new URLSearchParams(location.search).get('a3');
  if (v === null) return A3_DEFAULT;
  return v === '1' || v === 'all' ? A3_SPECIES : v.split(',').filter((s) => A3_SPECIES.includes(s));
}

export function getA3(key: string): A3Asset | null {
  return assets.get(key) ?? null;
}

async function loadOne(key: string): Promise<void> {
  const base = import.meta.env.BASE_URL + 'models/a3/';
  const meta = await (await fetch(base + key + '.json')).json();
  const buf = await (await fetch(base + key + '.bin')).arrayBuffer();
  const g = new THREE.BufferGeometry();
  const n: number = meta.vertices;
  for (const a of meta.attributes as Array<{ name: string; size: number; offset: number }>) {
    g.setAttribute(a.name, new THREE.Float32BufferAttribute(new Float32Array(buf, a.offset, n * a.size).slice(), a.size));
  }
  g.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(buf, meta.indexOffset, meta.triangles * 3).slice(), 1));
  g.computeBoundingSphere();
  const load = (url: string): Promise<THREE.Texture> =>
    new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, rej));
  const map = await load(base + meta.albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  let normalMap: THREE.Texture | null = null;
  const flags = new URLSearchParams(location.search);
  if (meta.normal && flags.get('a3n') !== '0') { // (?a3n=0: no normal map, a cost probe)
    normalMap = await load(base + meta.normal);
    normalMap.anisotropy = 8;
  }
  assets.set(key, { geometry: g, map, normalMap, avg: meta.avg ?? [0.1, 0.1, 0.1], coat: meta.coat ?? 0.25, whiteUV: meta.whiteUV ?? null });
}

/** Loads the authored meshes this page asked for. A failed load is logged and that species keeps its procedural near LOD. */
export async function preloadA3(): Promise<void> {
  // all species at once (each is a small json, a bin and two images): the page start waits for the slowest, not the sum
  await Promise.all(
    wanted().map(async (key) => {
      try {
        await loadOne(key);
      } catch (e) {
        console.warn('a3: could not load', key, e);
      }
    }),
  );
}

/** The pose tuning of a species, with the `?a3spine=<k>` probe override (spine flex multiplier) for tuning by eye. */
export function a3Tune(key: string): { grazeK?: number; grazePitch?: number; grazeDrop?: number; antlerShift?: [number, number, number]; antlerScale?: number; spineK?: number } {
  const t = { ...A3_TUNE[key] };
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('a3spine');
  if (q !== null && Number.isFinite(Number(q))) t.spineK = Number(q);
  return t;
}
