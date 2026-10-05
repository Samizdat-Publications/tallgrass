// The small-prey field texture as a shared uniform (R3 item 2). smallprey.ts fills it from the sim's `small` snapshot field
// (32 x 32 RGBA bytes: R jackrabbits, G prairie dogs, B town 0..1, A plague 0..1); the terrain shader reads it for the town turf.
// It lives in its own tiny module so terrain.ts and smallprey.ts can both import it without importing each other.
//
// Hook for grass.ts (not edited by this work package): to shorten the blades inside towns, import SMALL_TEX and TOWN_ON, add them as
// uniforms (tSmall, uTownOn) and, where the blade height is computed from the biomass, multiply it by
//   1.0 - 0.65 * uTownOn * smoothstep(0.12, 0.6, texture(tSmall, worldXZ / worldSize).b)
// Until then smallprey.ts clips the biomass (R) of the render copy of the vegetation texture inside towns (SmallPreyLayer.clipVeg,
// called from main.ts right after Engine.setVeg), which the blade layer and the terrain already follow. When grass.ts reads the
// texture itself, drop that call.
import * as THREE from 'three';

export const SMALL_N = 32;

const data = new Uint8Array(SMALL_N * SMALL_N * 4);
const tex = new THREE.DataTexture(data, SMALL_N, SMALL_N, THREE.RGBAFormat, THREE.UnsignedByteType);
tex.magFilter = THREE.LinearFilter;
tex.minFilter = THREE.LinearFilter;
tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
tex.generateMipmaps = false;
tex.needsUpdate = true;

/** sampler2D uniform: the small-prey fields (see above). Zero everywhere until the sim sends the first texture. */
export const SMALL_TEX = { value: tex as THREE.Texture };
/** 1 once a small-prey texture has arrived (the smallPrey param is on), else 0: the terrain shader skips the town turf. */
export const TOWN_ON = { value: 0 };

/** Copy a snapshot's `small` bytes in and switch the town turf on. */
export function uploadSmall(bytes: Uint8Array): void {
  if (bytes.length !== data.length) return;
  data.set(bytes);
  tex.needsUpdate = true;
  TOWN_ON.value = 1;
}

/** The CPU copy (read by smallprey.ts for puppets and mounds). */
export const SMALL_DATA = data;
