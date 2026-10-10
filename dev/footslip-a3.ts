// Foot slip of the DRAWN paw (r-feet). dev/footslip-core.ts measures the rig's foot point; this page runs the real animation GLSL (tgAnimate, the near
// LOD program) through WebGL2 transform feedback on EVERY leg vertex of the near mesh (the authored a3 mesh by default, the procedural near LOD with
// `?a3=0`), over the same walk / trot / gallop runs, and tracks a contact point per leg: the centroid of the sole (the vertices within 2 cm of the
// lowest point of the leg in the rest pose). Slip is what dev/footslip-core.ts calls it: the distance that contact point moves in the world during
// stance frames, over the distance the body moves in the same frames (3D, so a paw that rolls or lifts counts too; the horizontal share is reported too).
// Page: dev/footslip-a3.html[?a3=0&slope=0]. Runner: node tools/footslip_a3.mjs
import { preloadA3 } from '../src/render/models/a3';
import { getModel } from '../src/render/models';
import { animationShaderParts } from '../src/render/models/shader';
import { instanceRotation, instanceToWorld, legRigOf } from '../src/render/models/legmath';
import { makeTerrain, runCase, LEGGED, speciesRig } from './footslip-core';
import type { GaitName } from './footslip-core';

declare global { interface Window { __a3Slip?: SlipResult } }

interface Row {
  species: string; gait: string;
  /** Sole contact point slip (3D) over all four legs, front legs, hind legs, and the horizontal part; the rig's own foot point for reference. */
  slip: number; slipFront: number; slipHind: number; slipH: number; rig: number;
  /** Sole centroid ground clearance in stance (cm, mean and worst, along world up) and the rest offset of the sole centroid from the rig foot (cm, x then z). */
  clr: number; clrMax: number; low: number; lowMin: number; lowMax: number; offX: number; offZ: number;
}
interface SlipResult { a3: boolean; rows: Row[]; lines: string[]; pass: boolean; trace?: Record<string, number[][]> }

const HN = 257, CELL = 2;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n').slice(0, 3000));
  return s;
}

