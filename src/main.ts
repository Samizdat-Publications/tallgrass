// Tallgrass: the game. The simulation runs in a worker; this thread renders and handles input.
import * as THREE from 'three';
import { Engine } from './render/engine';
import { GrassField } from './render/grass';
import { AnimalLayer } from './render/animals';
import { GameUI, type OverlayId, type ToolId } from './ui/ui';
import { generateWorld } from './sim/world';
import { hashSeed } from './sim/rng';
import { scenarioById } from './scenarios';
import { Director } from './director';
import { AudioDirector } from './audio/audio';
import { countNearby, nearWater01 } from './audio/inputs';
import { DAY_TICKS, Sp, type Intervention, type Snapshot } from './sim/types';
import type { FromWorker, ToWorker } from './sim/worker';

const q = new URLSearchParams(location.search);
const seedStr = q.get('seed') ?? 'tallgrass';
const seed = /^\d+$/.test(seedStr) ? Number(seedStr) : hashSeed(seedStr);
const scenario = scenarioById(q.get('scenario') ?? 'prairie');

const world = generateWorld(seed);
const host = document.getElementById('app')!;
const engine = new Engine(host, world, {
  quality: q.get('q') === 'medium' ? 'medium' : 'high',
  toneMapping: (q.get('tm') as 'aces' | 'agx' | 'neutral' | null) ?? undefined,
});
// grass and animals sit on the terrain as rendered (the creek banks are reshaped for drawing)
const renderWorld = { ...world, height: engine.terrain.heightTex.image.data as Float32Array };
const grass = new GrassField(renderWorld, engine.vegTexture, { quality: q.get('q') === 'medium' ? 'medium' : 'high' });
engine.scene.add(grass.object3D);
engine.excludeFromAO(grass.object3D);
if (q.get('grass') === '0') grass.object3D.visible = false;
const animals = new AnimalLayer(renderWorld);
engine.scene.add(animals.object3D);
engine.cam.preset((q.get('cam') as 'wide' | 'low' | 'top' | null) ?? 'wide', true);
const director = new Director(engine.cam, (id, out) => animals.getPosition(id, out), world.size);
// sound starts itself on the first click or key press (browser autoplay rules)
const audio = new AudioDirector();
void audio.load();
window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') audio.setMuted(!audio.muted); });

// ------------------------------------------------------------------ worker

const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);

let speed = Number(q.get('speed') ?? 1);
let following: number | null = null;
let armed: ToolId | null = null;
let lastTickChange = performance.now();
let tickInterval = 100;
let lastTick = -1;
let ready = false;
let pending: Extract<FromWorker, { type: 'snap' }> | null = null;
let pendingEvents: Extract<FromWorker, { type: 'snap' }>['events'] = [];
let pendingHistory: Extract<FromWorker, { type: 'snap' }>['history'] = [];

let skipping = false;
let skipEvents: Extract<FromWorker, { type: 'snap' }>['events'] = [];

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const m = e.data;
  if (m.type !== 'snap') return;
  // "Next event": collect what happened during the skip, then cut the camera to it
  if (m.speed === -1) { skipping = true; skipEvents = skipEvents.concat(m.events); }
  else if (skipping) {
    skipping = false;
    const evs = skipEvents.concat(m.events).filter((ev) => ev.x !== 0 || ev.y !== 0);
    skipEvents = [];
    const ev = evs[evs.length - 1];
    if (ev) { engine.cam.follow(null); following = null; engine.cam.flyTo(ev.x, ev.y, 150, 28); }
  }
  // keep events and history from every message even if frames skip some
  pendingEvents = pendingEvents.concat(m.events);
  pendingHistory = pendingHistory.concat(m.history);
  if (m.veg) engine.setVeg(m.veg);
  engine.setEnv(m.env);
  if (m.tick !== lastTick) {
    const now = performance.now();
    if (lastTick >= 0) tickInterval = tickInterval * 0.8 + Math.min(500, now - lastTickChange) * 0.2;
    lastTickChange = now;
    lastTick = m.tick;
    const snap: Snapshot = {
      tick: m.tick, env: m.env, count: m.count, ids: m.ids, agents: m.agents,
      carcassCount: m.carcassCount, carcasses: m.carcasses, pop: Int32Array.from(m.pop),
    };
    animals.setSnapshot(snap);
  }
  pending = m;
  if (!ready) {
    ready = true;
    engine.applyEnvNow();
    if (!q.has('cam')) focusHerd(m.agents, m.count, true);
  }
};
send({ type: 'init', seed, params: scenario.params, schedule: scenario.schedule });
send({ type: 'speed', speed });

