// Standalone dev page for the AnimalLayer: its own tiny scene (terrain, sun, fog), a fake 20 Hz snapshot
// generator, and camera presets. Does not import the real engine.
//
// Query: ?cam=wide|close|low|wolf|raven|cougar|stampede|carcass|lineup&count=300&pose=idle|walk|run|graze|rest|stalk|dead
//        &az=deg&el=deg&dist=m&fov=deg&hud=1&bench=1&time=seconds-to-fast-forward
import * as THREE from 'three';
import { generateWorld, sampleHeight } from '../src/sim/world';
import type { World } from '../src/sim/world';
import { AGENT_STRIDE, CARCASS_STRIDE, F_JUVENILE, F_MALE, Sp, St, SPECIES_COUNT } from '../src/sim/types';
import type { Snapshot } from '../src/sim/types';
import { AnimalLayer } from '../src/render/animals';

declare global {
  interface Window {
    __ready?: boolean;
    __fps?: number;
    __cam?: (name: string) => void;
    __bench?: (frames?: number) => number;
    __layer?: AnimalLayer;
    __pickTest?: () => string;
  }
}

const q = new URLSearchParams(location.search);
const qNum = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const CAM0 = q.get('cam') ?? 'wide';
const BISON_COUNT = Math.max(1, Math.floor(qNum('count', 300)));
const POSE = q.get('pose') ?? 'idle';

// ---------------------------------------------------------------------------------------------------------
// tiny seeded rng
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(12345);
const rr = (a: number, b: number): number => a + (b - a) * rnd();
const gauss = (): number => (rnd() + rnd() + rnd() + rnd() - 2) * 1.2;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------------------------------------------------
// renderer and scene
const world: World = generateWorld(1);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HORIZON = new THREE.Color().setHex(0xf0d3a2, THREE.SRGBColorSpace);
scene.fog = new THREE.Fog(HORIZON, 260, 1500);

// sky dome
{
  const g = new THREE.SphereGeometry(3000, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color().setHex(0x6f98d0, THREE.SRGBColorSpace) }, hor: { value: HORIZON } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 hor; void main(){ float h = clamp(normalize(vP).y*2.2, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h,0.7)), 1.0); }',
  });
  const sky = new THREE.Mesh(g, m);
  sky.renderOrder = -10;
  scene.add(sky);
}

const sun = new THREE.DirectionalLight(0xffd29a, 3.4);
const sunDir = new THREE.Vector3(Math.cos(0.5) * Math.cos(0.45), Math.sin(0.5), Math.cos(0.5) * Math.sin(0.45)).normalize(); // direction toward the sun
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xb7cdf0, 0x8a6b3c, 1.15));

function fitShadow(c: THREE.Vector3, extent: number): void {
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(sunDir, 300);
  const s = sun.shadow.camera;
  s.left = -extent; s.right = extent; s.top = extent; s.bottom = -extent;
  s.near = 1; s.far = 700;
  s.updateProjectionMatrix();
}

