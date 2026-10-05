// Fireflies (V2-PLAN R9): on warm summer evenings, from dusk until a couple of hours after, cold green-gold sparks drift low over
// the water margins (the ponds and the creek), each blinking on its own slow beat. One Points draw of six hundred or so; it is not
// drawn at all (mesh.visible = false) outside its season and hour, so it costs nothing by day, in winter or in rain.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { clamp, smoothstep } from './common';

const COUNT = 640;

/** 0..1 how many fireflies are out: late spring to late summer, from sunset to about two hours after, still and warm. */
export function fireflyAmount(season: number, sunElDeg: number, rain: number, overcast: number, warmth: number): number {
  const s = ((season % 4) + 4) % 4;
  const summer = smoothstep(0.2, 0.65, s) * (1 - smoothstep(1.7, 2.15, s));
  const dusk = smoothstep(3, -2, sunElDeg) * (1 - smoothstep(-16, -28, sunElDeg));
  return summer * dusk * (1 - rain) * (1 - 0.6 * overcast) * smoothstep(0.35, 0.6, warmth);
}

export class Fireflies {
  readonly mesh: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private uAmount = { value: 0 };
  private uPx = { value: 800 };

  constructor(world: World, time: { value: number }, heightAt: (x: number, z: number) => number) {
    // seeded placement: a ring round each pond and a scatter along the creek
    let rs = 90210;
    const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    const pos = new Float32Array(COUNT * 4);
    const nPonds = Math.floor(world.ponds.length / 4);
    const creekPts = Math.floor(world.creek.length / 2);
    const perPond = nPonds > 0 ? Math.floor((COUNT * 0.4) / nPonds) : 0;
    let n = 0;
    const put = (x: number, z: number) => {
      pos[n * 4] = x; pos[n * 4 + 1] = heightAt(x, z) + 0.5 + rnd() * 1.9; pos[n * 4 + 2] = z; pos[n * 4 + 3] = rnd();
      n++;
    };
    for (let p = 0; p < nPonds; p++) {
      const cx = world.ponds[p * 4], cz = world.ponds[p * 4 + 1], r = world.ponds[p * 4 + 2];
      for (let i = 0; i < perPond && n < COUNT; i++) {
        const a = rnd() * Math.PI * 2, d = r * (0.5 + rnd() * 1.1) + 2 + rnd() * 14;
        put(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
      }
    }
    while (n < COUNT && creekPts > 0) {
      const k = Math.floor(rnd() * creekPts);
      const a = rnd() * Math.PI * 2, d = 1 + rnd() * 16;
      put(world.creek[2 * k] + Math.cos(a) * d, world.creek[2 * k + 1] + Math.sin(a) * d);
    }
    while (n < COUNT) put(world.size * (0.3 + rnd() * 0.4), world.size * (0.3 + rnd() * 0.4));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('aBase', new THREE.BufferAttribute(pos, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(world.size / 2, 5, world.size / 2), world.size);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uAmount: this.uAmount, uPx: this.uPx },
      vertexShader: /* glsl */ `
        attribute vec4 aBase;
        uniform float uTime;
        uniform float uAmount;
        uniform float uPx;
        varying float vA;
        void main() {
          float seed = aBase.w;
          vec3 p = aBase.xyz;
          // a slow wander, each on its own loop
          float t = uTime * (0.22 + 0.2 * fract(seed * 7.0));
          p.x += 3.2 * sin(t + seed * 40.0) + 1.4 * sin(t * 2.3 + seed * 13.0);
          p.z += 3.2 * cos(t * 0.9 + seed * 21.0) + 1.4 * cos(t * 1.9 + seed * 5.0);
          p.y += 0.7 * sin(t * 1.7 + seed * 9.0);
          // the blink: a quick rise and a slower fall, every two to five seconds, never in step with its neighbours
          float per = 2.2 + 2.6 * fract(seed * 13.7);
          float ph = fract((uTime + seed * 61.0) / per);
          float on = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.2, 0.45, ph));
          // only some are lit at any time of the evening (the others have not started yet)
          float gate = smoothstep(fract(seed * 3.7), fract(seed * 3.7) + 0.25, uAmount);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          vA = on * gate * (0.45 + 0.55 * fract(seed * 5.3)) * (1.0 - smoothstep(140.0, 260.0, dist));
          if (vA < 0.01 || dist < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPx * 0.22 / dist, 3.0, 30.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = clamp(1.0 - r, 0.0, 1.0);
          a = a * a;
          gl_FragColor = vec4(vec3(0.62, 1.0, 0.22) * 3.4 * a * vA, 1.0);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.mesh.name = 'fireflies';
  }

  /** Per frame: set how many are out, and the pixel scale for point sizes (viewport height over twice the tangent of the half-fov). */
  update(amount: number, viewportH: number, fovDeg: number): void {
    this.uAmount.value = clamp(amount, 0, 1);
    this.uPx.value = viewportH / (2 * Math.tan(fovDeg * Math.PI / 360));
    this.mesh.visible = amount > 0.01;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
