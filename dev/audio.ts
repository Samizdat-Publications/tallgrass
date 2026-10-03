// Audio demo page: drives AudioDirector with sliders and event buttons, no 3D scene.
// Query presets: ?day=0&season=3.5&rain=0.8&wind=0.7&cam=300&water=1&weather=3&wolf=6&bison=30&raven=8&speed=1&start=1
// Page contract: window.__ready = true once every file is decoded. window.__audio is the director, window.__demo the state.
import { AudioDirector } from '../src/audio/audio';
import type { AudioFrame } from '../src/audio/audio';
import { BED_NAMES, bedMix } from '../src/audio/mix';
import type { EnvState } from '../src/sim/types';
import type { SimEvent, SimEventKind } from '../src/sim/sim';

declare global {
  interface Window {
    __ready?: boolean;
    __audio?: AudioDirector;
    __demo?: Record<string, number | boolean>;
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);

// ---- state -----------------------------------------------------------------------------------------------------

const S: Record<string, number | boolean> = {
  dayFrac: num('day', 0.72), season: num('season', 1.5), weather: num('weather', 0), rain: num('rain', 0), wind: num('wind', 0.45),
  cam: num('cam', 30), water: num('water', 0), bison: num('bison', 20), wolf: num('wolf', 0), raven: num('raven', 0), pronghorn: num('pronghorn', 0),
  speed: num('speed', 1), distance: 150, advance: false,
};
window.__demo = S;

const log = (msg: string): void => {
  const el = $('log');
  const line = document.createElement('div');
  line.textContent = new Date().toLocaleTimeString() + '  ' + msg;
  el.prepend(line);
  while (el.childElementCount > 60) el.lastElementChild?.remove();
  console.log('[audio-demo] ' + msg);
};

// ---- controls ---------------------------------------------------------------------------------------------------

interface Ctl { key: string; label: string; min: number; max: number; step: number; fmt?: (v: number) => string }
const worldCtls: Ctl[] = [
  { key: 'dayFrac', label: 'Time of day', min: 0, max: 1, step: 0.005, fmt: (v) => v.toFixed(3) + '  ' + clock(v) },
  { key: 'season', label: 'Season', min: 0, max: 3.999, step: 0.01, fmt: (v) => v.toFixed(2) + '  ' + ['spring', 'summer', 'autumn', 'winter'][Math.floor(v)] },
  { key: 'rain', label: 'Rain', min: 0, max: 1, step: 0.01 },
  { key: 'wind', label: 'Wind', min: 0, max: 1, step: 0.01 },
];
const camCtls: Ctl[] = [
  { key: 'cam', label: 'Camera height', min: 0, max: 500, step: 1, fmt: (v) => v.toFixed(0) + ' m' },
  { key: 'water', label: 'Near water', min: 0, max: 1, step: 0.01 },
  { key: 'bison', label: 'Bison nearby', min: 0, max: 80, step: 1, fmt: (v) => v.toFixed(0) },
  { key: 'wolf', label: 'Wolves nearby', min: 0, max: 16, step: 1, fmt: (v) => v.toFixed(0) },
  { key: 'raven', label: 'Ravens nearby', min: 0, max: 40, step: 1, fmt: (v) => v.toFixed(0) },
  { key: 'pronghorn', label: 'Pronghorn nearby', min: 0, max: 80, step: 1, fmt: (v) => v.toFixed(0) },
  { key: 'speed', label: 'Sim speed', min: 0, max: 100, step: 1, fmt: (v) => (v === 0 ? 'paused' : v.toFixed(0) + 'x') },
];

function clock(v: number): string {
  const h = Math.floor(v * 24) % 24;
  const m = Math.floor(((v * 24) % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

const outs = new Map<string, () => void>();
function addSlider(parent: HTMLElement, c: Ctl): void {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.textContent = c.label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(c.min);
  input.max = String(c.max);
  input.step = String(c.step);
  input.id = 'in_' + c.key;
  const out = document.createElement('output');
  const sync = () => {
    input.value = String(S[c.key]);
    out.textContent = c.fmt ? c.fmt(Number(S[c.key])) : Number(S[c.key]).toFixed(2);
  };
  input.addEventListener('input', () => {
    S[c.key] = Number(input.value);
    sync();
  });
  outs.set(c.key, sync);
  sync();
  row.append(label, input, out);
  parent.append(row);
}
worldCtls.forEach((c) => addSlider($('world'), c));
camCtls.forEach((c) => addSlider($('cam'), c));

// weather select lives under the world sliders
{
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.textContent = 'Weather';
  const sel = document.createElement('select');
  ['clear', 'rain', 'drought', 'storm', 'snow'].forEach((n, i) => sel.add(new Option(n, String(i))));
  sel.value = String(S.weather);
  sel.id = 'weather';
  sel.addEventListener('change', () => (S.weather = Number(sel.value)));
  outs.set('weather', () => (sel.value = String(S.weather)));
  row.append(label, sel);
  $('world').append(row);
}

// presets
const PRESETS: Record<string, Partial<Record<string, number>>> = {
  'Golden hour, summer': { dayFrac: 0.72, season: 1.5, rain: 0, weather: 0, wind: 0.45, cam: 30, water: 0 },
  'Noon, high above': { dayFrac: 0.5, season: 1.5, rain: 0, weather: 0, wind: 0.5, cam: 420, water: 0 },
  'Night with wolves': { dayFrac: 0.95, season: 1.5, rain: 0, weather: 0, wind: 0.3, cam: 20, wolf: 6 },
  'Thunderstorm': { dayFrac: 0.6, season: 1.2, rain: 0.95, weather: 3, wind: 0.85, cam: 40 },
  'Winter dusk': { dayFrac: 0.78, season: 3.5, rain: 0, weather: 0, wind: 0.6, cam: 40 },
  'Creekside morning': { dayFrac: 0.3, season: 0.8, rain: 0, weather: 0, wind: 0.3, cam: 6, water: 1 },
  'Among the herd': { dayFrac: 0.45, season: 1.6, cam: 8, bison: 40, raven: 8 },
};
{
  const sel = $<HTMLSelectElement>('preset');
  sel.add(new Option('(choose)', ''));
  Object.keys(PRESETS).forEach((n) => sel.add(new Option(n, n)));
  sel.addEventListener('change', () => {
    const p = PRESETS[sel.value];
    if (!p) return;
    Object.assign(S, p);
    outs.forEach((f) => f());
    log('preset: ' + sel.value);
  });
}

// ---- director ---------------------------------------------------------------------------------------------------

const audio = new AudioDirector();
window.__audio = audio;

const EVENTS: Array<{ label: string; kind: SimEventKind; sp: number; a: number }> = [
  { label: 'Stampede (25)', kind: 'stampede', sp: 0, a: 25 },
  { label: 'Stampede (60)', kind: 'stampede', sp: 0, a: 60 },
  { label: 'Pack founded', kind: 'packFounded', sp: 1, a: 1 },
  { label: 'Pack lost', kind: 'packLost', sp: 1, a: 1 },
  { label: 'First kill', kind: 'firstKill', sp: 1, a: 0 },
  { label: 'Fire', kind: 'fire', sp: 0, a: 0 },
  { label: 'Wolves extinct', kind: 'extinct', sp: 1, a: 0 },
  { label: 'Drought (silent)', kind: 'drought', sp: 0, a: 0 },
];
for (const ev of EVENTS) {
  const b = document.createElement('button');
  b.textContent = ev.label;
  b.addEventListener('click', () => fire(ev.kind, ev.sp, ev.a));
  $('events').append(b);
}
function fire(kind: SimEventKind, sp: number, a: number): void {
  const e: SimEvent = { tick: 0, kind, sp, x: 256, y: 256, a, b: 0 };
  audio.onEvent(e, Number(S.distance));
  log('event ' + kind + ' at ' + Number(S.distance).toFixed(0) + ' m');
}
$('dist').addEventListener('input', () => {
  S.distance = Number(($('dist') as HTMLInputElement).value);
  $('distOut').textContent = S.distance + ' m';
});
$('vol').addEventListener('input', () => {
  const v = Number(($('vol') as HTMLInputElement).value);
  audio.setVolume(v);
  $('volOut').textContent = v.toFixed(2);
});
$('mute').addEventListener('change', () => audio.setMuted(($('mute') as HTMLInputElement).checked));
$('advance').addEventListener('change', () => (S.advance = ($('advance') as HTMLInputElement).checked));
$('start').addEventListener('click', () => {
  audio.resume();
  log('start audio pressed');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    const c = $('mute') as HTMLInputElement;
    c.checked = !c.checked;
    audio.setMuted(c.checked);
  }
});

// bed bars
const bars = new Map<string, { fill: HTMLElement; val: HTMLElement }>();
for (const name of BED_NAMES) {
  const row = document.createElement('div');
  row.className = 'mix';
  const label = document.createElement('span');
  label.textContent = name;
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  track.append(fill);
  const val = document.createElement('span');
  row.append(label, track, val);
  $('beds').append(row);
  bars.set(name, { fill, val });
}

// ---- frame loop -------------------------------------------------------------------------------------------------

function envNow(): EnvState {
  const season = Number(S.season);
  const day = Number(S.dayFrac);
  const seasonal = 0.5 + 0.5 * Math.cos(((season - 1.4) / 4) * Math.PI * 2);
  const daily = 0.08 * Math.sin((day - 0.3) * Math.PI * 2);
  return {
    tick: 0, year: 0, season, dayFrac: day, weather: Number(S.weather) as EnvState['weather'], rain: Number(S.rain), windDir: 0.6,
    windStrength: Number(S.wind), warmth: Math.max(0, Math.min(1, seasonal + daily)),
  };
}

const meterBuf = new Float32Array(1024);
let last = performance.now();
let lastMeter = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.advance) {
    S.dayFrac = (Number(S.dayFrac) + dt / 60) % 1;
    outs.get('dayFrac')?.();
  }
  const env = envNow();
  const f: AudioFrame = {
    env, camX: 256, camY: 256, camHeight: Number(S.cam), speed: Number(S.speed), nearWater: Number(S.water),
    nearby: { bison: Number(S.bison), wolf: Number(S.wolf), raven: Number(S.raven), pronghorn: Number(S.pronghorn) },
  };
  audio.update(dt, f);

  const mix = bedMix(env, f.camHeight, f.nearWater);
  for (const name of BED_NAMES) {
    const b = bars.get(name);
    if (!b) continue;
    b.fill.style.width = (mix[name] * 100).toFixed(0) + '%';
    b.val.textContent = mix[name].toFixed(2);
  }
  if (now - lastMeter > 80) {
    lastMeter = now;
    const an = audio.analyser;
    let db = -Infinity;
    if (an) {
      an.getFloatTimeDomainData(meterBuf);
      let s = 0;
      for (let i = 0; i < meterBuf.length; i++) s += meterBuf[i] * meterBuf[i];
      db = 10 * Math.log10(s / meterBuf.length + 1e-12);
    }
    $('meterFill').style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)).toFixed(0) + '%';
    $('meterDb').textContent = Number.isFinite(db) ? db.toFixed(0) + ' dB' : '-inf';
    $('status').textContent = `audio ${audio.state} | voices ${audio.activeVoices} | beds ${audio.ready ? 'playing' : 'waiting'}${audio.missing.length ? ' | MISSING ' + audio.missing.join(', ') : ''}`;
  }
  requestAnimationFrame(frame);
}

// ---- load -------------------------------------------------------------------------------------------------------

audio.load('/audio/').then(() => {
  const t = $('decoded');
  const addRow = (cells: string[], head = false) => {
    const tr = document.createElement('tr');
    cells.forEach((text, i) => {
      const c = document.createElement(head ? 'th' : 'td');
      c.textContent = text;
      if (!head && i > 0) c.className = 'v';
      tr.append(c);
    });
    t.append(tr);
  };
  addRow(['clip', 'seconds', 'ch', 'Hz', 'segments'], true);
  let total = 0;
  for (const [name, d] of Object.entries(audio.decoded)) {
    addRow([name, d.seconds.toFixed(3), String(d.channels), String(d.sampleRate), String(d.segments)]);
    total += d.seconds;
    console.log(`[audio-demo] decoded ${name}: ${d.seconds.toFixed(3)} s, ${d.channels} ch, ${d.sampleRate} Hz, ${d.segments} segment(s)`);
  }
  log(`decoded ${Object.keys(audio.decoded).length} files (${total.toFixed(1)} s)` + (audio.missing.length ? ', MISSING: ' + audio.missing.join(', ') : ''));
  window.__ready = true;
  if (q.get('start') === '1') audio.resume();
});
requestAnimationFrame(frame);
