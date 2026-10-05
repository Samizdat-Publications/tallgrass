// GPU check of the leg shader against its CPU mirror. Runs the REAL animation GLSL (tgAnimate from models/shader.ts, compiled with
// the species' defines) on the foot vertex of every leg through WebGL2 transform feedback, over a sweep of species, gaits, phases,
// slopes and camera distances, and compares the vertex it writes with legmath.ts (footModel) for the same inputs.
// If this passes, the table printed by the foot-slip rig (which runs the mirror) describes what the shader draws.
// Page: dev/footslip-gpu.html. Runner: node tools/footslip_gpucheck.mjs
import { getModel } from '../src/render/models';
import { animationShaderParts } from '../src/render/models/shader';
import {
  aimLeg, bodyMotion, footModel, footPath, gaitMix, groundUnderFoot, IK_FAR, IK_NEAR, instanceRotation, legRigOf, sstep, stanceBodyDy,
} from '../src/render/models/legmath';
import { makeTerrain, placeInstance, SPECIES_SCALE, LEGGED, paceFor, stotOf } from './footslip-core';
import type { GaitName } from './footslip-core';

declare global { interface Window { __gpuCheck?: { lines: string[]; maxErr: number; pass: boolean } } }

const HN = 257, CELL = 2;

/** GLSL tgHeightAt, triangulated like the terrain mesh. */
function tgHeightAt(grid: Float32Array, x: number, z: number): number {
  const mx = HN - 1.001;
  const fx = Math.min(Math.max(x / CELL, 0), mx), fz = Math.min(Math.max(z / CELL, 0), mx);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const a = grid[j * HN + i], b = grid[j * HN + i + 1], c = grid[(j + 1) * HN + i], d = grid[(j + 1) * HN + i + 1];
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n').slice(0, 4000));
  return s;
}

interface Harness {
  run(a: { vtx: Float32Array; ph: number; spd: number; bdy: number; mat: Float32Array; camPos: [number, number, number]; stot?: number }): [number, number, number];
}

function makeHarness(gl: WebGL2RenderingContext, sp: number, grid: Float32Array): Harness {
  const { defs, decl } = animationShaderParts(getModel(sp)!);
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
  gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 16, gl.DYNAMIC_READ);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, tfBuf);
  return {
    run({ vtx, ph, spd, bdy, mat, camPos, stot }) {
      // vtx = [x y z, nx ny nz, part, w1, pivot xyz, pivot2 xyz]
      gl.vertexAttrib3f(loc('position'), vtx[0], vtx[1], vtx[2]);
      gl.vertexAttrib3f(loc('normal'), vtx[3], vtx[4], vtx[5]);
      gl.vertexAttrib4f(loc('aPart'), vtx[6], vtx[7], 0, 0);
      gl.vertexAttrib3f(loc('aPivot'), vtx[8], vtx[9], vtx[10]);
      gl.vertexAttrib3f(loc('aPivot2'), vtx[11], vtx[12], vtx[13]);
      gl.vertexAttrib4f(loc('aGait'), ph, spd, 0, 0);
      gl.vertexAttrib4f(loc('aLook'), 0.5, 0, 0, 0); // seed 0: no breathing offset
      gl.vertexAttrib4f(loc('aFx'), 0, bdy, 0, 0);
      gl.vertexAttrib4f(loc('aFx2'), 0, stot ?? 0, 0, 0); // no hold, no feeding cycle, no leap (a deer: no antlers, the stotting weight; a bison: no wallow, rub or spar)
      const l = loc('instanceMatrix');
      for (let c = 0; c < 4; c++) gl.vertexAttrib4f(l + c, mat[c * 4], mat[c * 4 + 1], mat[c * 4 + 2], mat[c * 4 + 3]);
      gl.uniform3f(uni('uCamPos'), camPos[0], camPos[1], camPos[2]);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, 1);
      gl.endTransformFeedback();
      gl.disable(gl.RASTERIZER_DISCARD);
      const out = new Float32Array(3);
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
      return [out[0], out[1], out[2]];
    },
  };
}

/** The foot vertex of leg `leg` (0 FL, 1 FR, 2 HL, 3 HR): the lowest vertex of that part, with all its attributes. */
function footVertex(sp: number, leg: number): Float32Array {
  const g = getModel(sp)!.geometry;
  const pos = g.getAttribute('position').array as Float32Array, nor = g.getAttribute('normal').array as Float32Array;
  const part = g.getAttribute('aPart').array as Float32Array, pv = g.getAttribute('aPivot').array as Float32Array, pv2 = g.getAttribute('aPivot2').array as Float32Array;
  const n = g.getAttribute('position').count;
  let best = -1, miny = Infinity;
  for (let i = 0; i < n; i++) {
    if (Math.round(part[i * 4]) !== leg + 1) continue;
    if (pos[i * 3 + 1] < miny) { miny = pos[i * 3 + 1]; best = i; }
  }
  const i = best;
  return new Float32Array([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], part[i * 4], part[i * 4 + 1], pv[i * 3], pv[i * 3 + 1], pv[i * 3 + 2], pv2[i * 3], pv2[i * 3 + 1], pv2[i * 3 + 2]]);
}

