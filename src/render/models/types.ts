import type * as THREE from 'three';

/**
 * Wing and pose constants of a bird of prey (shader.ts, `#if RAPTOR`). Angles in radians, lengths in model metres. The wings are authored on the
 * right (+z); the primaries ("fingers", numbered in the vertex's aPart.w) fan about `handRoot`.
 */
export interface RaptorParams {
  /** Where the primaries' roots meet, right wing. */
  handRoot: [number, number, number];
  /** Number of separate primaries per wing (at most 7). */
  fingers: number;
  /** Half-angle of the fan of the primaries in a soar, and how far they curl up at the tips. */
  spread: number;
  curl: number;
  /** Dihedral of the whole wing at the shoulder and of the hand above the arm at the wrist, in a glide (a hawk holds a shallow V, an eagle flatter). */
  dihIn: number;
  dihOut: number;
  /** Size of the beat at the shoulder and the wrist. */
  flapIn: number;
  flapOut: number;
  /** Extra back sweep of the wing in a fast glide. */
  sweepFast: number;
  /** The stoop: dihedral of the drawn-in wing, its back sweep, how much the wing's length is pulled in (0..1). */
  stoopDih: number;
  stoopSweep: number;
  stoopCmp: number;
  /** A folded wing is this much shorter (0..1) and the tips droop by `foldDroop`. */
  foldCmp: number;
  foldDroop: number;
  /** Body pitch (nose up) of a bird sitting upright on a perch, about the hip joint at `perchHip` (x, y). */
  perchPitch: number;
  perchHip: [number, number];
  /** How far the tail fans out in a soar (fraction of its width). */
  tailFan: number;
}

/**
 * R6 stotting (pronking) gait of a mule deer: all four feet leave the ground together in high bounds. A weight 0..1 (the animal layer's
 * `stot`, written to aFx2.y of the deer) blends the gallop's foot path toward it, so the foot lock still holds: the feet stand still on the
 * ground for `duty` of each cycle (they slide back at body speed, the stride is derived from `amp` and `duty` like a gait's) and fly the
 * rest, lifted by `knee` (swing lift as the knee flexion parameter of a gait) with the whole body rising `bob` m in the air and sinking `sink`
 * m in the stance, pitching `pitch` rad nose up at take-off and nose down at landing.
 */
export interface StotParams {
  /** Hip swing amplitude (sets the stride with `duty`, like a gait's amp). */
  amp: number;
  /** Stance share of the cycle (short: the bounds are mostly flight). */
  duty: number;
  /** Swing lift as a gait's knee flexion parameter (the feet tuck up under the rising body). */
  knee: number;
  /** Peak rise of the body in the air (m, model units) and sink in the stance (m). */
  bob: number;
  sink: number;
  /** Pitch swing (rad). */
  pitch: number;
  /** Per-leg phase offsets FL, FR, HL, HR (all 0: the four feet land together). */
  off: [number, number, number, number];
}

