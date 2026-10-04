// Tallgrass: the game. The simulation runs in a worker; this thread renders and handles input.
import * as THREE from 'three';
import { Engine } from './render/engine';
import { GrassField } from './render/grass';
import { AnimalLayer } from './render/animals';
import { OverlayLayer } from './render/overlay';
import { Cranes } from './render/cranes';
import { GameUI, type OverlayId, type ToolId } from './ui/ui';
import { loadSettings, type QualityPreset, type Settings } from './ui/settings';
import { titleWanted } from './ui/title';
import { decodeShare, shareUrl, type DecodedShare, type LoggedIntervention } from './sim/sharecode';
import { packName } from './ui/describe';
import { generateWorld } from './sim/world';
import { hashSeed } from './sim/rng';
import { scenarioById } from './scenarios';
import { challengeById } from './challenges';
import { Director } from './director';
import { AudioDirector } from './audio/audio';
import { Narrator } from './audio/narrator';
import { countNearby, nearWater01, scanTension } from './audio/inputs';
import type { TensionSample } from './audio/music';
import { DAY_TICKS, setCalendarScale, Sp, YEAR_TICKS, type Intervention, type Snapshot } from './sim/types';
import { applyOverrides, defaultParams } from './sim/params';
import { isPredator } from './sim/species';
import type { FromWorker, ToWorker } from './sim/worker';

const q = new URLSearchParams(location.search);
// a shared valley (?w=): the whole world, interventions included. A code that cannot be read starts the usual valley
let shared: DecodedShare | null = null;
let shareError = false;
if (q.has('w')) {
  try {
    shared = decodeShare(q.get('w') ?? '');
  } catch {
    shareError = true;
  }
}
// a challenge brings its own world: ?challenge=herd overrides seed and scenario (a share code overrides both)
const challenge = shared ? null : challengeById(q.get('challenge'));
const seedStr = shared ? String(shared.state.seed) : challenge?.seed ?? q.get('seed') ?? 'tallgrass';
const seed = shared ? shared.state.seed : /^\d+$/.test(seedStr) ? Number(seedStr) : hashSeed(seedStr);
const scenario = scenarioById(shared ? shared.state.scenario : challenge?.scenario ?? q.get('scenario') ?? 'prairie');

// picture quality: ?q= wins (captures pin it), else the player's saved preset, else High (today's look)
const savedSettings = loadSettings();
const startPreset: QualityPreset = q.has('q') ? (q.get('q') === 'medium' ? 'medium' : 'high') : savedSettings.quality;
const qualityTier = (p: QualityPreset): 'medium' | 'high' => (p === 'low' || p === 'medium' ? 'medium' : 'high');

const world = generateWorld(seed);
const host = document.getElementById('app')!;
const engine = new Engine(host, world, {
  quality: qualityTier(startPreset),
  toneMapping: (q.get('tm') as 'aces' | 'agx' | 'neutral' | null) ?? undefined,
});
// grass and animals sit on the terrain as rendered (the creek banks are reshaped for drawing)
const renderWorld = { ...world, height: engine.terrain.heightTex.image.data as Float32Array };
const grass = new GrassField(renderWorld, engine.vegTexture, { quality: qualityTier(startPreset), cloudShadow: engine.uniforms });
engine.scene.add(grass.object3D);
engine.excludeFromAO(grass.object3D);
if (q.get('grass') === '0') grass.object3D.visible = false;
const animals = new AnimalLayer(renderWorld);
engine.scene.add(animals.object3D);
engine.cam.preset((q.get('cam') as 'wide' | 'low' | 'top' | null) ?? 'wide', true);
// captures pin full resolution; players get an automatic render scale that holds 60 fps
engine.autoScale = q.get('autoscale') !== '0';
/**
 * Picture quality presets. Low and Medium use the engine's lighter tier (Low also draws at three quarters size), High is
 * the default look, Ultra pins full sharpness and supersamples ordinary screens. Low and Ultra switch the automatic
 * render scale off (it would undo their pixel ratio). Grass density is chosen when the grass is built, so a change of
 * tier there waits for the next load.
 */