/** The leg vertices of the near mesh, evaluated in a batch through the real vertex shader. */
function makeBatch(gl: WebGL2RenderingContext, sp: number, grid: Float32Array) {
  const def = getModel(sp)!;
  const geo = def.nearGeometry ?? def.geometry;
  const { defs, decl } = animationShaderParts(def, 'near');
  const vs = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
#define attribute in
#define varying out
attribute vec3 position;
attribute vec3 normal;
attribute mat4 instanceMatrix;
${defs}
${decl}
out vec3 oP;
void main() {
  vec3 p = position; vec3 n = normal;
  tgAnimate(p, n);
  oP = p;
  gl_Position = vec4(0.0);
}`;
  const fs = `#version 300 es
precision highp float; out vec4 c; void main() { c = vec4(1.0); }`;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.transformFeedbackVaryings(prog, ['oP'], gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const loc = (n: string): number => gl.getAttribLocation(prog, n);
  const uni = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, n);

  // the leg vertices (parts 1 to 4)
  const pos = geo.getAttribute('position').array as Float32Array, nor = geo.getAttribute('normal').array as Float32Array;
  const part = geo.getAttribute('aPart').array as Float32Array, pv = geo.getAttribute('aPivot').array as Float32Array, pv2 = geo.getAttribute('aPivot2').array as Float32Array;
  const total = geo.getAttribute('position').count;
  const sel: number[] = [];
  for (let i = 0; i < total; i++) { const pt = Math.round(part[i * 4]); if (pt >= 1 && pt <= 4) sel.push(i); }
  const N = sel.length;
  const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), A = new Float32Array(N * 4), V1 = new Float32Array(N * 3), V2 = new Float32Array(N * 3);
  const leg = new Int32Array(N);
  sel.forEach((i, k) => {
    P.set(pos.subarray(i * 3, i * 3 + 3), k * 3); Nn.set(nor.subarray(i * 3, i * 3 + 3), k * 3); A.set(part.subarray(i * 4, i * 4 + 4), k * 4);
    V1.set(pv.subarray(i * 3, i * 3 + 3), k * 3); V2.set(pv2.subarray(i * 3, i * 3 + 3), k * 3);
    leg[k] = Math.round(part[i * 4]) - 1;
  });
  // the sole of each leg: vertices within 2 cm of its lowest point
  const sole: number[][] = [[], [], [], []];
  const minY = [Infinity, Infinity, Infinity, Infinity];
  for (let k = 0; k < N; k++) minY[leg[k]] = Math.min(minY[leg[k]], P[k * 3 + 1]);
  for (let k = 0; k < N; k++) if (P[k * 3 + 1] < minY[leg[k]] + 0.02) sole[leg[k]].push(k);
  const bind = (name: string, data: Float32Array, size: number): void => {
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const l = loc(name);
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
  };
  bind('position', P, 3); bind('normal', Nn, 3); bind('aPart', A, 4); bind('aPivot', V1, 3); bind('aPivot2', V2, 3);

  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, HN, HN, 0, gl.RED, gl.FLOAT, grid);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(uni('tHeight'), 0);
  gl.uniform1f(uni('uCell'), CELL);
  gl.uniform1f(uni('uHN'), HN);
  gl.uniform1f(uni('uTime'), 0);
  gl.uniform1f(uni('uPxK'), 900 / (2 * Math.tan((45 * Math.PI) / 360)));
  const tfBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, tfBuf);
  gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, N * 12, gl.DYNAMIC_READ);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, tfBuf);
  const out = new Float32Array(N * 3);
  const rig = legRigOf(def.geometry);
  return {
    N, sole, leg, rig, rest: P,
    run(a: { ph: number; spd: number; bdy: number; mat: Float32Array; camPos: [number, number, number]; stot: number }): Float32Array {
      gl.vertexAttrib4f(loc('aGait'), a.ph, a.spd, 0, 0);
      gl.vertexAttrib4f(loc('aLook'), 0.5, 0, 0, 0);
      gl.vertexAttrib4f(loc('aFx'), 0, a.bdy, 0, 0);
      gl.vertexAttrib4f(loc('aFx2'), 0, a.stot, 0, 0);
      const l = loc('instanceMatrix');
      for (let c = 0; c < 4; c++) gl.vertexAttrib4f(l + c, a.mat[c * 4], a.mat[c * 4 + 1], a.mat[c * 4 + 2], a.mat[c * 4 + 3]);
      gl.uniform3f(uni('uCamPos'), a.camPos[0], a.camPos[1], a.camPos[2]);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, N);
      gl.endTransformFeedback();
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
      return out;
    },
  };
}

function centroid(out: Float32Array, idx: number[]): [number, number, number] {
  let x = 0, y = 0, z = 0;
  for (const k of idx) { x += out[k * 3]; y += out[k * 3 + 1]; z += out[k * 3 + 2]; }
  return [x / idx.length, y / idx.length, z / idx.length];
}

export async function runSlip(opts: { slope?: number; seconds?: number } = {}): Promise<SlipResult> {
  await preloadA3();
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2')!;
  if (!gl) throw new Error('no webgl2');
  const slope = opts.slope ?? 0;
  const rows: Row[] = [];
  const lines: string[] = [];
  const a3 = new URLSearchParams(location.search).get('a3') !== '0';
  lines.push(`near mesh: ${a3 ? 'authored a3' : 'procedural near LOD'}   ground slope ${slope} deg   camera 20 m   flat-footed sole centroid (2 cm band)`);
  lines.push('species    gait     slip3d  front  hind  horiz | rig foot | sole centroid clearance cm mean/max | lowest vertex over ground cm mean (min..max) | sole - rig foot at rest (cm x, z)');
  let pass = true;
  const trace: Record<string, number[][]> = {};
  for (const { sp, name } of LEGGED) {
    const { p } = speciesRig(sp);
    const T0 = makeTerrain('plane', slope);
    const grid = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) grid[j * HN + i] = T0.h(i * CELL, j * CELL); // (the same plane the run places the body on)
    const batch = makeBatch(gl, sp, grid);
    const vs = 1; // (the scale of the instance matrix is set per case below)
    void vs;
    for (const gait of ['walk', 'trot', 'gallop', ...(p.stot ? ['stot'] : [])] as GaitName[]) {
      let slipF = 0, slipFH = 0, slipB = 0, slipFr = 0, slipFrB = 0, slipHi = 0, slipHiB = 0, slipRig = 0, slipRigB = 0;
      let clrSum = 0, clrMax = 0, clrN = 0, lowSum = 0, lowMin = Infinity, lowMax = -Infinity;
      const prev: Array<[number, number, number] | null> = [null, null, null, null];
      const prevRig: Array<[number, number, number] | null> = [null, null, null, null];
      const prevSt = [false, false, false, false];
      let prevBody: [number, number, number] | null = null;
      let off: [number, number] = [0, 0];
      const res = runCase({ sp, gait, speedMul: 1, slopeDeg: slope, model: 'new', camD: 20, seconds: opts.seconds ?? 6 }, (s) => {
        const { inst } = s;
        const R = instanceRotation(inst);
        const mat = new Float32Array(16);
        const vsc = inst.s;
        mat[0] = R[0] * vsc; mat[1] = R[3] * vsc; mat[2] = R[6] * vsc;
        mat[4] = R[1] * vsc; mat[5] = R[4] * vsc; mat[6] = R[7] * vsc;
        mat[8] = R[2] * vsc; mat[9] = R[5] * vsc; mat[10] = R[8] * vsc;
        mat[12] = inst.x; mat[13] = inst.y; mat[14] = inst.z; mat[15] = 1;
        const out = batch.run({ ph: s.phase, spd: s.pace, bdy: s.bdy, mat, camPos: [inst.x + 20, inst.y, inst.z], stot: s.stotW });
        for (let i = 0; i < 4; i++) {
          const c = centroid(out, batch.sole[i]);
          const w = instanceToWorld(inst, R, c[0], c[1], c[2]);
          const rw = s.feet[i].world;
          if (s.feet[i].stance) {
            if (prev[i] && prevSt[i] && prevBody) {
              const body = Math.hypot(s.body[0] - prevBody[0], s.body[1] - prevBody[1], s.body[2] - prevBody[2]);
              const d = Math.hypot(w[0] - prev[i]![0], w[1] - prev[i]![1], w[2] - prev[i]![2]);
              const dh = Math.hypot(w[0] - prev[i]![0], w[2] - prev[i]![2]);
              const dr = Math.hypot(rw[0] - prevRig[i]![0], rw[1] - prevRig[i]![1], rw[2] - prevRig[i]![2]);
              slipF += d; slipFH += dh; slipB += body; slipRig += dr; slipRigB += body;
              if (i < 2) { slipFr += d; slipFrB += body; } else { slipHi += d; slipHiB += body; }
            }
            // clearance of the sole centroid above the ground under it, along world up (flat: the plane)
            const gnd = T0.h(w[0], w[2]);
            const c2 = (w[1] - gnd) * 100;
            // and the lowest vertex of the whole leg over the ground under the sole centroid (signed: + floats, - sinks into the ground)
            let lo = Infinity;
            for (let k = 0; k < batch.N; k++) if (batch.leg[k] === i) { const y = instanceToWorld(inst, R, out[k * 3], out[k * 3 + 1], out[k * 3 + 2])[1]; if (y < lo) lo = y; }
            const lc = (lo - gnd) * 100;
            lowSum += lc; if (lc < lowMin) lowMin = lc; if (lc > lowMax) lowMax = lc;
            clrSum += Math.abs(c2); clrN++;
            if (Math.abs(c2) > clrMax) clrMax = Math.abs(c2);
          }
          if (i === 0 && gait === 'walk') (trace[name] ??= []).push([s.t, s.feet[i].stance ? 1 : 0, w[0] - rw[0], w[1] - rw[1], w[2] - rw[2], s.phase]);
          prev[i] = w; prevRig[i] = rw; prevSt[i] = s.feet[i].stance;
        }
        prevBody = s.body;
      });
      void res;
      // rest offset of the sole centroid from the rig foot point (model units, front leg 0 and hind leg 2, in cm)
      const b = batch.rig;
      const c0 = centroid(batch.rest, batch.sole[0]), c2 = centroid(batch.rest, batch.sole[2]);
      off = [((c0[0] - b.front.foot[0]) + (c2[0] - b.hind.foot[0])) * 50, ((Math.abs(c0[2]) - b.front.z) + (Math.abs(c2[2]) - b.hind.z)) * 50];
      const lim = gait === 'gallop' || gait === 'stot' ? 0.08 : 0.05;
      const slip = slipF / Math.max(1e-9, slipB);
      const row: Row = {
        species: name, gait, slip, slipFront: slipFr / Math.max(1e-9, slipFrB), slipHind: slipHi / Math.max(1e-9, slipHiB), slipH: slipFH / Math.max(1e-9, slipB),
        rig: slipRig / Math.max(1e-9, slipRigB), clr: clrSum / Math.max(1, clrN), clrMax, low: lowSum / Math.max(1, clrN), lowMin, lowMax, offX: off[0], offZ: off[1],
      };
      rows.push(row);
      const ok = slip <= lim;
      if (!ok) pass = false;
      const pc = (x: number): string => (x * 100).toFixed(1).padStart(5) + '%';
      lines.push(`${name.padEnd(10)} ${gait.padEnd(7)} ${pc(row.slip)} ${pc(row.slipFront)} ${pc(row.slipHind)} ${pc(row.slipH)} | ${pc(row.rig)} | ${row.clr.toFixed(1).padStart(5)} ${row.clrMax.toFixed(1).padStart(5)} | ${row.low.toFixed(1).padStart(5)} (${row.lowMin.toFixed(1)}..${row.lowMax.toFixed(1)}) | ${off[0].toFixed(1).padStart(5)} ${off[1].toFixed(1).padStart(5)} ${ok ? '' : ' OVER ' + (lim * 100) + '%'}`);
    }
  }
  lines.push(pass ? 'PASS: every row within the gate (5% walk and trot, 8% gallop and stot)' : 'OVER GATE: see the rows marked OVER');
  return { a3, rows, lines, pass, trace };
}

const q = new URLSearchParams(location.search);
runSlip({ slope: Number(q.get('slope') ?? 0), seconds: Number(q.get('seconds') ?? 6) }).then((r) => {
  window.__a3Slip = r;
  const pre = document.createElement('pre');
  pre.textContent = r.lines.join('\n');
  document.body.appendChild(pre);
}).catch((e) => {
  const pre = document.createElement('pre');
  pre.textContent = 'ERROR ' + (e?.stack ?? e);
  document.body.appendChild(pre);
  window.__a3Slip = { a3: false, rows: [], lines: ['ERROR ' + (e?.message ?? e)], pass: false };
});