/** Gait and pose constants for one species. Angles in radians, lengths in meters, speeds in m/s. */
export interface AnimParams {
  /** R6 stotting gait (mule deer only): see StotParams. Unset: the species never stots and its shader has no stotting code. */
  stot?: StotParams;
  /**
   * Rotary-gallop spine (wolf, coyote, cougar): while galloping (a quarter as much at a trot) the back flexes and extends once per stride, the
   * shoulders and hips roll against each other and the head counters the neck's tilt. `flex` is the tilt of the back (rad, each end of the rib cage
   * relative to the middle: the back arches in the gathered phase, with all four feet under the body, and hollows in the extended phase),
   * `twist` the opposed roll of shoulders and hips (rad at the ends), `head` the share of the neck's tilt the head cancels. Unset: no spine motion.
   * It is part of the body motion (legmath.ts bodyFwd), so the leg IK takes it out of the foot targets and planted feet stay planted.
   */
  spine?: { flex: number; twist: number; head: number };
  /**
   * R6 cat stalk (cougar): while crouched the shoulder blades rise above the dropped back line, the tail hangs low with a twitching tip, and in
   * the freeze before the rush (aFx2.y, 0..1) the haunches gather and wiggle. 0 or unset: no.
   */
  stalk?: number;
  /**
   * R8 behaviour library (bison): the species reads the behaviour weights the animal layer packs into aFx2 (wallow, rub, spar, hop) and the extra
   * attribute aFx3 (snow dig, bellow, calf play, spar phase), see models/shader.ts. Unset: the shader has none of that code.
   */
  behave?: boolean;
  /**
   * R-marsh swimmer (beaver): the animal layer rides the model on the water surface with its origin `sink` model metres below the surface
   * and writes the swim weight 0..1 into aFx.w. The shader then tucks the legs, lifts the head and lays the tail flat, and the vertices
   * tagged 7 in aPart.w (the V wake, see models/beaver.ts) are drawn at the surface and fade out along their length; at weight 0 the wake
   * is collapsed to a point. Unset: the species never swims and its shader has none of that code.
   */
  swim?: { sink: number; /** x of the nose, where the wake starts, and how far the wake runs back from it (model m). */ nose: number; wake: number };
  /** R8 pronghorn: aFx2.x is the rump flare weight on alarm (the white patch spreads and brightens). */
  flare?: boolean;
  /**
   * r-alert2 (pronghorn, mule deer): aFx.z, which a grazer has no use for (no hunting weight), is the head yaw (rad, 0 = none) of an animal watching a
   * predator pass. A bison carries the same value in 7 bits spread over the unused top bits of its two packed floats (see packBisonA, ALERT_YAW_MAX).
   */
  alertYaw?: boolean;
  /** 0 quadruped, 1 hopper, 2 bird. */
  kind: 0 | 1 | 2;
  /** Height of the pivot used for body pitch. */
  comY: number;
  /** Hip pivot to ground (m) when standing; the stride of a planted foot scales with it. Defaults to comY. */
  legL?: number;
  /** Walk to trot blend range and trot to gallop blend range (m/s). */
  trot0: number;
  trot1: number;
  gal0: number;
  gal1: number;
  /** Hip swing amplitude per gait. */
  ampW: number;
  ampT: number;
  ampG: number;
  /** Knee/hock flexion peak per gait. */
  kneeW: number;
  kneeT: number;
  kneeG: number;
  /** Body bob (m) per gait. */
  bobW: number;
  bobT: number;
  bobG: number;
  /** Body pitch (rad) per gait. */
  pitchT: number;
  pitchG: number;
  /** Head nod (rad) walk / gallop. */
  nodW: number;
  nodG: number;
  /** Head pitch when grazing, drinking or feeding (rad, positive = down). */
  headDown: number;
  /** Idle head look-around yaw (rad). */
  lookYaw: number;
  /** Tail: lift at rest, lift when galloping, lateral sway (rad). */
  tailRest: number;
  tailRun: number;
  tailSway: number;
  /** Lying pose: body drop (m) and leg fold (hip, knee) for fore and hind legs. */
  lieDrop: number;
  lieHipF: number;
  lieKneeF: number;
  lieHipH: number;
  lieKneeH: number;
  /** Stalking crouch body drop (m). */
  crouchDrop: number;
  /**
   * A land hunter (wolf, cougar): its material reads the second effects attribute (aFx2: the hold on the prey and the feeding
   * cycle). Birds read it too (hop, walk, takeoff). For everything else the attribute is left out of the shader.
   */
  hunts?: boolean;
  /**
   * A hunter that takes its prey by clinging to it (cougar): in the hold the forelegs wrap the prey's shoulders and the body
   * pitches up to about 36 degrees with the head down on the neck, instead of the wolf's pose (forefeet on the ground, body at
   * about 17 degrees, hind legs braced and spread). 0 or unset: no.
   */
  clasp?: number;
  /**
   * Curled rest (canids): while lying, the hindquarters and tail swing round to one side (up to `curlAng` rad, ramping in
   * over `curlLen` m behind the pivot at x = `curlX`) and the head turns back and rests on the paws. A resting wolf then
   * reads as a compact rounded form from any side; stretched out it is a long pale shape that looks like a fish standing
   * on its tail when seen end on. 0 or unset: lies straight.
   */
  curl?: number;
  curlAng?: number;
  curlX?: number;
  curlLen?: number;
  /** Carcass pose: roll, drop, stiff leg angles. */
  deadDrop: number;
  deadHipF: number;
  deadHipH: number;
  /** Hind-leg hock flexion scale (flexion for hind legs goes forward). */
  hockK: number;
  /**
   * Gait offsets (cycle fractions) in order FL, FR, HL, HR. A leg's phase is u = fract(phase + offset) and its foot is on the
   * ground for u < stance share, so the offset of a leg is minus the moment (in cycles) it touches down. Quadrupeds blend the
   * three tables by speed (models/legmath.ts gaitMix), so the three should stay roughly aligned.
   */
  offW: [number, number, number, number];
  offT: [number, number, number, number];
  offG: [number, number, number, number];
  /**
   * Stance fraction (share of each leg cycle a foot is on the ground) per gait, quadrupeds only. During stance the foot
   * sweeps back at a constant rate, so a leg cycle of `plantedStride()` metres leaves it exactly planted.
   */
  dutyW: number;
  dutyT: number;
  dutyG: number;
  /**
   * Stance fraction at the fastest gallop (chases and flights run well above the gallop band): the foot is on the ground
   * for less of each stride, so the stride grows and the cadence stays within what the eye (and the frame rate) can
   * follow. Blends from dutyG to this between `fast0` and `fast1` (pace in on-screen m/s). Defaults: no change.
   */
  dutyGF?: number;
  fast0?: number;
  fast1?: number;
  /**
   * Metres per leg cycle at a walk and at a full gallop, and the speed at which the interpolation completes. Used for
   * hoppers and birds only: quadrupeds derive their stride from the hip amplitude and stance fraction (plantedStride).
   */
  strideW: number;
  strideG: number;
  strideSpeedMax: number;
  /** Wing beat frequency (Hz), birds only. */
  flapHz: number;
  /** R5 birds of prey (golden eagle, red-tailed hawk): slotted primaries, soaring dihedral, the stoop and the upright perch. Unset: a raven-style bird. */
  raptor?: RaptorParams;
  /** Footprint for terrain alignment and picking. */
  length: number;
  height: number;
  /** Radius of the selection ring (m). */
  ring: number;
  /** Minimum on-screen length in pixels (on a 900 px tall viewport) before the animal is gently scaled up with distance. */
  minPx: number;
  /** Model length (m) used for that screen-size estimate. */
  boostLen: number;
}