let builtGrassTier = qualityTier(startPreset);
function applyQuality(p: QualityPreset): void {
  engine.setQuality(qualityTier(p));
  const dpr = window.devicePixelRatio || 1;
  if (p === 'low') {
    engine.autoScale = false;
    engine.renderer.setPixelRatio(Math.min(dpr, 1.25) * 0.75);
    engine.resize();
  } else if (p === 'ultra') {
    engine.autoScale = false;
    engine.renderer.setPixelRatio(Math.min(Math.max(dpr, 1.5), 2));
    engine.resize();
  } else {
    engine.autoScale = q.get('autoscale') !== '0';
  }
}
if (startPreset === 'low' || startPreset === 'ultra') applyQuality(startPreset);
const coverCell = world.size / world.n;
const director = new Director(engine.cam, (id, out) => animals.getPosition(id, out), world.size, (x, y) => {
  const cx = Math.floor(x / coverCell), cy = Math.floor(y / coverCell);
  return cx < 0 || cy < 0 || cx >= world.n || cy >= world.n ? 0 : world.cover[cy * world.n + cx];
});
// sound starts itself on the first click or key press (browser autoplay rules)
const audio = new AudioDirector();
void audio.load();
// sandhill crane flyovers: the audio schedules the calls, this draws the flock crossing the sky for the same seconds
const cranes = new Cranes(engine.uniforms, engine.camera, (x, z) => engine.groundHeight(x, z));
engine.scene.add(cranes.object3D);
engine.excludeFromAO(cranes.object3D);
engine.onFrame((dt) => cranes.update(dt));
audio.onFlyover = (f) => cranes.start({ ...f, delay: f.startAt - audio.now });
(window as unknown as Record<string, unknown>).__cranes = cranes;
// the documentary narrator: speaks on big events while the documentary camera or cinematic mode is filming
const narrator = new Narrator(audio);
void narrator.load();
window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') audio.setMuted(!audio.muted); });

