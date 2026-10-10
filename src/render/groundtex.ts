// Photo-scanned ground detail for the near terrain (terrain.ts, tgGdSample): one 2D array texture, one layer per material, built in
// the page from small JPEGs in public/textures/ground (tools/build_ground_textures.py makes them from Poly Haven CC0 scans, see
// CREDITS.md). Each layer is RGB: the surface slope of the scan in R and G, and in B the HIGH-PASS luminance ratio of the scan, log
// encoded, so the ground shader multiplies its own palette by it and the scan adds value structure and relief without ever changing
// the colour scheme. One fetch gives both.
import * as THREE from 'three';

/** Layers of the array, in order (the index is the material number the ground shader asks for). Keep in sync with tgGround in terrain.ts. */
export const GROUND_MATERIALS = ['litter', 'soil', 'stony', 'mud', 'ash', 'snow'] as const;
export const GROUND_TEX_SIZE = 512;

export class GroundTex {
  /** Uniform value: the array texture (a 1 x 1 stand-in until the images have loaded). */
  readonly tex: { value: THREE.DataArrayTexture };
  /** 1 once the real layers are on the GPU, 0 before (the ground shader skips the detail until then). */
  readonly on = { value: 0 };
  /** Resolves when the textures are in (or failed, in which case the ground simply keeps its procedural look). */
  readonly ready: Promise<boolean>;
  private disposed = false;

  constructor(base: string = import.meta.env.BASE_URL + 'textures/ground/') {
    const layers = GROUND_MATERIALS.length;
    const stand = new THREE.DataArrayTexture(new Uint8Array(layers * 4).fill(128), 1, 1, layers);
    stand.format = THREE.RGBAFormat;
    stand.type = THREE.UnsignedByteType;
    stand.needsUpdate = true;
    stand.name = 'terrain.groundTex.standIn';
    this.tex = { value: stand };
    this.ready = this.load(base).catch((e) => { console.warn('ground textures failed to load, using the procedural ground only', e); return false; });
  }

  private async load(base: string): Promise<boolean> {
    const S = GROUND_TEX_SIZE;
    const files: string[] = [];
    for (const m of GROUND_MATERIALS) files.push(`${base}${m}.jpg`);
    const bitmaps = await Promise.all(files.map(async (f) => {
      const r = await fetch(f);
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    }));
    if (this.disposed) { for (const b of bitmaps) b.close(); return false; }
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const data = new Uint8Array(S * S * 4 * bitmaps.length);
    bitmaps.forEach((b, i) => {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(b, 0, 0, S, S);
      data.set(ctx.getImageData(0, 0, S, S).data, i * S * S * 4);
      b.close();
    });
    const t = new THREE.DataArrayTexture(data, S, S, bitmaps.length);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.name = 'terrain.groundTex';
    t.needsUpdate = true;
    const old = this.tex.value;
    this.tex.value = t;
    old.dispose();
    this.on.value = 1;
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.tex.value.dispose();
  }
}