/**
 * Longest a leg may need to be (as a multiple of its rest length) for the planted foot of a level-ground gait to reach the
 * ground at the end of its sweep. It sets the furthest the foot travels ahead of the hip (see footReach), so a flat-ground
 * stride never asks the leg for more than this.
 */
export const STRETCH_CAP = 1.18;

/**
 * Hard limit of the two-bone leg solver (models/legmath.ts): to put the foot on uneven ground the leg may lengthen to this
 * multiple of its rest length (a +25% stretch of the whole leg after the knee has fully straightened). The gap between
 * STRETCH_CAP and this is the slack kept for slopes and bumps.
 */
export const IK_CAP = 1.25;

/**
 * Furthest a planted foot travels ahead of (or behind) the hip, in leg lengths, for a gait whose hip swing is `amp`: tan(amp)
 * (a straight leg swung through that angle) but never more than the leg can reach on level ground within STRETCH_CAP.
 */
export function footReach(amp: number): number {
  return Math.min(Math.tan(amp), Math.sqrt(STRETCH_CAP * STRETCH_CAP - 1));
}

/**
 * Metres a planted foot sweeps back per leg cycle for gait 0 walk, 1 trot, 2 gallop (quadrupeds): the foot travels
 * 2 * L * reach(hip amplitude) along the ground, spread over the stance fraction of the cycle. Run the cycle at
 * speed / stride Hz and the planted foot stands still on the ground.
 */
