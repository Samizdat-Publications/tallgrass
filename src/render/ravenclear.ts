// r-ravens2: a raven (flying or standing) is never drawn inside the body of a predator that is feeding at a carcass.
// Each body is an ellipse on the ground (x, z, cos h, sin h, half length, half width: BODY_STRIDE floats a body) that is the predator's own footprint
// plus the raven's half length. A bird inside one is moved out to its rim, along the ray from the centre, scaled by how low it is: a bird above
// RAVEN_CLEAR_ALT1 m passes over the back. The result is a pure function of the two positions, so nothing pops.

export const BODY_STRIDE = 6;
export const RAVEN_CLEAR_ALT0 = 1.6;
export const RAVEN_CLEAR_ALT1 = 3.0;
/** A flying raven's spread wings reach this much further out than a standing bird's. */
export const RAVEN_WING_R = 0.6;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The push (out.x, out.z, metres) that takes a raven at (x, z), alt m up, out of the n bodies in B. */
export function ravenClear(B: Float32Array, n: number, x: number, z: number, alt: number, grounded: boolean, out: { x: number; z: number }): void {
  out.x = 0;
  out.z = 0;
  const wk = 1 - smooth(RAVEN_CLEAR_ALT0, RAVEN_CLEAR_ALT1, alt);
  if (wk <= 0) return;
  const grow = grounded ? 0 : RAVEN_WING_R;
  for (let q = 0; q < n; q++) {
    const o = q * BODY_STRIDE, a = B[o + 4] + grow, b = B[o + 5] + grow;
    const dx = x - B[o], dz = z - B[o + 1];
    if (Math.abs(dx) > a || Math.abs(dz) > a) continue;
    const ch = B[o + 2], sh = B[o + 3];
    const u = dx * ch + dz * sh, v = -dx * sh + dz * ch;
    const r = Math.hypot(u / a, v / b);
    if (r >= 1) continue;
    const su = r < 0.05 ? 0 : u / r, sv = r < 0.05 ? b : v / r;
    const du = (su - u) * wk, dv = (sv - v) * wk;
    out.x += ch * du - sh * dv;
    out.z += sh * du + ch * dv;
  }
}