/** Frame the biggest bison herd like a documentary opening shot. */
function focusHerd(agents: Float32Array, count: number, snap = false): void {
  const B = 24, cs = world.size / B;
  const hist = new Int32Array(B * B);
  for (let k = 0; k < count; k++) {
    const o = k * 12;
    if (agents[o] !== Sp.Bison) continue;
    const bx = Math.min(B - 1, Math.max(0, Math.floor(agents[o + 1] / cs)));
    const by = Math.min(B - 1, Math.max(0, Math.floor(agents[o + 2] / cs)));
    hist[by * B + bx]++;
  }
  let best = 0;
  for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b;
  const x = ((best % B) + 0.5) * cs, y = (Math.floor(best / B) + 0.5) * cs;
  engine.cam.setView({ x, y, distance: 135, pitchDeg: 26 }, snap);
}

// ------------------------------------------------------------------ interventions

function toolIntervention(tool: ToolId, x?: number, y?: number): Intervention | null {
  switch (tool) {
    case 'rain': return { kind: 'rain', ticks: 1600 };
    case 'drought': return { kind: 'drought', ticks: 2400 * 1.5, severity: 0.85 };
    case 'plague': return { kind: 'plague', species: Sp.Bison, fraction: 0.25 };
    case 'cull': return { kind: 'cull', species: Sp.Bison, fraction: 0.7 };
    case 'removeWolves': return { kind: 'remove', species: Sp.Wolf };
    case 'fire': return x !== undefined && y !== undefined ? { kind: 'fire', x, y } : null;
    case 'addWolves': return { kind: 'introduce', species: Sp.Wolf, count: 6, x, y };
    case 'addBison': return { kind: 'introduce', species: Sp.Bison, count: 40, x, y };
  }
  return null;
}

const ui = new GameUI(document.getElementById('ui')!, {
  setSpeed: (s) => { speed = s; send({ type: 'speed', speed: s }); },
  skipToEvent: () => send({ type: 'skip' }),
  armTool: (t) => { armed = t; ui.setArmedTool(t); host.style.cursor = t ? 'crosshair' : ''; },
  applyTool: (t) => { const iv = toolIntervention(t); if (iv) send({ type: 'apply', iv }); },
  follow: (id) => {
    following = id;
    if (id === null) engine.cam.follow(null);
    else {
      const v = new THREE.Vector3();
      engine.cam.follow(() => (animals.getPosition(id, v) ? { x: v.x, y: v.z } : null));
    }
  },
  select: (id) => select(id),
  flyTo: (x, y) => engine.cam.flyTo(x, y),
  setOverlay: (o: OverlayId) => engine.setFearOverlay(o === 'fear' ? 0.85 : 0),
  setCinematic: (on) => { following = null; director.setEnabled(on); },
  newWorld: (s, sc) => {
    const u = new URL(location.href);
    u.searchParams.set('seed', s);
    u.searchParams.set('scenario', sc);
    location.href = u.toString();
  },
});

function select(id: number | null): void {
  animals.setSelected(id);
  send({ type: 'select', id });
  if (id === null && following !== null) { following = null; engine.cam.follow(null); }
}

// ------------------------------------------------------------------ pointer: pick animals, place tools

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downX = 0, downY = 0;
const canvas = engine.renderer.domElement;
canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5 || e.button !== 0) return; // a drag, not a click
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, engine.camera);
  if (armed) {
    const hit = groundHit(ray);
    if (hit) {
      const iv = toolIntervention(armed, hit.x, hit.z);
      if (iv) send({ type: 'apply', iv });
    }
    armed = null;
    ui.setArmedTool(null);
    host.style.cursor = '';
    return;
  }
  select(animals.pick(ray));
});

function groundHit(r: THREE.Raycaster): THREE.Vector3 | null {
  const o = r.ray.origin, d = r.ray.direction;
  const p = new THREE.Vector3();
  let prevAbove = true;
  for (let t = 0; t < 2000; t += 1.5) {
    p.copy(o).addScaledVector(d, t);
    const above = p.y > engine.groundHeight(p.x, p.z);
    if (!above && prevAbove && t > 0) {
      if (p.x < 0 || p.z < 0 || p.x > world.size || p.z > world.size) return null;
      return p;
    }
    prevAbove = above;
  }
  return null;
}

