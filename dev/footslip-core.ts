// Foot-slip rig, pure TypeScript (no DOM): drives a CPU mirror of the quadruped leg math (src/render/models/legmath.ts, the module
// the vertex shader is ported from) along a straight path over flat ground, a slope or bumpy ground, exactly the way AnimalLayer
// drives the shader (phase advanced by distance along the ground / stride, drawn scale and speed included), and measures
//
//   slip         = distance the planted feet move in the world during stance / distance the body moves over the same frames
//   ground error = how far a planted foot is from the ground (cm, along the body's up axis), mean and worst
//
// Run it headless with `npx tsx dev/footslip.ts` (prints the table, exit code 1 if a gate fails), or open dev/footslip.html.
// `model: 'legacy'` runs the pre-R1 leg math (dev/footslip-legacy.ts) through the same rig for a before and after.
import { Sp } from '../src/sim/types';
import { getModel } from '../src/render/models';
import type { AnimParams } from '../src/render/models/types';
import {
  IK_FAR, IK_NEAR, aimLeg, bodyFwd, bodyMotion, footModel, footPath, gaitMix, gaitStride, groundUnderFoot, instanceRotation, instanceToWorld,
  legRigOf, sstep, stanceBodyDy, worldToModelY,
} from '../src/render/models/legmath';
import type { InstancePose, LegRig } from '../src/render/models/legmath';
import { LEGACY_MAX_CADENCE, legacyLeg, legacyStride } from './footslip-legacy';

export type GaitName = 'walk' | 'trot' | 'gallop' | 'stot';
export type ModelKind = 'new' | 'legacy';
export type TerrainKind = 'plane' | 'bumps';

/** AnimalLayer.speciesScale: the drawn size of each species. */
export const SPECIES_SCALE = [1, 1.35, 1.7, 1, 1.2, 1.05, 1.35, 1, 1.7, 1.6, 1.05];
export const LEGGED: Array<{ sp: number; name: string }> = [
  { sp: Sp.Bison, name: 'bison' },
  { sp: Sp.Wolf, name: 'wolf' },
  { sp: Sp.Deer, name: 'pronghorn' },
  { sp: Sp.Cougar, name: 'cougar' },
  { sp: Sp.Coyote, name: 'coyote' },
  { sp: Sp.MuleDeer, name: 'mule deer' },
];
/** Rabbit (a hopper) and raven (a bird) have no planted-foot gait: they use the old hop and flight paths and are not part of the rig. */
export const NOT_RIGGED = ['rabbit', 'raven'];

const MAX_CADENCE_NEW = 12; // keep in step with MAX_CADENCE in src/render/animals.ts

const rigCache = new Map<number, { p: AnimParams; rig: LegRig }>();
export function speciesRig(sp: number): { p: AnimParams; rig: LegRig } {
  let r = rigCache.get(sp);
  if (!r) {
    const def = getModel(sp)!;
    r = { p: def.params, rig: legRigOf(def.geometry) };
    rigCache.set(sp, r);
  }
  return r;
}

/** A pace (on-screen m/s at 1x) in the middle of a gait band, where the gait weights are pure. */
export function paceFor(p: AnimParams, g: GaitName): number {
  return g === 'walk' ? 0.5 * (0.4 + p.trot0) : g === 'trot' ? 0.5 * (p.trot1 + p.gal0) : p.gal1 * 1.15;
}

/** The stotting weight a gait row runs at (R6: the 'stot' row is the bounds of a mule deer, at the pace of a gallop). */
export const stotOf = (g: GaitName): number => (g === 'stot' ? 1 : 0);

export interface CaseOpts {
  sp: number;
  gait: GaitName;
  /** Time-lapse factor: the body covers this many times the ground per frame for the same gait (the gait follows the animal's own pace). */
  speedMul: 1 | 10;
  slopeDeg: number;
  model: ModelKind;
  terrain?: TerrainKind;
  /** Camera distance (m): below 40 m the IK is on and the distance cues are weak; the rig also runs at 44 m. */
  camD?: number;
  seconds?: number;
  fps?: number;
}

export interface CaseResult {
  opts: CaseOpts;
  /** Stance slip as a fraction (0.05 = the planted feet move 5% as far as the body). */
  slip: number;
  /** Ground error of planted feet, cm. */
  gndMean: number;
  gndMax: number;
  /** Leg cycles per second. */
  cadence: number;
  /** Share of frames where the cadence cap limited the phase advance. */
  capped: number;
  /** Share of stance frames where the IK could not reach the target (new model only). */
  unreachable: number;
}

