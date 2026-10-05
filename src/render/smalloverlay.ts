// The "Small prey" map overlay (R3 item 6): jackrabbit and prairie dog densities, town edges and sylvatic plague, draped over the
// ground like the other overlays (render/overlay.ts) and read from the same 32 x 32 small-prey texture the sim sends (smalltex.ts).
// It is a separate mesh so overlay.ts stays as it is: main.ts switches between the two (OverlayId 'smallprey' shows this one and
// asks the other for 'none').
import * as THREE from 'three';
import type { SharedUniforms } from './common';
import { SMALL_TEX, TOWN_ON } from './smalltex';

const SEG = 160;
const LIFT = 1.1;
const FADE_S = 0.35;

const VERT = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform sampler2D tSmall;
uniform sampler2D tStatic;
uniform float uWorld;
uniform float uAlpha;
uniform float uTime;
uniform float uNight;
varying vec2 vXZ;

vec4 over(vec4 dst, vec3 c, float a) { return vec4(mix(dst.rgb, c, a), a + dst.a * (1.0 - a)); }

// four soft extra taps, so the 16 m cells read as ranges and not as tiles
vec4 soft(vec2 uv) {
  float o = 0.7 / 32.0;
  return texture2D(tSmall, uv) * 0.4 + 0.15 * (texture2D(tSmall, uv + vec2(o, o)) + texture2D(tSmall, uv + vec2(-o, o)) + texture2D(tSmall, uv + vec2(o, -o)) + texture2D(tSmall, uv + vec2(-o, -o)));
}

void main() {
  vec2 uv = vXZ / uWorld;
  vec4 s = soft(uv);
  vec4 col = vec4(0.0);
  // jackrabbits: a cool pale wash (the field saturates at 1.275 x capacity)
  float hare = clamp(s.r * 255.0 / 200.0, 0.0, 1.3);
  col = over(col, vec3(0.5, 0.72, 0.98), smoothstep(0.3, 0.85, hare) * 0.6);
  // prairie dogs: ochre, stronger
  float dog = clamp(s.g * 255.0 / 200.0, 0.0, 1.3);
  col = over(col, vec3(0.97, 0.6, 0.12), smoothstep(0.03, 0.55, dog) * 0.8);
  // a town: a fine bright line round the part of the ground the colony has dug up, and a faint fill inside it
  float town = s.b;
  float aa = max(fwidth(town), 0.004);
  float edge = 1.0 - smoothstep(0.0, 1.0, abs(town - 0.3) / (aa * 2.2));
  col = over(col, vec3(1.0, 0.93, 0.72), clamp(smoothstep(0.28, 0.6, town) * 0.07 + edge * 0.85, 0.0, 0.9));
  // plague: hatched magenta over the cells that carry it, pulsing slowly
  float pl = smoothstep(0.03, 0.4, s.a);
  float hatch = step(0.5, fract((vXZ.x + vXZ.y) * 0.16 + uTime * 0.05));
  col = over(col, vec3(0.86, 0.1, 0.4), pl * (0.38 + 0.3 * hatch) * (0.85 + 0.15 * sin(uTime * 2.2)));
  float edgeW = smoothstep(0.0, 6.0, min(min(vXZ.x, vXZ.y), min(uWorld - vXZ.x, uWorld - vXZ.y)));
  edgeW *= smoothstep(0.004, 0.035, texture2D(tStatic, uv).a); // keep the ponds and the creek clear
  col.rgb = pow(max(col.rgb, vec3(0.0)), vec3(1.0 + 1.3 * uNight)) * (1.0 - 0.3 * uNight);
  gl_FragColor = vec4(col.rgb, col.a * uAlpha * edgeW);
}`;

export class SmallPreyOverlay {
  readonly object3D: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private want = false;
  private alpha = 0;
  private legend: HTMLElement;
  private note: HTMLElement;
  private noteEmpty: boolean | null = null;

  constructor(worldSize: number, heightAt: (x: number, z: number) => number, shared: SharedUniforms, legendHost: HTMLElement) {
    const geo = new THREE.PlaneGeometry(worldSize, worldSize, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.translate(worldSize / 2, 0, worldSize / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)) + LIFT);
    geo.computeBoundingSphere();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tSmall: SMALL_TEX,
        tStatic: shared.staticTex,
        uWorld: { value: worldSize },
        uAlpha: { value: 0 },
        uTime: shared.time,
        uNight: shared.night,
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.object3D = new THREE.Mesh(geo, this.mat);
    this.object3D.name = 'overlay-smallprey';
    this.object3D.renderOrder = 5;
    this.object3D.frustumCulled = false;
    this.object3D.visible = false;

    this.legend = document.createElement('div');
    this.legend.className = 'tg-map-legend tg-glass tg-map-legend-small';
    this.legend.hidden = true;
    const title = document.createElement('div');
    title.className = 'tg-map-legend-title';
    title.textContent = 'Small prey';
    this.legend.append(title);
    for (const [cls, label] of [['hare', 'Jackrabbits'], ['dog', 'Prairie dogs'], ['town', 'Town edge'], ['plague', 'Plague']] as const) {
      const row = document.createElement('div');
      row.className = 'tg-map-legend-row';
      const sw = document.createElement('i');
      sw.className = 'tg-map-swatch tg-map-swatch-' + cls;
      const t = document.createElement('span');
      t.textContent = label;
      row.append(sw, t);
      this.legend.append(row);
    }
    this.note = document.createElement('div');
    this.note.className = 'tg-map-legend-note';
    this.legend.append(this.note);
    legendHost.append(this.legend);
  }

  setMode(on: boolean): void {
    this.want = on;
  }

  get active(): boolean {
    return this.want;
  }

  update(dt: number): void {
    const target = this.want ? 1 : 0;
    this.alpha += Math.sign(target - this.alpha) * Math.min(Math.abs(target - this.alpha), dt / FADE_S);
    this.mat.uniforms.uAlpha.value = this.alpha;
    this.object3D.visible = this.alpha > 0.001 && TOWN_ON.value > 0.5;
    // with no small-prey world (the params are off) there is nothing to show: say so in the legend instead of an empty map
    const empty = TOWN_ON.value < 0.5;
    this.legend.hidden = this.alpha <= 0.001 && !this.want;
    this.legend.style.opacity = String(Math.max(this.alpha, this.want ? 0.35 : 0));
    this.legend.classList.toggle('is-empty', empty);
    if (this.noteEmpty !== empty) {
      this.noteEmpty = empty;
      this.note.textContent = empty
        ? 'This valley has no jackrabbits or prairie dog towns yet, so the map has nothing to show.'
        : 'Where each lives, in 16 m cells. A ring marks the ground a colony has dug up.';
    }
  }

  dispose(): void {
    this.object3D.geometry.dispose();
    this.mat.dispose();
    this.legend.remove();
  }
}