// Photo mode: P saves the current frame as a PNG. The UI is HTML over the canvas, so the picture is clean.
window.addEventListener('keydown', (e) => {
  if ((e.key !== 'p' && e.key !== 'P') || e.repeat || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
  engine.renderOnce(0); // the drawing buffer is only readable in the same task as the render
  const year = pending ? Math.floor(pending.tick / YEAR_TICKS) + 1 : 1;
  engine.renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tallgrass-${seedStr.replace(/[^\w-]+/g, '_')}-year${year}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0.55;pointer-events:none;z-index:50;transition:opacity 0.35s ease-out';
  document.body.append(flash);
  requestAnimationFrame(() => { flash.style.opacity = '0'; });
  setTimeout(() => flash.remove(), 450);
});

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
  if (m.type === 'log') {
    finishShare(m.log);
    return;
  }
  if (m.type !== 'snap') return;
  // "Next event": collect what happened during the skip, then cut the camera to it
  if (m.speed === -1) { skipping = true; skipEvents = skipEvents.concat(m.events); }
  else if (skipping) {
    skipping = false;
    const evs = skipEvents.concat(m.events).filter((ev) => ev.x !== 0 || ev.y !== 0);
    skipEvents = [];
    const ev = evs[evs.length - 1];
    if (ev) { takeCamera(); engine.cam.follow(null); following = null; engine.cam.flyTo(ev.x, ev.y, 150, 28); }
  }
  // keep events and history from every message even if frames skip some
  pendingEvents = pendingEvents.concat(m.events);
  pendingHistory = pendingHistory.concat(m.history);
  if (m.veg) engine.setVeg(m.veg);
  if (m.traitGrid) overlay.setTraitGrid(m.traitGrid);
  overlay.setPacks(m.packs, m.packSerials.map(packName));
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
// dev: ?p=key:value,key:value overrides sim parameters on top of the scenario (for previewing experiments in the real game)
const devParams: Record<string, number> = {};
for (const kv of (q.get('p') ?? '').split(',')) {
  const [k, v] = kv.split(':');
  if (k && v !== undefined && Number.isFinite(Number(v))) devParams[k.trim()] = Number(v);
}
// a share code carries the complete param set (the scenario's included), so it replaces the scenario's own
const simParams: Record<string, number> = shared ? { ...shared.state.params } : { ...scenario.params, ...(challenge?.params ?? {}), ...devParams };
// the game's own clocks (UI calendar, weather easing) follow the same valley calendar as the sim in the worker
try { setCalendarScale(applyOverrides(defaultParams(), simParams).calendarScale); } catch { /* unknown dev param: the worker reports it */ }
send({ type: 'init', seed, params: simParams, schedule: scenario.schedule, replay: shared?.state.log });
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
  applyTool: (t) => { const iv = toolIntervention(t); if (iv && ui.tryUseTool()) send({ type: 'apply', iv }); },
  follow: (id) => {
    takeCamera();
    following = id;
    if (id === null) engine.cam.follow(null);
    else {
      const v = new THREE.Vector3();
      engine.cam.follow(() => (animals.getPosition(id, v) ? { x: v.x, y: v.z } : null));
    }
  },
  select: (id) => select(id),
  flyTo: (x, y) => { takeCamera(); engine.cam.flyTo(x, y); },
  setOverlay: (o: OverlayId) => overlay.setMode(o),
  setCinematic: (on) => { following = null; cinematicOn = on; autoCam = false; director.setEnabled(on); takeCamera(); },
  takeCamera: () => takeCamera(),
  setNarrator: (on) => { narrator.enabled = on; },
  newWorld: (s, sc) => {
    const u = new URL(location.href);
    u.searchParams.delete('challenge');
    u.searchParams.delete('w');
    u.searchParams.set('seed', s);
    u.searchParams.set('scenario', sc);
    location.href = u.toString();
  },
  startChallenge: (id) => {
    const u = new URL(location.href);
    u.searchParams.delete('w');
    u.searchParams.delete('seed');
    u.searchParams.delete('scenario');
    u.searchParams.set('challenge', id);
    location.href = u.toString();
  },
  share: () => send({ type: 'getLog' }),
  startValley: (s, params) => {
    // a fresh valley: the setup page's param overrides ride along as ?p=key:value,... (the same keys the harness uses)
    const u = new URL(location.href);
    for (const k of ['challenge', 'w', 'p', 'seed', 'scenario', 'notitle', 'title']) u.searchParams.delete(k);
    u.searchParams.set('seed', s);
    u.searchParams.set('scenario', 'prairie');
    const p = Object.entries(params).map(([k, v]) => `${k}:${v}`).join(',');
    if (p) u.searchParams.set('p', p);
    location.href = u.toString();
  },
  applySettings: (s, changed) => applySetting(s, changed),
  photograph: () => {
    // the drawing buffer is only readable in the same task as the render
    engine.renderOnce(0);
    return new Promise<Blob | null>((resolve) => engine.renderer.domElement.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
  },
});

// ------------------------------------------------------------------ share, settings, title

/** Copy text to the clipboard; falls back to a hidden textarea where the async clipboard is blocked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    ta.setAttribute('aria-hidden', 'true');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* nothing more to try */
    }
    ta.remove();
    return ok;
  }
}

/** The worker's reply to the share button: the intervention log, which with the seed and params is the whole valley. */
function finishShare(log: LoggedIntervention[]): void {
  const url = shareUrl(location.href, { seed, scenario: scenario.id, params: simParams, log });
  (window as unknown as Record<string, unknown>).__shareUrl = url;
  void copyText(url).then((ok) => {
    ui.shared(ok);
    if (ok) ui.notify('Valley link copied');
    else {
      // no clipboard at all: put the link in the address bar so it can be copied from there
      try { history.replaceState(null, '', url); } catch { /* ignore */ }
      ui.notify('Copy blocked. The link is now in the address bar.', 'Share', 5000);
    }
  });
}

/** What the audio module offers beyond the master volume: per-bus setters, if it has them (see the report). */
interface BusAudio {
  setBusVolume?: (bus: 'ambience' | 'music' | 'voice', v: number) => void;
}
const busAudio = audio as unknown as BusAudio;
const hasBuses = typeof busAudio.setBusVolume === 'function';