export interface Terrain { h(x: number, z: number): number }
export function makeTerrain(kind: TerrainKind, slopeDeg: number): Terrain {
  const k = Math.tan((slopeDeg * Math.PI) / 180);
  if (kind === 'plane') return { h: (x) => 100 + x * k };
  // bumps: 14 cm swells every 5.3 m and 9 cm ripples across the path, on top of the slope
  return { h: (x, z) => 100 + x * k + 0.14 * Math.sin((x * Math.PI * 2) / 5.3) + 0.09 * Math.sin((z * Math.PI * 2) / 3.1 + x * 0.7) };
}

/** AnimalLayer.update's placement of an instance on the terrain for a body heading +x. */
export function placeInstance(p: AnimParams, T: Terrain, x: number, z: number, vs: number, camD: number): InstancePose {
  const hl = p.length * 0.3 * vs, hw = 0.12 * Math.max(p.length, 1) * vs + 0.05;
  const ground = T.h(x, z);
  const hF = T.h(x + hl, z), hB = T.h(x - hl, z), hR = T.h(x, z + hw), hL = T.h(x, z - hw);
  let pitch = Math.atan2(hF - hB, 2 * hl);
  let roll = -Math.atan2(hR - hL, 2 * hw);
  const y = (hF + hB + hR + hL) * 0.25 * 0.5 + ground * 0.5;
  const fkT = sstep(25, 140, camD);
  pitch *= 1 + 0.6 * fkT;
  roll *= 1 + 0.6 * fkT;
  return { x, y, z, ch: 1, sh: 0, pitch, roll, s: vs };
}

/** The scale the vertex shader gives a small, distant animal (see legBoost in animals.ts). */
export function boostFor(p: AnimParams, vs: number, camD: number, uPxK = 900 / (2 * Math.tan((45 * Math.PI) / 360))): number {
  const px = (p.boostLen * vs * uPxK) / Math.max(camD, 1);
  return Math.min(7, Math.max(1, p.minPx / Math.max(px, 0.01)));
}

export interface FrameSample {
  t: number;
  body: [number, number, number];
  inst: InstancePose;
  /** Per leg (FL, FR, HL, HR): foot point in the post-body model frame, in the world, stance flag, ground error (cm), IK short flag. */
  feet: Array<{ model: [number, number, number]; world: [number, number, number]; stance: boolean; err: number; short: boolean; hip: [number, number, number]; knee: [number, number, number] }>;
  phase: number;
}