export function runGpuCheck(): { lines: string[]; maxErr: number; pass: boolean } {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2')!;
  if (!gl) throw new Error('no webgl2');
  const lines: string[] = [];
  let worst = 0;
  const cases: Array<{ name: string; kind: 'plane' | 'bumps'; slope: number }> = [
    { name: 'flat', kind: 'plane', slope: 0 }, { name: 'slope20', kind: 'plane', slope: 20 }, { name: 'bumps', kind: 'bumps', slope: 10 },
  ];
  for (const { sp, name } of LEGGED) {
    const { p } = { p: getModel(sp)!.params };
    const rig = legRigOf(getModel(sp)!.geometry);
    const vs = SPECIES_SCALE[sp];
    for (const tc of cases) {
      const T0 = makeTerrain(tc.kind, tc.slope);
      const T = { h: (x: number, z: number) => T0.h(x, z) - 100 + 5 }; // keep heights small and positive
      const grid = new Float32Array(HN * HN);
      for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) grid[j * HN + i] = T.h(i * CELL, j * CELL);
      const h = makeHarness(gl, sp, grid);
      const ground = (x: number, z: number): number => tgHeightAt(grid, x, z);
      const verts = [0, 1, 2, 3].map((l) => footVertex(sp, l));
      let maxErr = 0, n = 0;
      const by = new Map<string, number>();
      for (const gait of ['stand', 'walk', 'trot', 'gallop', ...(p.stot ? ['stot'] : [])] as Array<GaitName | 'stand'>) {
        const spd = gait === 'stand' ? 0 : paceFor(p, gait);
        const stotW = gait === 'stand' ? 0 : stotOf(gait);
        for (const camD of [20, 30, 43, 60]) {
          for (let k = 0; k < 24; k++) {
            const ph = k / 24 + 0.013;
            const x = 40 + k * 0.7, z = 100;
            const inst = placeInstance(p, { h: (gx, gz) => ground(gx, gz) }, x, z, vs, camD);
            const R = instanceRotation(inst);
            const gm = gaitMix(p, spd, stotW);
            const farK = sstep(20, 110, camD);
            const ikK = 1 - sstep(IK_NEAR, IK_FAR, camD);
            const bdy = ikK > 0.001 ? stanceBodyDy(p, rig, gm, ph, inst, ground) * ikK : 0;
            const bm = bodyMotion(p, gm, ph, farK, bdy, stotW);
            // the instance matrix exactly as AnimalLayer.writeInstance builds it (column major, scale in the columns)
            const mat = new Float32Array(16);
            mat[0] = R[0] * vs; mat[1] = R[3] * vs; mat[2] = R[6] * vs;
            mat[4] = R[1] * vs; mat[5] = R[4] * vs; mat[6] = R[7] * vs;
            mat[8] = R[2] * vs; mat[9] = R[5] * vs; mat[10] = R[8] * vs;
            mat[12] = inst.x; mat[13] = inst.y; mat[14] = inst.z; mat[15] = 1;
            // the camera sits camD metres from the instance origin (the shader measures to the origin)
            const cam: [number, number, number] = [inst.x + camD, inst.y, inst.z];
            for (let leg = 0; leg < 4; leg++) {
              const b = leg < 2 ? rig.front : rig.hind;
              const zf = (leg & 1 ? 1 : -1) * b.z;
              const gy = ikK > 0.001 ? ikK * groundUnderFoot(inst, R, ground, b.foot[0] + footPath(gm, ph, leg).footX, b.foot[1], zf) : 0;
              const aim = aimLeg(p, rig, gm, ph, leg, zf, gy, bm);
              const exp = footModel(p, rig, leg, zf, aim, bm);
              const got = h.run({ vtx: verts[leg], ph, spd, bdy, mat, camPos: cam, stot: stotW });
              const err = Math.hypot(got[0] - exp[0], got[1] - exp[1], got[2] - exp[2]);
              if (err > maxErr) maxErr = err;
              const key = `${gait}@${camD}`;
              by.set(key, Math.max(by.get(key) ?? 0, err));
              n++;
            }
          }
        }
      }
      worst = Math.max(worst, maxErr);
      if (tc.name === 'flat') lines.push('  by gait@cam (mm): ' + [...by].map(([k, v]) => `${k} ${(v * 1000).toFixed(1)}`).join('  '));
      lines.push(`${name.padEnd(10)} ${tc.name.padEnd(8)} vertices ${String(n).padStart(5)}  max |GPU - CPU mirror| ${(maxErr * 1000).toFixed(3)} mm`);
    }
  }
  const pass = worst < 0.002; // 2 mm (float32 on the GPU)
  lines.push(pass ? `PASS: worst ${(worst * 1000).toFixed(3)} mm` : `FAIL: worst ${(worst * 1000).toFixed(3)} mm`);
  return { lines, maxErr: worst, pass };
}


// the page: run on load, expose the result
const res = runGpuCheck();
window.__gpuCheck = res;
const pre = document.createElement('pre');
pre.textContent = res.lines.join('\n');
document.body.appendChild(pre);