// ------------------------------------------------------------------ frame

const sun = { dir: engine.uniforms.lightDir.value, color: engine.uniforms.lightColor.value };
let fpsAcc = 0, fpsN = 0;
let audioFrame = 0;
let nearbyCache = { bison: 0, wolf: 0, raven: 0, pronghorn: 0 };
const w = window as unknown as Record<string, unknown>;
engine.onFrame((dt, t) => {
  const alpha = Math.min(1, (performance.now() - lastTickChange) / Math.max(16, tickInterval));
  // legs keep pace with how fast the sim actually moves animals (capped where gaits would alias)
  animals.timeScale = speed > 0 ? Math.min(speed, 12) : 0;
  animals.update(dt, alpha, t);
  director.update(dt, pending ? { count: pending.count, ids: pending.ids, agents: pending.agents, carcassCount: pending.carcassCount, carcasses: pending.carcasses, dayFrac: pending.env.dayFrac } : null);
  grass.viewportHeight = engine.renderer.domElement.height;
  grass.update(engine.camera, t, engine.env, sun);
  if (pending) {
    ui.update({
      tick: pending.tick, env: pending.env, pop: pending.pop, history: pendingHistory, events: pendingEvents,
      selected: pending.selected, speed: pending.speed, ticksPerSec: pending.ticksPerSec, seed: seedStr,
      scenario: scenario.id, following,
    });
    if (pending.selectedGone && following !== null) { following = null; engine.cam.follow(null); }
    const cp = engine.camera.position; // three x = sim x, three z = sim y
    const camHeight = Math.max(0, cp.y - engine.groundHeight(cp.x, cp.z));
    audioFrame++;
    if ((audioFrame & 3) === 0) nearbyCache = countNearby(pending.agents, pending.count, cp.x, cp.z, 250);
    audio.update(dt, { env: pending.env, camX: cp.x, camY: cp.z, camHeight, speed: pending.speed, nearby: nearbyCache, nearWater: nearWater01(world, cp.x, cp.z) });
    if (!skipping) for (const ev of pendingEvents) if (ev.x !== 0 || ev.y !== 0) audio.onEvent(ev, Math.hypot(ev.x - cp.x, ev.y - cp.z, camHeight));
    pendingEvents = [];
    pendingHistory = [];
  }
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { w.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (ready && t > 1.5) w.__ready = true;
});
engine.start();

// hooks for capture scripts
w.__engine = engine;
w.__cam = (name: 'wide' | 'low' | 'top') => engine.cam.preset(name, true);
w.__speed = (s: number) => { speed = s; send({ type: 'speed', speed: s }); };
w.__step = (ticks: number) => send({ type: 'step', ticks });
w.__ui = ui;
w.__focusHerd = () => { if (pending) focusHerd(pending.agents, pending.count, true); };
w.__select = select;
w.__animals = animals;
w.__grass = grass;
w.__snap = () => pending;
w.__director = director;
w.__apply = (iv: Intervention) => send({ type: 'apply', iv });
w.__audio = audio;
w.__followId = (id: number | null) => {
  following = id;
  if (id === null) { engine.cam.follow(null); return; }
  const v = new THREE.Vector3();
  engine.cam.follow(() => (animals.getPosition(id, v) ? { x: v.x, y: v.z } : null));
};
/** Advance the sim (synchronously in the worker) to the next time the day reaches `frac`. */
w.__timeOfDay = (frac: number) => {
  if (!pending) return;
  const ticks = Math.round((((frac - pending.env.dayFrac) % 1) + 1) % 1 * DAY_TICKS);
  if (ticks > 0) send({ type: 'step', ticks });
};
/** Find agents in the latest snapshot: species and optional state filter; returns ids. */
w.__find = (sp: number, state?: number) => {
  const out: number[] = [];
  if (!pending) return out;
  for (let k = 0; k < pending.count; k++) {
    const o = k * 12;
    if (pending.agents[o] === sp && (state === undefined || pending.agents[o + 7] === state)) out.push(pending.ids[k]);
  }
  return out;
};