/** Runs one case, calling `frame` for every simulated frame after the warm-up (used by the strips too). */
export function runCase(o: CaseOpts, frame?: (s: FrameSample) => void): CaseResult {
  const { p, rig } = speciesRig(o.sp);
  const vs = SPECIES_SCALE[o.sp];
  const camD = o.camD ?? 20;
  const fps = o.fps ?? 60, dt = 1 / fps;
  const seconds = o.seconds ?? 6;
  const T = makeTerrain(o.terrain ?? 'plane', o.slopeDeg);
  const pace = paceFor(p, o.gait);
  const v = pace * o.speedMul; // drawn horizontal speed, m/s
  const farK = sstep(20, 110, camD);
  const ikK = 1 - sstep(IK_NEAR, IK_FAR, camD);
  const kBdy = 1 - Math.exp(-dt / 0.12);
  const legacy = o.model === 'legacy';
  const maxCad = legacy ? LEGACY_MAX_CADENCE : MAX_CADENCE_NEW;
  const boost = boostFor(p, vs, camD);
  const stotW = legacy ? 0 : stotOf(o.gait);

  let x = 10, ph = 0.31, bdy = 0;
  let prevG = T.h(x, 0);
  let slipFoot = 0, slipBody = 0, gSum = 0, gMax = 0, gN = 0, capN = 0, shortN = 0, stanceN = 0, frames = 0;
  const prevW: Array<[number, number, number] | null> = [null, null, null, null];
  const prevStance = [false, false, false, false];
  let prevBody: [number, number, number] | null = null;
  const warm = Math.ceil(1.5 * fps);
  const total = Math.ceil(seconds * fps) + warm;
  let phaseTravel = 0;

  for (let f = 0; f < total; f++) {
    const ds = v * dt;
    const xNew = x + ds;
    const gNew = T.h(xNew, 0);
    const dsG = Math.hypot(ds, gNew - prevG);
    const stride = (legacy ? legacyStride(p, pace) : gaitStride(p, pace, stotW)) * vs * (legacy ? 1 : boost);
    const dph = (legacy ? ds : dsG) / stride;
    const lim = maxCad * dt;
    if (dph > lim) capN++;
    const adv = Math.min(dph, lim);
    ph = (ph + adv) % 1;
    phaseTravel += adv;
    x = xNew;
    prevG = gNew;

    const inst = placeInstance(p, T, x, 0, vs, camD);
    const R = instanceRotation(inst);
    const gm = gaitMix(p, pace, stotW);
    // eased body-height offset from the ground under the stance feet (new model)
    if (!legacy) {
      const bT = ikK > 0.001 ? stanceBodyDy(p, rig, gm, ph, inst, (gx, gz) => T.h(gx, gz)) * ikK : 0;
      bdy += (bT - bdy) * kBdy;
    }
    const bm = bodyMotion(p, gm, ph, farK, legacy ? 0 : bdy, stotW);
    if (legacy) bm.yoff += gm.flex; // the old leg math had no body sink
    const feet: FrameSample['feet'] = [];
    for (let i = 0; i < 4; i++) {
      const b = i < 2 ? rig.front : rig.hind;
      const z = (i & 1 ? 1 : -1) * b.z;
      let model: [number, number, number], stance: boolean, short = false;
      let hipM: [number, number, number], kneeM: [number, number, number];
      if (legacy) {
        const lg = legacyLeg(p, rig, pace, ph, i, bm.yoff, bm.pitch);
        model = bodyFwd(p, bm, [lg.foot[0], lg.foot[1], z]);
        stance = lg.stance;
        hipM = bodyFwd(p, bm, [b.hip[0], b.hip[1], z]);
        kneeM = hipM; // not drawn for the legacy leg
      } else {
        const gy = ikK > 0.001 ? ikK * groundUnderFoot(inst, R, (gx, gz) => T.h(gx, gz), b.foot[0] + footPath(gm, ph, i).footX, b.foot[1], z) : 0;
        const aim = aimLeg(p, rig, gm, ph, i, z, gy, bm);
        model = footModel(p, rig, i, z, aim, bm);
        stance = aim.path.stance;
        short = aim.sol.short;
        hipM = bodyFwd(p, bm, [b.hip[0], b.hip[1], z]);
        // knee point after the leg pose and the body motion
        const kx = b.knee[0], ky = b.knee[1];
        const cs = Math.cos(aim.sol.hip), sn = Math.sin(aim.sol.hip);
        const dx = kx - b.hip[0], dy = ky - b.hip[1];
        const kp: [number, number] = [b.hip[0] + (cs * dx - sn * dy) * aim.sol.stretch, b.hip[1] + (sn * dx + cs * dy) * aim.sol.stretch];
        kneeM = bodyFwd(p, bm, [kp[0], kp[1], z]);
      }
      const w = instanceToWorld(inst, R, model[0], model[1], model[2]);
      const gnd = worldToModelY(inst, R, w[0], T.h(w[0], w[2]), w[2]);
      const err = vs * (model[1] - (gnd + b.foot[1])) * 100; // cm, along the body's up axis; + = foot above ground
      feet.push({ model, world: w, stance, err, short, hip: hipM, knee: kneeM });
    }
    const body: [number, number, number] = [inst.x, inst.y, inst.z];
    if (f >= warm) {
      frames++;
      for (let i = 0; i < 4; i++) {
        const ft = feet[i];
        if (ft.stance) {
          stanceN++;
          if (ft.short) shortN++;
          const ae = Math.abs(ft.err);
          gSum += ae; gN++;
          if (ae > gMax) gMax = ae;
          const pw = prevW[i];
          if (pw && prevStance[i] && prevBody) {
            slipFoot += Math.hypot(ft.world[0] - pw[0], ft.world[1] - pw[1], ft.world[2] - pw[2]);
            slipBody += Math.hypot(body[0] - prevBody[0], body[1] - prevBody[1], body[2] - prevBody[2]);
          }
        }
      }
      frame?.({ t: (f - warm) * dt, body, inst, feet, phase: ph });
    }
    for (let i = 0; i < 4; i++) { prevW[i] = feet[i].world; prevStance[i] = feet[i].stance; }
    prevBody = body;
  }
  void stanceN;
  return {
    opts: o,
    slip: slipBody > 0 ? slipFoot / slipBody : 0,
    gndMean: gN ? gSum / gN : 0,
    gndMax: gMax,
    cadence: phaseTravel / (total * dt),
    capped: capN / total,
    unreachable: stanceN ? shortN / stanceN : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Gates and the table

export interface Row {
  species: string;
  gait: GaitName;
  speed: 1 | 10;
  slope: number;
  camD: number;
  before: CaseResult;
  after: CaseResult;
}

/** Slip gate: <= 5% at walk and trot, <= 8% at gallop and in the stot's bounds. Ground gate: <= 5 cm on a 20 degree slope within 45 m. Both at 1x only. */
export function gateOf(r: CaseResult): { slipOk: boolean; gndOk: boolean } {
  const lim = r.opts.gait === 'gallop' || r.opts.gait === 'stot' ? 0.08 : 0.05;
  return { slipOk: r.slip <= lim, gndOk: r.opts.slopeDeg === 0 || r.gndMax <= 5 };
}

export function runTable(cams: number[] = [20, 44], terrain: TerrainKind = 'plane'): Row[] {
  const rows: Row[] = [];
  for (const camD of cams) {
    for (const { sp, name } of LEGGED) {
      for (const gait of ['walk', 'trot', 'gallop', ...(speciesRig(sp).p.stot ? ['stot'] : [])] as GaitName[]) {
        for (const speed of [1, 10] as const) {
          for (const slope of [0, 20]) {
            const base = { sp, gait, speedMul: speed, slopeDeg: slope, terrain, camD };
            rows.push({
              species: name, gait, speed, slope, camD,
              before: runCase({ ...base, model: 'legacy' }),
              after: runCase({ ...base, model: 'new' }),
            });
          }
        }
      }
    }
  }
  return rows;
}

const pct = (x: number): string => (x * 100).toFixed(1).padStart(5) + '%';
const cm = (x: number): string => x.toFixed(1).padStart(5);

export function formatTable(rows: Row[]): string {
  const out: string[] = [];
  out.push('species    gait    speed slope cam |   BEFORE: slip  gnd max |   AFTER: slip  gnd mean  gnd max  Hz  capped unreach | gate');
  let camLast = -1;
  for (const r of rows) {
    if (r.camD !== camLast) { out.push(`-- camera ${r.camD} m (IK ${r.camD <= IK_NEAR ? 'on' : 'fading'}) --`); camLast = r.camD; }
    const g = gateOf(r.after);
    const gate = r.speed === 10 ? ' (time-lapse, not gated)' : g.slipOk && g.gndOk ? ' ok' : ` FAIL${g.slipOk ? '' : ' slip'}${g.gndOk ? '' : ' ground'}`;
    out.push(
      `${r.species.padEnd(10)} ${r.gait.padEnd(7)} ${String(r.speed).padStart(2)}x   ${String(r.slope).padStart(2)}d ${String(r.camD).padStart(3)} | ` +
        `${pct(r.before.slip)} ${cm(r.before.gndMax)} | ${pct(r.after.slip)} ${cm(r.after.gndMean)} ${cm(r.after.gndMax)} ${r.after.cadence.toFixed(1).padStart(4)} ` +
        `${pct(r.after.capped)} ${pct(r.after.unreachable)} |${gate}`,
    );
  }
  return out.join('\n');
}

/** True if every gated row (1x) passes. */
export function allPass(rows: Row[]): boolean {
  return rows.filter((r) => r.speed === 1).every((r) => {
    const g = gateOf(r.after);
    return g.slipOk && g.gndOk;
  });
}

/** Rest-pose check: the angles the IK picks for a standing animal (should be near 0; a few degrees is the knee branch of a front leg). */
export function restPose(sp: number): string {
  const { p, rig } = speciesRig(sp);
  const gm = gaitMix(p, 0);
  const bm = bodyMotion(p, gm, 0, 0, 0);
  const out: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const b = i < 2 ? rig.front : rig.hind;
    const a = aimLeg(p, rig, gm, 0, i, (i & 1 ? 1 : -1) * b.z, 0, bm);
    out.push(`${['FL', 'FR', 'HL', 'HR'][i]} hip ${((a.sol.hip * 180) / Math.PI).toFixed(1)} knee ${((a.sol.knee * 180) / Math.PI).toFixed(1)} stretch ${a.sol.stretch.toFixed(3)}`);
  }
  return out.join(' | ');
}