let autoCamEnabled = savedSettings.autoCamera;
let startNotice: { text: string; label: string; ms: number } | null = null;
function applySetting(s: Settings, changed: keyof Settings): void {
  switch (changed) {
    case 'quality':
      applyQuality(s.quality);
      if (qualityTier(s.quality) !== builtGrassTier) {
        builtGrassTier = qualityTier(s.quality);
        ui.notify('Grass detail changes the next time the page loads.', 'Picture', 4500);
      }
      break;
    case 'master':
      audio.setVolume(s.master);
      break;
    case 'ambience':
      busAudio.setBusVolume?.('ambience', s.ambience);
      break;
    case 'music':
      busAudio.setBusVolume?.('music', s.music);
      break;
    case 'narration':
      busAudio.setBusVolume?.('voice', s.narration);
      break;
    case 'autoCamera':
      autoCamEnabled = s.autoCamera;
      if (!autoCamEnabled && autoCam) takeCamera();
      break;
    default:
      break; // idleDim and uiScale are the interface's own
  }
}

ui.setChallenge(challenge);

const overlay = new OverlayLayer(world.size, (x, z) => engine.groundHeight(x, z), engine.uniforms, {
  labels: document.querySelector<HTMLElement>('.tg-ui') ?? document.body,
  legend: document.querySelector<HTMLElement>('.tg-overlay') ?? document.body,
});
engine.scene.add(overlay.object3D);
engine.excludeFromAO(overlay.object3D);

// Documentary camera by default: when nobody has touched the camera for a while, the director films hunts, kills,
// herds and vistas with the UI still up. Any camera input, fly-to, selection or follow hands control straight back.
const autoCamAllowed = q.get('autocam') !== '0';
let autoCam = false;
let cinematicOn = false;
let lastCamInput = performance.now();
function takeCamera(): void {
  lastCamInput = performance.now();
  if (autoCam) { autoCam = false; if (!cinematicOn) director.setEnabled(false); }
}
engine.cam.onUserInput = takeCamera;

// the saved settings take effect (the picture quality already did, at the engine); then the title card, on a plain visit only
{
  const s0 = ui.settings;
  audio.setVolume(s0.master);
  if (hasBuses) {
    busAudio.setBusVolume?.('ambience', s0.ambience);
    busAudio.setBusVolume?.('music', s0.music);
    busAudio.setBusVolume?.('voice', s0.narration);
  } else {
    ui.setBusesAvailable(false);
  }
  ui.setGuideToasts(!navigator.webdriver || q.get('title') === '1');
  // said once the valley is on screen (a toast shown while the page is still building would be gone before anyone saw it)
  if (shareError) startNotice = { text: 'That valley code could not be read. Starting the usual valley.', label: 'Share', ms: 6000 };
  else if (shared?.warning) startNotice = { text: shared.warning, label: 'Share', ms: 7000 };
  if (titleWanted(location.search, !!navigator.webdriver)) {
    ui.showTitle();
    // the valley is alive behind the card: the documentary camera drifts over it until somebody takes over
    if (autoCamAllowed && autoCamEnabled) { autoCam = true; director.setEnabled(true); }
  }
}