export function plantedStride(p: AnimParams, gait: 0 | 1 | 2, pace = 0): number {
  const amp = gait === 0 ? p.ampW : gait === 1 ? p.ampT : p.ampG;
  const duty = gait === 0 ? p.dutyW : gait === 1 ? p.dutyT : gallopDuty(p, pace);
  return (2 * (p.legL ?? p.comY) * footReach(amp)) / duty;
}

/** Metres a planted foot sweeps back per leg cycle of the stotting gait (the stride of its bounds), the same rule as plantedStride. */
export function stotStride(p: AnimParams): number {
  const s = p.stot;
  return s ? (2 * (p.legL ?? p.comY) * footReach(s.amp)) / s.duty : 0;
}

/** Gallop stance fraction at a given pace (the shader evaluates the same curve). */
export function gallopDuty(p: AnimParams, pace: number): number {
  if (p.dutyGF === undefined) return p.dutyG;
  const a = p.fast0 ?? p.gal1, b = p.fast1 ?? p.gal1 * 2.2;
  const t = Math.min(1, Math.max(0, (pace - a) / (b - a)));
  return p.dutyG + (p.dutyGF - p.dutyG) * t * t * (3 - 2 * t);
}

/**
 * R7 fur shading of a quadruped (the fragment stage, both LODs so the cross-fade between them stays matched). Everything is optional
 * and small; 0 or unset switches a term off.
 */
export interface FurDef {
  /** Kajiya-Kay highlight along the hair (the body axis): strength, exponent, tint (multiplies the coat colour's own, linear). */
  sheen: number;
  sheenPow?: number;
  sheenTint?: [number, number, number];
  /** Backlit rim of fur glowing in a low sun (near range only; the far rim and the night rim are separate and are not doubled). */
  rim: number;
  /** Coat pattern: darker along the topline (dorsal), lighter underside (belly), tone mottling (amplitude, cells per metre), per-animal hue jitter. */
  dorsal?: number;
  belly?: number;
  mottle?: number;
  /** Hair streaks along the body (amplitude, near range only). */
  streak?: number;
  mottleScale?: number;
  indiv?: number;
  /** Shaggy wool shells (near LOD only): tuft cell size (cells per m, across and along the hair), fringe sparseness 0..1, fade-out range (m). */
  shell?: { scale: number; along: number; sparse: number; d0: number; d1: number; /** Tone of the inner and the outer layer (multiplies the coat; default 0.8 and 1.04). */ tone?: [number, number] };
}

