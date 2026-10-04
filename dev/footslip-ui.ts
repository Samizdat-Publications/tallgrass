// Browser side of the foot-slip rig: the table, and image strips of the leg poses over one cycle (before and after) for review.
// Strip panel = side view following the body: terrain line, the four legs (hip, knee, foot), and the world positions where feet
// stood during stance (dots). A locked foot stays on its dot while the body moves over it; a sliding foot drags its dot along.
import { LEGGED, allPass, formatTable, gateOf, makeTerrain, paceFor, runCase, runTable, speciesRig, SPECIES_SCALE } from './footslip-core';
import type { FrameSample, GaitName, ModelKind, TerrainKind } from './footslip-core';
import { instanceRotation, instanceToWorld } from '../src/render/models/legmath';

declare global { interface Window { __done?: boolean; __summary?: string } }

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const LEG_COL = ['#c0392b', '#e67e22', '#2471a3', '#17a589']; // FL FR HL HR

function strip(sp: number, name: string, gait: GaitName, slope: number, model: ModelKind, terrain: TerrainKind): HTMLCanvasElement {
  const { p } = speciesRig(sp);
  const vs = SPECIES_SCALE[sp];
  const frames: FrameSample[] = [];
  const res = runCase({ sp, gait, speedMul: 1, slopeDeg: slope, model, terrain, camD: 20, seconds: 5 }, (s) => frames.push(s));
  const T = makeTerrain(terrain, slope);
  const cycleFrames = Math.max(8, Math.round(60 / Math.max(res.cadence, 0.2)));
  const start = Math.floor(frames.length / 3);
  const N = 8;
  const Lm = (p.legL ?? p.comY) * vs;
  const scale = 140 / Lm; // px per metre: a leg is about 140 px
  const pw = 300, ph = 380;
  const cv = document.createElement('canvas');
  cv.className = 'strip';
  cv.width = pw * N;
  cv.height = ph;
  cv.dataset.name = `footslip_${name}_${gait}_${slope}deg_${model === 'new' ? 'after' : 'before'}_${terrain}`;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#f1ead8';
  g.fillRect(0, 0, cv.width, cv.height);
  // footprints: every stance foot position within this cycle (and one before), per leg
  const dots: Array<{ x: number; y: number; leg: number; f: number }> = [];
  for (let f = Math.max(0, start - cycleFrames); f < Math.min(frames.length, start + 2 * cycleFrames); f++) {
    frames[f].feet.forEach((ft, leg) => { if (ft.stance) dots.push({ x: ft.world[0], y: ft.world[1], leg, f }); });
  }
  for (let k = 0; k < N; k++) {
    const fr = frames[Math.min(frames.length - 1, start + Math.round((k * cycleFrames) / N))];
    const ox = k * pw, cx = pw / 2;
    const bx = fr.body[0], by = fr.body[1];
    const X = (wx: number): number => ox + cx + (wx - bx) * scale;
    const Y = (wy: number): number => ph * 0.74 - (wy - by) * scale;
    g.save();
    g.beginPath(); g.rect(ox, 0, pw, ph); g.clip();
    // terrain
    g.strokeStyle = '#7a6a45'; g.lineWidth = 3; g.beginPath();
    for (let px = 0; px <= pw; px += 6) { const wx = bx + (px - cx) / scale; const wy = T.h(wx, 0); px === 0 ? g.moveTo(ox + px, Y(wy)) : g.lineTo(ox + px, Y(wy)); }
    g.stroke();
    // footprints
    for (const d of dots) { g.fillStyle = LEG_COL[d.leg]; g.globalAlpha = 0.35; g.beginPath(); g.arc(X(d.x), Y(d.y), 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    const R = instanceRotation(fr.inst);
    const W = (m: [number, number, number]): [number, number] => { const w = instanceToWorld(fr.inst, R, m[0], m[1], m[2]); return [X(w[0]), Y(w[1])]; };
    // body line: front hip to hind hip (drawn from the legs' hips)
    const hipsF = W(fr.feet[1].hip), hipsH = W(fr.feet[3].hip);
    g.strokeStyle = '#444'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hipsH[0], hipsH[1]); g.lineTo(hipsF[0], hipsF[1]); g.stroke();
    // legs: far side (left, thinner and lighter) first, then the near side
    for (const leg of [0, 2, 1, 3]) {
      const ft = fr.feet[leg];
      const hip = W(ft.hip), knee = W(ft.knee), foot = W(ft.model);
      g.strokeStyle = LEG_COL[leg]; g.globalAlpha = leg % 2 === 0 ? 0.45 : 1; g.lineWidth = leg % 2 === 0 ? 3 : 5;
      g.beginPath(); g.moveTo(hip[0], hip[1]);
      if (model === 'new') g.lineTo(knee[0], knee[1]);
      g.lineTo(foot[0], foot[1]); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = ft.stance ? '#111' : '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(foot[0], foot[1], 5, 0, 7); g.fill(); g.stroke();
    }
    g.restore();
    g.fillStyle = '#222'; g.font = '12px ui-monospace, Consolas, monospace';
    g.fillText(`${name} ${gait} ${slope}deg ${model === 'new' ? 'AFTER' : 'BEFORE'}  ${k + 1}/${N}`, ox + 8, 16);
    g.fillText(`slip ${(res.slip * 100).toFixed(1)}%  ground err max ${res.gndMax.toFixed(1)} cm`, ox + 8, 32);
    g.strokeStyle = '#bbb'; g.lineWidth = 1; g.strokeRect(ox + 0.5, 0.5, pw - 1, ph - 1);
  }
  return cv;
}

function render(): void {
  const terrain = $<HTMLSelectElement>('terrain').value as TerrainKind;
  const cams = $<HTMLInputElement>('cams').value.split(',').map(Number).filter((n) => n > 0);
  const rows = runTable(cams, terrain);
  const ok = allPass(rows);
  const text = formatTable(rows);
  window.__summary = ok ? 'GATES PASS (1x rows)' : 'GATES FAIL';
  $('summary').textContent = window.__summary;
  const lines = text.split('\n');
  const out = $('out');
  out.replaceChildren();
  const pre = document.createElement('pre');
  pre.style.cssText = 'font:12px/1.3 ui-monospace,Consolas,monospace;white-space:pre;overflow:auto';
  pre.textContent = lines.join('\n');
  out.appendChild(pre);
  void gateOf;

  const strips = $('strips');
  strips.replaceChildren();
  for (const { sp, name } of LEGGED) {
    for (const gait of ['walk', 'trot', 'gallop'] as GaitName[]) {
      const h = document.createElement('h2');
      h.textContent = `${name}, ${gait} (${paceFor(speciesRig(sp).p, gait).toFixed(1)} m/s), 20 degree slope`;
      strips.appendChild(h);
      strips.appendChild(strip(sp, name, gait, 20, 'legacy', terrain));
      strips.appendChild(strip(sp, name, gait, 20, 'new', terrain));
    }
  }
  window.__done = true;
}

$('run').addEventListener('click', render);
render();