function select(id: number | null): void {
  if (id !== null) takeCamera();
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
      if (iv && ui.tryUseTool()) send({ type: 'apply', iv });
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
let guideAt = 0;
let nearbyCache = { bison: 0, wolf: 0, raven: 0, pronghorn: 0 };
let tensionCache: TensionSample | null = null;
const heardDeaths = new Map<number, number>();
// field notes: a fresh carcass with a predator beside it is a kill; one the documentary camera caught close to its focus
// earns "The documentary camera films a kill"
const focusV = new THREE.Vector3();
function predatorWithin(x: number, y: number, r: number): boolean {
  if (!pending) return false;
  const A = pending.agents;
  for (let k = 0; k < pending.count; k++) {
    const o = k * 12;
    if (!isPredator(A[o])) continue; // any registry predator (wolf, cougar, and later coyote and the raptors)
    if (Math.hypot(A[o + 1] - x, A[o + 2] - y) < r) return true;
  }
  return false;
}
const w = window as unknown as Record<string, unknown>;
w.__overlay = overlay;
engine.onFrame((dt, t) => {
  const alpha = Math.min(1, (performance.now() - lastTickChange) / Math.max(16, tickInterval));
  // legs keep pace with how fast the sim actually moves animals (capped where gaits would alias)
  animals.timeScale = speed > 0 ? Math.min(speed, 12) : 0;
  // years flying by: let the camera drift slowly instead of sitting like a security camera
  engine.cam.idleDrift = speed >= 10 ? 0.025 : 0;
  animals.update(dt, alpha, t);
  if (autoCamAllowed && autoCamEnabled && !autoCam && !cinematicOn && following === null && performance.now() - lastCamInput > 25000) {
    autoCam = true;
    director.setEnabled(true);
  }
  director.update(dt, pending ? { count: pending.count, ids: pending.ids, agents: pending.agents, carcassCount: pending.carcassCount, carcasses: pending.carcasses, dayFrac: pending.env.dayFrac } : null);
  grass.viewportHeight = engine.renderer.domElement.height;
  overlay.update(dt, engine.camera, engine.renderer.domElement);
  grass.update(engine.camera, t, engine.env, sun);
  if (pending) {
    ui.update({
      tick: pending.tick, env: pending.env, pop: pending.pop, history: pendingHistory, events: pendingEvents,
      selected: pending.selected, speed: pending.speed, ticksPerSec: pending.ticksPerSec, seed: seedStr,
      scenario: scenario.id, following, story: pending.story, storyId: pending.storyId,
      packs: pending.packs.length / 4, autoCamera: autoCam, narrator: narrator.enabled, caption: narrator.caption,
    });
    if (pending.selectedGone && following !== null) { following = null; engine.cam.follow(null); }
    const cp = engine.camera.position; // three x = sim x, three z = sim y
    const camHeight = Math.max(0, cp.y - engine.groundHeight(cp.x, cp.z));
    audioFrame++;
    // the field guide: what the camera is looking at, a few times a second, while time runs at a watchable pace
    if (!skipping && pending.speed >= 0 && pending.speed <= 10 && performance.now() - guideAt > 400) {
      guideAt = performance.now();
      engine.cam.getFocus(focusV);
      ui.observeGuide(pending.agents, pending.count, focusV.x, focusV.z);
    }
    if ((audioFrame & 3) === 0) { nearbyCache = countNearby(pending.agents, pending.count, cp.x, cp.z, 250); tensionCache = scanTension(pending.agents, pending.count, cp.x, cp.z, pending.carcasses, pending.carcassCount); }
    audio.update(dt, { env: pending.env, camX: cp.x, camY: cp.z, camHeight, speed: pending.speed, nearby: nearbyCache, nearWater: nearWater01(world, cp.x, cp.z), tension: tensionCache });
    if (!skipping) for (const ev of pendingEvents) if (ev.x !== 0 || ev.y !== 0) audio.onEvent(ev, Math.hypot(ev.x - cp.x, ev.y - cp.z, camHeight));
    if (!skipping) narrator.onEvents(pendingEvents, pending.tick);
    narrator.update({ filming: autoCam || cinematicOn, speed: pending.speed });
    // a fresh carcass near the camera: someone just died here
    if (!skipping && pending.speed > 0 && pending.speed <= 10) {
      const C = pending.carcasses;
      const filming = (autoCam || cinematicOn) && !ui.fieldNotes.has('documentary');
      if (filming) engine.cam.getFocus(focusV);
      for (let k = 0; k < pending.carcassCount; k++) {
        const o = k * 4;
        if (C[o + 2] < 0.985) continue;
        const key = Math.round(C[o]) * 1024 + Math.round(C[o + 1]);
        if (heardDeaths.has(key)) continue;
        heardDeaths.set(key, performance.now());
        const dist = Math.hypot(C[o] - cp.x, C[o + 1] - cp.z, camHeight);
        if (dist < 160) audio.onDeath(C[o + 3], dist);
        if (filming && Math.hypot(C[o] - focusV.x, C[o + 1] - focusV.z) < 80 && predatorWithin(C[o], C[o + 1], 35)) ui.noteFilmedKill();
      }
      if (heardDeaths.size > 400) for (const [key, t0] of heardDeaths) if (performance.now() - t0 > 60000) heardDeaths.delete(key);
    }
    pendingEvents = [];
    pendingHistory = [];
  }
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { w.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (ready && t > 1.5) {
    w.__ready = true;
    if (startNotice) {
      ui.notify(startNotice.text, startNotice.label, startNotice.ms);
      startNotice = null;
    }
  }
});
engine.start();

// hooks for capture scripts
w.__engine = engine;
w.__cam = (name: 'wide' | 'low' | 'top') => engine.cam.preset(name, true);
w.__speed = (s: number) => { speed = s; send({ type: 'speed', speed: s }); };
w.__step = (ticks: number) => send({ type: 'step', ticks });
w.__ui = ui;
w.__focusHerd = () => { if (pending) focusHerd(pending.agents, pending.count, true); };
/**
 * Frame the concept art's view (art/concept/00_prairie_golden_hour.jpg): the sharpest creek bend that has cottonwoods beside it, a high
 * oblique angle, low sun from the left, late summer. Pauses the sim and holds the env so a capture is repeatable. Returns the values used.
 */
let conceptHoldOn = false;
let conceptEnv: Partial<typeof engine.env> = {};
w.__concept = (o: { dist?: number; pitch?: number; sunOff?: number; shift?: number; side?: number; day?: number; season?: number } = {}) => {
  const cr = world.creek, tr = world.trees, S = world.size;
  let best = -1, bx = S / 2, bz = S / 2, bdx = 1, bdz = 0;
  for (let k = 5; k < cr.length / 2 - 5; k++) {
    const x = cr[2 * k], z = cr[2 * k + 1];
    if (x < 70 || z < 70 || x > S - 70 || z > S - 70) continue;
    const ax = x - cr[2 * k - 10], az = z - cr[2 * k - 9], cx = cr[2 * k + 10] - x, cz = cr[2 * k + 11] - z;
    const turn = Math.abs(Math.atan2(ax * cz - az * cx, ax * cx + az * cz));
    let n = 0;
    for (let i = 0; i < tr.length; i += 4) if (Math.hypot(tr[i] - x, tr[i + 1] - z) < 70) n++;
    const score = turn * n;
    if (score > best) { best = score; bx = x; bz = z; bdx = ax + cx; bdz = az + cz; }
  }
  const day = o.day ?? 0.28, season = o.season ?? 1.8;
  const hold: Partial<typeof engine.env> = { dayFrac: day, season, weather: 0, rain: 0, warmth: 0.7 };
  speed = 0; send({ type: 'speed', speed: 0 });
  following = null; lastCamInput = performance.now();
  const e = engine;
  if (!conceptHoldOn) { conceptHoldOn = true; e.onFrame(() => e.setEnv(conceptEnv)); }
  conceptEnv = hold;
  e.setEnv(hold); e.applyEnvNow();
  // sun to the left of the view direction (same convention as the 'wide' preset): camera sits behind the target, looking along fwd
  const sunAz = Math.atan2(e.uniforms.lightDir.value.x, e.uniforms.lightDir.value.z);
  const fwd = sunAz - (o.sunOff ?? 35) * Math.PI / 180;
  const dist = o.dist ?? 200, pitch = o.pitch ?? 19;
  const sh = (o.shift ?? 0) * dist; // slide the target along the view direction (negative = toward the camera)
  const sd = o.side ?? -40; // sideways slide of the target (m): negative puts the bend mid-left of the frame, positive mid-right
  e.cam.setView({ x: bx + Math.sin(fwd) * sh + Math.cos(fwd) * sd, y: bz + Math.cos(fwd) * sh - Math.sin(fwd) * sd, yawDeg: (fwd + Math.PI) * 180 / Math.PI, pitchDeg: pitch, distance: dist }, true);
  return { bend: [Math.round(bx), Math.round(bz)], creekDir: [Math.round(bdx), Math.round(bdz)], day, season, sunAzDeg: Math.round(sunAz * 180 / Math.PI), yawDeg: e.cam.yawDeg, pitch, dist };
};
w.__select = select;
w.__animals = animals;
w.__grass = grass;
w.__snap = () => pending;
w.__director = director;
w.__apply = (iv: Intervention) => send({ type: 'apply', iv });
w.__audio = audio;
w.__narrator = narrator;
// dev hook: window.__fieldnotes.debugEarn('fire') ticks a field note as if it had just happened
w.__fieldnotes = ui.fieldNotes;
// dev hook: speak one line by id, bypassing the narrator's rules (the audio must be unlocked by a click)
w.__narrate = (id: string) => narrator.speakNow(id);
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