export interface ModelDef {
  geometry: THREE.BufferGeometry;
  /** R7 near LOD: a denser, continuous body, neck and head loft (same rig as `geometry`, which is the far LOD). Drawn within `lod.d1` metres. */
  nearGeometry?: THREE.BufferGeometry;
  /**
   * a3 spike: the near LOD is an authored mesh (tools/import_animal.py + tools/label_animal.py) with an albedo and a normal map. Its leg and tail
   * vertices carry a skin blend in aPart.w (0 = follows its bone, 1 = follows the body) so the continuous skin does not tear at the hip.
   */
  a3?: { map: THREE.Texture; normalMap?: THREE.Texture; grazeK?: number; grazePitch?: number; grazeDrop?: number; /** where the procedural antlers sit on the authored head: offset of their base (m) and a scale about it */ antlerShift?: [number, number, number]; antlerScale?: number; /** multiplies the gallop spine flex and twist (an authored torso is longer and stiffer than the procedural loft); default 1 */ spineK?: number; /** r-feet: how much of the leg's swing the foot is turned back by (default 1, a level sole) and the height range above the sole (fractions of the leg length) over which it fades out (default 0.07 to 0.2) */ ankle?: number; footY?: [number, number]; /** dry, woolly shading for an authored coat (bison): the albedo is pulled toward chocolate brown, the night rim is neutral and the direct specular is cut; default 0 */ matte?: number; /** r-idle: where the ears are on the authored head, [base xyz, tip xyz, radius] (m, the right ear: +z; the left is its mirror), so they can flick */ ear?: number[] };
  /** Camera distance range (m) of the dithered cross-fade from the near to the far LOD. */
  lod?: { d0: number; d1: number };
  fur?: FurDef;
  /**
   * Index count of the part of the far geometry that the ambient-occlusion pre-pass draws. That pass draws every mesh in its rest pose with one
   * override material and no animation, so geometry the vertex shader grows or hides (the antlers of a deer, bare most of the year) must sit
   * at the end of the index buffer and be left out here, or its rest pose leaves faint lines in the picture.
   */
  aoCount?: number;
  /**
   * R6 mule deer: a seasonal coat and antlers. The coat blends from coatPale / coatDark (the summer coat) to winterPale / winterDark by the
   * per-instance winter weight; the antlers (head vertices tagged in aPart.w: 1 main beam, 2 fork, 3 tine) grow about `antlerBase` and
   * their tines appear by `forkAt` (the growth at which the first forks are half out) and `tineAt` (the second tines).
   */
  seasonal?: {
    winterPale: [number, number, number];
    winterDark: [number, number, number];
    antlerBase: [number, number, number];
    forkAt: number;
    tineAt: number;
    /** Velvet and hard antler colours (linear). */
    velvet: [number, number, number];
  };
  params: AnimParams;
  /** Linear RGB coat palette: pale end and dark end. */
  coatPale: [number, number, number];
  coatDark: [number, number, number];
  /** Carcass bone colour, linear. */
  bone: [number, number, number];
  roughness: number;
  /** Multiplier on the hemisphere (sky) fill light for this species. */
  fill: number;
  /** Tint of the neutralised sky fill (linear RGB, around 1). Warm for brown animals so shade stays brown, not grey-blue. */
  warm: [number, number, number];
  /** 0..1: how far the sky fill is pulled to a neutral grey (times `warm`) before it lights the coat. */
  neutral: number;
  /**
   * Distance readability, all fading in between about 140 and 400 m from the camera: the coat is scaled by `gain` (value
   * contrast against the grass), edges glow `rimCol` at `rim` strength, and by another `hunt` while the animal stalks,
   * chases or feeds.
   */
  far?: {
    gain: number;
    rim: number;
    hunt: number;
    rimCol: [number, number, number];
    /** Distance range (m) over which all the far effects fade in (default 140 to 400). */
    d0?: number;
    d1?: number;
    /**
     * Linear albedo the coat is pulled toward at full distance, and how far (0..1). Lifts a near-black coat to a readable
     * species colour at range (warm brown bison, tan pronghorn, cool grey wolf) while keeping some of its own shading.
     */
    tint?: [number, number, number];
    mix?: number;
    /**
     * Ambient floor at full distance: the coat also gets this share of the scene's ambient light (self-lit by it), so animals
     * in shade or at dusk stay a value above the shadows instead of going black. Scales with the scene light, never glows.
     */
    floor?: number;
    /** Share of the sky fill removed in low light (stops pale coats glowing against a dark scene). Default 0. */
    lowFill?: number;
    /**
     * Silhouette at range, so each animal reads as its own shape from the drone and map views: the surfaces that face up are
     * pulled toward `top` by `topMix` (a pale back stripe on an oval), surfaces facing sideways and down darken by `side`
     * (a dark edge), the legs are toned by `legs` (pale legs read as bones from above) and swing `calm` less (a ragged
     * outline of splayed legs reads as crumpled paper). All fade in with distance like the rest of `far`.
     */
    top?: [number, number, number];
    topMix?: number;
    side?: number;
    legs?: number;
    calm?: number;
    /** Extra body width at range (fraction, full by about 380 m): a slender body is a stick from above, an oval reads as an animal. */
    widen?: number;
    /**
     * r-read: bright absolute markings (a pronghorn's or deer's white belly, flank band and legs) fade toward the cream-tan `col` by `k` at range, everywhere
     * except behind model-space x < `keepX` (the rump patch stays white). An all-white animal reads as chalk flecks, a tan one with a white rump as itself.
     */
    mute?: { col: [number, number, number]; k: number; keepX: number };
    /**
     * r-read: how much of the `read.rim` edge lift is withdrawn at range (0..1, fading in with the far distance). A pronghorn or deer 10 pixels long is all edge, so
     * the lift turns the whole animal pale and it reads as a chalk fleck; a dark bison keeps it, since the lift is what separates it from the shadow.
     */
    rimCut?: number;
  };
  /**
   * R-readable: value separation at the default distances (about 6 m and out, full by 40 m), by guild, against the season's grass. A
   * predator reads cooler and darker (`dark`, a multiplier on the albedo, strongest against bright grass), a grazer keeps its pale
   * markings brighter (`pale`, the rump and belly), and every coat gets a faint edge lift from the sky light (`rim`: colour and strength).
   * None of it lights the animal by itself: it scales with the scene's ambient light and fades with the dark.
   */
  read?: { dark?: [number, number, number]; pale?: number; rim?: [number, number, number, number] };
  triangles: number;
}