// terrain
function buildTerrain(): void {
  const hn = world.hn, n = world.n, cell = world.cell;
  const pos = new Float32Array(hn * hn * 3);
  const col = new Float32Array(hn * hn * 3);
  const gold = new THREE.Color().setHex(0xe0ad4c, THREE.SRGBColorSpace);
  const straw = new THREE.Color().setHex(0xcf9638, THREE.SRGBColorSpace);
  const green = new THREE.Color().setHex(0xa3a84a, THREE.SRGBColorSpace);
  const dirt = new THREE.Color().setHex(0x946a38, THREE.SRGBColorSpace);
  const water = new THREE.Color().setHex(0x3f6577, THREE.SRGBColorSpace);
  const c = new THREE.Color();
  for (let j = 0; j < hn; j++) {
    for (let i = 0; i < hn; i++) {
      const k = j * hn + i;
      pos[k * 3] = i * cell;
      pos[k * 3 + 1] = world.height[k];
      pos[k * 3 + 2] = j * cell;
      const ci = Math.min(n - 1, i), cj = Math.min(n - 1, j);
      const cidx = cj * n + ci;
      const noise = Math.sin(i * 0.9) * Math.sin(j * 1.3) * 0.5 + Math.sin(i * 0.23 + j * 0.31) * 0.5;
      c.copy(gold).lerp(straw, 0.5 + 0.5 * noise);
      c.lerp(green, clamp((world.moisture[cidx] - 0.45) * 2.2, 0, 0.8));
      c.lerp(dirt, clamp(world.slope[cidx] * 1.5 - 0.2, 0, 0.7));
      if (world.water[cidx]) c.copy(water);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((hn - 1) * (hn - 1) * 6);
  let t = 0;
  for (let j = 0; j < hn - 1; j++) {
    for (let i = 0; i < hn - 1; i++) {
      const a = j * hn + i, b = a + 1, cc = a + hn, d = cc + 1;
      idx[t++] = a; idx[t++] = cc; idx[t++] = b;
      idx[t++] = b; idx[t++] = cc; idx[t++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// find the flattest dry patch near the middle of the map for the stage
function findStage(): { x: number; y: number } {
  const n = world.n, cell = world.cell;
  let best = 1e9, bx = 256, by = 256;
  const R = 12; // cells
  for (let j = 70; j < n - 70; j += 6) {
    for (let i = 70; i < n - 70; i += 6) {
      let s = 0, w = 0;
      for (let dj = -R; dj <= R; dj += 4) for (let di = -R; di <= R; di += 4) {
        const k = (j + dj) * n + (i + di);
        s += world.slope[k];
        w += world.water[k] ? 5 : 0;
      }
      const dc = Math.hypot(i - n / 2, j - n / 2) / n;
      const score = s + w + dc * 3;
      if (score < best) { best = score; bx = (i + 0.5) * cell; by = (j + 0.5) * cell; }
    }
  }
  return { x: bx, y: by };
}
const STAGE = findStage();
if (CAM0 === 'lineup') {
  // flat, level platform for the model lineup
  const base = sampleHeight(world.height, world.hn, world.cell, STAGE.x, STAGE.y);
  for (let j = 0; j < world.hn; j++) {
    for (let i = 0; i < world.hn; i++) {
      const d = Math.hypot(i * world.cell - STAGE.x, j * world.cell - STAGE.y);
      const w = clamp((d - 28) / 22, 0, 1);
      const k = j * world.hn + i;
      world.height[k] = base + (world.height[k] - base) * (w * w * (3 - 2 * w));
    }
  }
}
buildTerrain();

// ---------------------------------------------------------------------------------------------------------
// fake simulation
interface Ag {
  id: number; sp: number; x: number; y: number; h: number; spd: number; sc: number; coat: number;
  st: number; fl: number; alt: number; energy: number; age: number;
  kind: string; ox: number; oy: number; seed: number; rest: boolean; t0: number;
}
interface Carc { x: number; y: number; rem: number; sp: number }

const HERD_R = Math.min(190, 4.7 * Math.sqrt(BISON_COUNT));
const stampedeCenter = { x: 0, y: 0 };
const herdCenter = { x: 0, y: 0 };
const pronghornCenter = { x: STAGE.x + 70, y: STAGE.y - 55 };
const carcA: Carc = { x: STAGE.x - 38, y: STAGE.y + 42, rem: 0.85, sp: Sp.Bison };
const carcB: Carc = { x: STAGE.x + 62, y: STAGE.y + 40, rem: 0.4, sp: Sp.Deer };
const carcC: Carc = { x: STAGE.x - 75, y: STAGE.y - 20, rem: 0.08, sp: Sp.Bison };
const carcs: Carc[] = [carcA, carcB, carcC];

let nextId = 1;
const agents: Ag[] = [];
const roles: Record<string, number> = {};

function add(sp: number, kind: string, x: number, y: number, h: number, o: Partial<Ag> = {}): Ag {
  const a: Ag = {
    id: nextId++, sp, x, y, h, spd: 0, sc: 1, coat: 0.5, st: St.Idle, fl: 0, alt: 0, energy: 0.7, age: 0.4,
    kind, ox: 0, oy: 0, seed: rnd(), rest: false, t0: rnd() * 100, ...o,
  };
  agents.push(a);
  return a;
}

function herdCenterAt(t: number): { x: number; y: number } {
  return { x: STAGE.x + 28 * Math.cos(t * 0.016), y: STAGE.y + 22 * Math.sin(t * 0.021) };
}

function buildScene(): void {
  // ?solo=wolf|cougar|coyote: one runner and a pack mate on the stampede circle, nothing else (clean strips of a gait)
  const soloSp = ({ wolf: Sp.Wolf, cougar: Sp.Cougar, coyote: Sp.Coyote } as Record<string, number>)[q.get('solo') ?? ''];
  if (soloSp !== undefined) {
    add(soloSp, 'chase', 0, 0, 0, { ox: 0, oy: 0, coat: 0.3, st: St.Chase });
    add(soloSp, 'chase', 0, 0, 0, { ox: -7, oy: 4, coat: 0.4, st: St.Chase });
    carcs.length = 0;
    roles.wolf = agents[0].id;
    return;
  }
  const lineup = CAM0 === 'lineup';
  if (lineup) {
    const sps = [Sp.Bison, Sp.Wolf, Sp.Deer, Sp.Cougar, Sp.Rabbit, Sp.Raven];
    const gap = 4.2;
    sps.forEach((sp, i) => {
      const a = add(sp, 'lineup', STAGE.x + (i - 2.5) * gap, STAGE.y, 0, { coat: sp === Sp.Wolf ? 0.2 : sp === Sp.Bison ? 0.6 : 0.4 });
      a.seed = 0.37 + i * 0.11;
      roles['lineup' + sp] = a.id;
    });
    // a juvenile bison and a pale wolf for scale / coat range
    add(Sp.Bison, 'lineup', STAGE.x - 3.2 * gap, STAGE.y + 2, 0, { sc: 0.5, coat: 0.3, fl: F_JUVENILE });
    add(Sp.Wolf, 'lineup', STAGE.x + 3.6 * gap, STAGE.y, 0, { coat: 0.75 });
    carcs.length = 0;
    if (POSE === 'dead') {
      const cx = [-8, -2.5, 3, 8.5];
      const rem = [1.0, 0.6, 0.3, 0.08];
      const csp = [Sp.Bison, Sp.Wolf, Sp.Deer, Sp.Bison];
      for (let i = 0; i < 4; i++) carcs.push({ x: STAGE.x + cx[i] * 1.6, y: STAGE.y + 6, rem: rem[i], sp: csp[i] });
    }
    return;
  }

  // grazing herd
  for (let i = 0; i < BISON_COUNT; i++) {
    const ang = rnd() * Math.PI * 2, rad = HERD_R * Math.sqrt(rnd());
    const ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad;
    const juv = rnd() < 0.15;
    const a = add(Sp.Bison, 'herd', STAGE.x + ox, STAGE.y + oy, rnd() * 6.28, {
      ox, oy, sc: juv ? rr(0.5, 0.6) : rr(0.92, 1.1), coat: clamp(0.62 + gauss() * 0.18, 0, 1),
      fl: (juv ? F_JUVENILE : 0) | (rnd() < 0.5 ? F_MALE : 0), rest: rnd() < 0.1,
    });
    a.st = a.rest ? St.Rest : St.Graze;
  }
  // stampede
  for (let i = 0; i < 80; i++) {
    const a = add(Sp.Bison, 'stamp', 0, 0, 0, { ox: gauss() * 14 - 4, oy: gauss() * 9, coat: clamp(0.6 + gauss() * 0.15, 0, 1), sc: rr(0.9, 1.08) });
    if (i < 10) { a.sc = rr(0.5, 0.6); a.fl |= F_JUVENILE; }
  }
  // wolves chasing
  for (let i = 0; i < 6; i++) add(Sp.Wolf, 'chase', 0, 0, 0, { ox: -22 - rnd() * 22, oy: (i - 2.5) * 6 + gauss() * 3, coat: clamp(0.25 + gauss() * 0.12, 0, 1), st: St.Chase });
  // resting / idle / walking wolves
  for (let i = 0; i < 3; i++) add(Sp.Wolf, 'wolfrest', STAGE.x + 45 + i * 3, STAGE.y - 28 + gauss() * 2, rnd() * 6.28, { st: St.Rest, coat: 0.25 + i * 0.1 });
  add(Sp.Wolf, 'wolfrest', STAGE.x + 52, STAGE.y - 24, 0.5, { st: St.Idle, coat: 0.2 });
  add(Sp.Wolf, 'wolfwalk', STAGE.x + 40, STAGE.y - 20, 0, { st: St.Walk, coat: 0.3, ox: 1 });
  const eater = add(Sp.Wolf, 'wolfeat', carcA.x + 3, carcA.y + 1, 3.6, { st: St.Eat, coat: 0.3 });
  roles.wolfEat = eater.id;
  // ravens
  for (let i = 0; i < 11; i++) {
    add(Sp.Raven, 'circle', 0, 0, 0, { ox: rr(14, 30), oy: rr(18, 38), seed: rnd(), st: St.Fly, alt: 20, coat: rnd() * 0.5, spd: rr(8, 10), rest: i >= 7 });
  }
  for (let i = 0; i < 4; i++) add(Sp.Raven, 'perch', carcA.x + gauss() * 2, carcA.y + gauss() * 2, rnd() * 6.28, { st: i % 2 ? St.Eat : St.Idle, coat: rnd() * 0.5 });
  // pronghorn
  for (let i = 0; i < 12; i++) {
    const juv = i < 2;
    add(Sp.Deer, 'prong', pronghornCenter.x + gauss() * 10, pronghornCenter.y + gauss() * 8, rnd() * 6.28, {
      ox: gauss() * 10, oy: gauss() * 8, sc: juv ? 0.6 : rr(0.92, 1.05), fl: juv ? F_JUVENILE : 0, st: St.Graze, coat: rnd(),
    });
  }
  for (let i = 0; i < 4; i++) add(Sp.Deer, 'prongflee', 0, 0, 0, { ox: i * 5, oy: gauss() * 3, st: St.Flee, coat: rnd() });
  // rabbits
  for (let i = 0; i < 22; i++) add(Sp.Rabbit, 'rabbit', STAGE.x + rr(-90, 90), STAGE.y + rr(-90, 90), rnd() * 6.28, { st: St.Idle, coat: rnd() });
  // cougar
  const cg = add(Sp.Cougar, 'cougar', pronghornCenter.x - 32, pronghornCenter.y + 20, 0.3, { st: St.Stalk, coat: 0.4 });
  roles.cougar = cg.id;
  add(Sp.Cougar, 'cougarrest', STAGE.x - 60, STAGE.y - 60, 1.0, { st: St.Rest, coat: 0.5 });

  roles.wolf = agents.find((a) => a.kind === 'chase')!.id;
  roles.raven = agents.find((a) => a.kind === 'circle')!.id;
  roles.perch = agents.find((a) => a.kind === 'perch')!.id;
  const dryAdult = (a: Ag) => {
    const ci = Math.min(world.n - 1, Math.floor(a.x / world.cell)), cj = Math.min(world.n - 1, Math.floor(a.y / world.cell));
    return a.kind === 'herd' && !a.rest && !(a.fl & F_JUVENILE) && world.waterDist[cj * world.n + ci] > 25 && Math.hypot(a.ox, a.oy) < 25;
  };
  roles.grazer = (agents.find(dryAdult) ?? agents.find((a) => a.kind === 'herd' && !a.rest)!).id;
}
buildScene();

// births and deaths: every few seconds some herd bison die (a carcass appears) and calves are born
function churn(): void {
  const herd = agents.filter((a) => a.kind === 'herd');
  for (let i = 0; i < 3 && herd.length > 20; i++) {
    const k = Math.floor(rnd() * herd.length);
    const a = herd.splice(k, 1)[0];
    agents.splice(agents.indexOf(a), 1);
    carcs.push({ x: a.x, y: a.y, rem: 1, sp: a.sp });
    if (carcs.length > 40) carcs.shift();
  }
  for (let i = 0; i < 4; i++) {
    const src = herd[Math.floor(rnd() * herd.length)];
    add(Sp.Bison, 'herd', src.x + gauss(), src.y + gauss(), rnd() * 6.28, { ox: src.ox, oy: src.oy, sc: 0.45, fl: F_JUVENILE, coat: 0.6, st: St.Graze });
  }
  for (const c of carcs) c.rem = Math.max(0.05, c.rem - 0.04);
}
const CHURN = q.get('churn') === '1';

function stepSim(dt: number, t: number): void {
  const hc = herdCenterAt(t);
  herdCenter.x = hc.x; herdCenter.y = hc.y;
  // stampede circle
  const R = 80, w = 11 / R;
  const sa = t * w;
  stampedeCenter.x = STAGE.x - 25 + Math.cos(sa) * R;
  stampedeCenter.y = STAGE.y - 5 + Math.sin(sa) * R;
  const tang = sa + Math.PI / 2;
  const ct = Math.cos(tang), st = Math.sin(tang);

  for (const a of agents) {
    switch (a.kind) {
      case 'lineup': {
        a.h = 0;
        a.alt = 0;
        const sp = a.sp;
        const pose = POSE;
        const walkV = [1.3, 1.4, 1.4, 1.2, 1.0, 8][sp], runV = [11, 12, 15, 10, 4, 9][sp];
        a.spd = pose === 'walk' ? walkV : pose === 'run' ? runV : 0;
        a.st = pose === 'walk' ? St.Walk : pose === 'run' ? (sp === Sp.Wolf ? St.Chase : St.Run) : pose === 'graze' ? St.Graze : pose === 'rest' ? St.Rest : pose === 'stalk' ? St.Stalk : St.Idle;
        if (sp === Sp.Raven) {
          if (pose === 'walk' || pose === 'run') { a.alt = 5; a.st = St.Fly; a.spd = 9; } else a.alt = 0;
          if (pose === 'graze') a.st = St.Eat;
        }
        break;
      }
      case 'herd': {
        if (a.rest) { a.spd = 0; a.st = St.Rest; break; }
        const tx = hc.x + a.ox + 2.5 * Math.sin(t * 0.13 + a.seed * 20), ty = hc.y + a.oy + 2.5 * Math.cos(t * 0.11 + a.seed * 30);
        const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
        let desired = a.h;
        if (d > 7) {
          desired = Math.atan2(dy, dx);
          a.spd = 1.3 + 0.2 * Math.sin(a.seed * 40);
          a.st = St.Walk;
        } else {
          a.spd = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.4 + a.seed * 50));
          desired = a.h + 0.4 * Math.sin(t * 0.17 + a.seed * 60);
          a.st = Math.sin(t * 0.1 + a.seed * 33) > 0.85 ? St.Idle : St.Graze;
          if (a.st === St.Idle) a.spd = 0;
        }
        a.h += clamp(wrap(desired - a.h), -1.2 * dt, 1.2 * dt);
        break;
      }
      case 'stamp': {
        const px = a.ox * ct - a.oy * st, py = a.ox * st + a.oy * ct;
        const nx = stampedeCenter.x + px, ny = stampedeCenter.y + py;
        a.h = tang + 0.05 * Math.sin(t * 1.3 + a.seed * 9);
        a.spd = 10.6 + 1.5 * Math.sin(t * 0.7 + a.seed * 40);
        a.x = nx; a.y = ny;
        a.st = St.Flee;
        break;
      }
      case 'chase': {
        const px = a.ox * ct - a.oy * st, py = a.ox * st + a.oy * ct;
        a.x = stampedeCenter.x + px; a.y = stampedeCenter.y + py;
        a.h = tang + 0.08 * Math.sin(t * 1.1 + a.seed * 9);
        a.spd = 12.5 + Math.sin(t * 0.9 + a.seed * 30);
        a.st = St.Chase;
        break;
      }
      case 'circle': {
        const cx = a.rest ? carcB.x : carcA.x;
        const cy = a.rest ? carcB.y : carcA.y;
        const rad = a.ox, v = a.spd || 9;
        const ang = (t * v) / rad + a.seed * 6.28;
        a.x = cx + Math.cos(ang) * rad;
        a.y = cy + Math.sin(ang) * rad;
        a.h = ang + Math.PI / 2;
        a.alt = a.oy + 4 * Math.sin(t * 0.3 + a.seed * 20);
        a.spd = v;
        a.st = St.Fly;
        break;
      }
      case 'perch': {
        a.spd = 0;
        a.alt = 0;
        a.h += 0.3 * dt * Math.sin(t * 0.7 + a.seed * 30);
        break;
      }
      case 'prong': {
        const tx = pronghornCenter.x + a.ox + 3 * Math.sin(t * 0.07 + a.seed * 20), ty = pronghornCenter.y + a.oy + 3 * Math.cos(t * 0.06 + a.seed * 30);
        const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
        let desired = a.h;
        if (d > 5) { desired = Math.atan2(dy, dx); a.spd = 1.4; a.st = St.Walk; } else { a.spd = 0.2; a.st = St.Graze; desired = a.h + 0.3 * Math.sin(t * 0.2 + a.seed * 50); }
        a.h += clamp(wrap(desired - a.h), -1.5 * dt, 1.5 * dt);
        break;
      }
      case 'prongflee': {
        const R2 = 55, w2 = 14 / R2, an = t * w2 + 2.0;
        const px = a.ox * Math.cos(an + Math.PI / 2) - a.oy * Math.sin(an + Math.PI / 2);
        const py = a.ox * Math.sin(an + Math.PI / 2) + a.oy * Math.cos(an + Math.PI / 2);
        a.x = STAGE.x - 60 + Math.cos(an) * R2 - px * 0.5;
        a.y = STAGE.y + 70 + Math.sin(an) * R2 - py * 0.5;
        a.h = an + Math.PI / 2;
        a.spd = 14;
        a.st = St.Flee;
        break;
      }
      case 'rabbit': {
        const cyc = (t * 0.2 + a.t0) % 1; // 0..0.25 hopping, rest idle
        if (cyc < 0.18) {
          a.spd = 3.2;
          a.st = St.Flee;
          a.h += 0.8 * Math.sin(a.seed * 40 + t * 2) * dt;
        } else {
          a.spd = 0;
          a.st = cyc < 0.6 ? St.Graze : St.Idle;
        }
        break;
      }
      case 'cougar': {
        const s = (t * 0.7) % 40;
        a.x = pronghornCenter.x - 32 + s;
        a.y = pronghornCenter.y + 20 - s * 0.45;
        a.h = Math.atan2(-0.45, 1);
        a.spd = 0.7;
        a.st = St.Stalk;
        break;
      }
      case 'wolfwalk': {
        a.h = -0.4 + 0.3 * Math.sin(t * 0.1);
        a.spd = 1.5;
        a.st = St.Walk;
        break;
      }
      default:
        break;
    }
    if (a.kind !== 'stamp' && a.kind !== 'chase' && a.kind !== 'circle' && a.kind !== 'prongflee' && a.kind !== 'cougar' && a.kind !== 'lineup') {
      a.x += Math.cos(a.h) * a.spd * dt;
      a.y += Math.sin(a.h) * a.spd * dt;
    }
  }
  // the carcass nearest the ravens slowly gets eaten
  carcB.rem = 0.4 + 0.05 * Math.sin(t * 0.05);
}

function makeSnapshot(tick: number): Snapshot {
  const n = agents.length;
  const ids = new Uint32Array(n);
  const ag = new Float32Array(n * AGENT_STRIDE);
  const pop = new Int32Array(SPECIES_COUNT);
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    ids[i] = a.id;
    const o = i * AGENT_STRIDE;
    ag[o] = a.sp; ag[o + 1] = a.x; ag[o + 2] = a.y; ag[o + 3] = a.h; ag[o + 4] = a.spd; ag[o + 5] = a.sc; ag[o + 6] = a.coat;
    ag[o + 7] = a.st; ag[o + 8] = a.fl; ag[o + 9] = a.alt; ag[o + 10] = a.energy; ag[o + 11] = a.age;
    pop[a.sp]++;
  }
  const carc = new Float32Array(carcs.length * CARCASS_STRIDE);
  carcs.forEach((c, i) => { carc[i * 4] = c.x; carc[i * 4 + 1] = c.y; carc[i * 4 + 2] = c.rem; carc[i * 4 + 3] = c.sp; });
  return {
    tick, count: n, ids, agents: ag, carcassCount: carcs.length, carcasses: carc, pop,
    env: { tick, year: 0, season: 1, dayFrac: 0.72, weather: 0, rain: 0, windDir: 0, windStrength: 0.3, warmth: 0.6 },
  };
}

// ---------------------------------------------------------------------------------------------------------
// layer and loop
const layer = new AnimalLayer(world);
scene.add(layer.object3D);
window.__layer = layer;

const SIM_DT = 0.05;
let simT = 0, tick = 0, acc = 0;
const fastForward = qNum('time', 0);
if (fastForward > 0) {
  for (let t = 0; t < fastForward; t += SIM_DT) { stepSim(SIM_DT, simT); simT += SIM_DT; tick++; }
}
stepSim(SIM_DT, simT);
layer.setSnapshot(makeSnapshot(tick));
stepSim(SIM_DT, simT + SIM_DT);
simT += SIM_DT; tick++;
layer.setSnapshot(makeSnapshot(tick));
let lastSnapWall = performance.now() / 1000;

// camera
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.3, 4000);
let camName = CAM0;
let userAz: number | null = q.has('az') ? (Number(q.get('az')) * Math.PI) / 180 : null;
let userEl: number | null = q.has('el') ? (Number(q.get('el')) * Math.PI) / 180 : null;
let userDist: number | null = q.has('dist') ? Number(q.get('dist')) : null;
if (q.has('fov')) { camera.fov = Number(q.get('fov')); camera.updateProjectionMatrix(); }

const tmp = new THREE.Vector3();
const tgt = new THREE.Vector3();
function followPos(role: string, out: THREE.Vector3): boolean {
  const id = roles[role];
  return id !== undefined && layer.getPosition(id, out);
}
function groundAt(x: number, z: number): number { return sampleHeight(world.height, world.hn, world.cell, x, z); }

interface Preset { az: number; el: number; dist: number; target: () => void; extent: number; yOff?: number }
const deg = Math.PI / 180;
function presets(): Record<string, Preset> {
  const setXY = (x: number, y: number, yo = 0) => { tgt.set(x, groundAt(x, y) + yo, y); };
  return {
    wide: { az: -35 * deg, el: 30 * deg, dist: BISON_COUNT > 1500 ? 330 : 125, extent: BISON_COUNT > 1500 ? 260 : 100,
      target: () => setXY((herdCenter.x * 2 + stampedeCenter.x) / 3, (herdCenter.y * 2 + stampedeCenter.y) / 3) },
    stampede: { az: 200 * deg, el: 28 * deg, dist: 90, extent: 80, target: () => setXY(stampedeCenter.x, stampedeCenter.y) },
    close: { az: 35 * deg, el: 14 * deg, dist: 7.5, extent: 30, target: () => { if (followPos('grazer', tmp)) tgt.copy(tmp).add(new THREE.Vector3(0, 0.9, 0)); } },
    low: { az: 80 * deg, el: 4 * deg, dist: 34, extent: 70, target: () => setXY(herdCenter.x, herdCenter.y, 1.3) },
    wolf: { az: 55 * deg, el: 12 * deg, dist: 6.5, extent: 40, target: () => { if (followPos('wolf', tmp)) tgt.copy(tmp).add(new THREE.Vector3(0, 0.5, 0)); } },
    raven: { az: 20 * deg, el: 8 * deg, dist: 9, extent: 60, target: () => { if (followPos('raven', tmp)) tgt.copy(tmp); } },
    ravens: { az: 120 * deg, el: 28 * deg, dist: 75, extent: 60, target: () => setXY(carcA.x, carcA.y, 15) },
    cougar: { az: 40 * deg, el: 10 * deg, dist: 6, extent: 40, target: () => { if (followPos('cougar', tmp)) tgt.copy(tmp).add(new THREE.Vector3(0, 0.4, 0)); } },
    carcass: { az: 30 * deg, el: 22 * deg, dist: 11, extent: 40, target: () => setXY(carcA.x, carcA.y, 0.6) },
    lineup: { az: 90 * deg, el: 6 * deg, dist: 34, extent: 24, target: () => {
      const f = q.get('focus');
      if (f !== null && followPos('lineup' + f, tmp)) tgt.copy(tmp).add(new THREE.Vector3(0, qNum('yoff', 0.6), 0));
      else setXY(STAGE.x, STAGE.y, 0.9);
    } },
  };
}
const PRE = presets();
function setCam(name: string): void {
  camName = PRE[name] ? name : 'wide';
  userAz = userEl = userDist = null;
}
window.__cam = setCam;
// project each living animal to the screen and make sure pick() finds something at its centre
window.__pickTest = (): string => {
  const rc = new THREE.Raycaster();
  const v = new THREE.Vector3();
  let hit = 0, exact = 0, tot = 0;
  for (const a of agents) {
    if (!layer.getPosition(a.id, v)) continue;
    v.y += a.sp === Sp.Raven ? 0.15 : a.sp === Sp.Bison ? 0.9 : 0.4;
    const nd = v.clone().project(camera);
    if (nd.z > 1 || Math.abs(nd.x) > 0.95 || Math.abs(nd.y) > 0.95) continue;
    tot++;
    rc.setFromCamera(new THREE.Vector2(nd.x, nd.y), camera);
    const id = layer.pick(rc);
    if (id !== null) hit++;
    if (id === a.id) exact++;
  }
  const msg = 'PICKTEST tested=' + tot + ' hit=' + hit + ' exact=' + exact;
  console.warn(msg);
  return msg;
};

function placeCamera(): void {
  const p = PRE[camName] ?? PRE.wide;
  p.target();
  const az = userAz ?? p.az, el = userEl ?? p.el, dist = userDist ?? p.dist;
  camera.position.set(tgt.x + dist * Math.cos(el) * Math.cos(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.sin(az));
  const gh = groundAt(camera.position.x, camera.position.z) + 1.0;
  if (camera.position.y < gh && camName !== 'ravens') camera.position.y = gh;
  camera.lookAt(tgt);
  fitShadow(tgt, p.extent);
}

// manual orbit (drag to rotate, wheel to zoom) for poking around
{
  let drag = false, lx = 0, ly = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { drag = false; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = PRE[camName] ?? PRE.wide;
    userAz = (userAz ?? p.az) - (e.clientX - lx) * 0.005;
    userEl = clamp((userEl ?? p.el) + (e.clientY - ly) * 0.005, 0.02, 1.5);
    lx = e.clientX; ly = e.clientY;
  });
  renderer.domElement.addEventListener('wheel', (e) => {
    const p = PRE[camName] ?? PRE.wide;
    userDist = clamp((userDist ?? p.dist) * Math.exp(e.deltaY * 0.001), 2, 800);
  });
  // click to select the animal under the cursor
  const rc = new THREE.Raycaster();
  renderer.domElement.addEventListener('click', (e) => {
    rc.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    layer.setSelected(layer.pick(rc));
  });
}
if (q.has('select')) {
  const role = q.get('select')!;
  const id = roles[role] ?? Number(role);
  layer.setSelected(id);
}
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------------------------------------------------
const hud = document.getElementById('hud')!;
const showHud = q.get('hud') === '1';
let frames = 0, last = performance.now(), fpsAcc = 0, fpsN = 0;
let prevT = performance.now() / 1000;

// Manual mode (?manual=1): the page does not run on its own; tools call window.__advance(dt) to step the fake sim and the layer by dt seconds
// of a virtual clock and render one frame, so a strip of poses can be taken at exact phases.
let manualNow = 0;
function frame(): void {
  const nowMs = q.get('manual') === '1' ? manualNow * 1000 : performance.now();
  const now = nowMs / 1000;
  const dt = Math.min(0.1, now - prevT);
  prevT = now;
  acc += dt;
  while (acc >= SIM_DT) {
    acc -= SIM_DT;
    stepSim(SIM_DT, simT);
    simT += SIM_DT;
    tick++;
    if (CHURN && tick % 20 === 0) churn();
    layer.setSnapshot(makeSnapshot(tick));
    lastSnapWall = now - acc;
  }
  const alpha = (now - lastSnapWall) / SIM_DT;
  layer.update(dt, alpha, now);
  placeCamera();
  renderer.render(scene, camera);

  frames++;
  fpsAcc += 1 / Math.max(dt, 1e-4);
  fpsN++;
  if (nowMs - last > 500) {
    window.__fps = Math.round(((frames * 1000) / (nowMs - last)) * 10) / 10;
    frames = 0;
    last = nowMs;
    fpsAcc = 0; fpsN = 0;
    if (showHud) {
      hud.textContent = `fps ${window.__fps}  agents ${agents.length}  tris ${(layer.triangleCount / 1e6).toFixed(2)}M  draws ${renderer.info.render.calls}  cam ${camName}`;
    }
  }
  if (!window.__ready && ++readyFrames > 8) window.__ready = true;
  if (q.get('manual') !== '1') requestAnimationFrame(frame);
}
let readyFrames = 0;

// synchronous benchmark: back-to-back renders with a GPU sync, returns ms per frame
window.__bench = (frames = 60): number => {
  const gl = renderer.getContext();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    const nowB = performance.now() / 1000;
    layer.update(1 / 60, ((nowB * 10) % 1), nowB);
    placeCamera();
    renderer.render(scene, camera);
    gl.finish();
  }
  return (performance.now() - t0) / frames;
};

if (q.get('manual') === '1') {
  manualNow = performance.now() / 1000;
  prevT = manualNow;
  (window as unknown as Record<string, unknown>).__advance = (dt: number): void => { manualNow += dt; frame(); };
  window.__ready = true;
} else requestAnimationFrame(frame);
if (q.get('picktest') === '1') setTimeout(() => window.__pickTest!(), 2500);
if (q.get('bench') === '1') {
  setTimeout(() => {
    const ms = window.__bench!(90);
    console.warn(`BENCH ${ms.toFixed(2)} ms/frame (${(1000 / ms).toFixed(0)} fps) agents=${agents.length}`);
    (window as unknown as Record<string, unknown>).__benchMs = ms;
  }, 2500);
}