export const DEFAULT_PARAMS: AnimParams = {
  kind: 0,
  comY: 1,
  trot0: 1.6,
  trot1: 2.4,
  gal0: 4.5,
  gal1: 6,
  ampW: 0.42,
  ampT: 0.55,
  ampG: 0.78,
  kneeW: 0.5,
  kneeT: 0.7,
  kneeG: 1.0,
  bobW: 0.02,
  bobT: 0.04,
  bobG: 0.1,
  pitchT: 0.02,
  pitchG: 0.1,
  nodW: 0.07,
  nodG: 0.1,
  headDown: 1.0,
  lookYaw: 0.35,
  tailRest: 0,
  tailRun: 0.6,
  tailSway: 0.25,
  lieDrop: 0.5,
  lieHipF: 1.2,
  lieKneeF: -2.2,
  lieHipH: -0.9,
  lieKneeH: 2.0,
  crouchDrop: 0.1,
  deadDrop: 0.5,
  deadHipF: 0.9,
  deadHipH: -0.5,
  hockK: 0.8,
  // walk: four-beat lateral sequence, touchdowns hind left (0), front left (.25), hind right (.5), front right (.75)
  offW: [0.75, 0.25, 0.0, 0.5],
  // trot: diagonal pairs (FL with HR, FR with HL) half a cycle apart
  offT: [0.75, 0.25, 0.25, 0.75],
  // gallop: transverse, touchdowns hind right (-.08), hind left (0), front right (.42), front left (.5), two suspensions per cycle
  offG: [0.5, 0.58, 0.0, 0.08],
  dutyW: 0.62,
  dutyT: 0.5,
  dutyG: 0.42,
  strideW: 1.8,
  strideG: 5,
  strideSpeedMax: 12,
  flapHz: 4,
  length: 3,
  height: 1.8,
  ring: 2.2,
  minPx: 9,
  boostLen: 3,
};

/** r-alert2: the head of an animal watching a predator turns at most this far (rad) off its body axis. The bison packs the yaw in 7 bits (see packBisonA). */
export const ALERT_YAW_MAX = 1.0;
