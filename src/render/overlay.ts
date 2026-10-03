// Map overlays draped just above the grass: vegetation, the landscape of fear, wolf territories and the trait heatmap.
// One mesh and one shader for all four; switching modes fades the old one out and the new one in.
import * as THREE from 'three';
import type { SharedUniforms } from './common';

export type OverlayMode = 'none' | 'vegetation' | 'fear' | 'territory' | 'traits';

const SEG = 192;
/** Height above the ground, enough to clear the grass tops. */
const LIFT = 1.1;
const MAX_PACKS = 16;
const FADE_S = 0.35;
/** Pack colors: distinct but sun-warmed, so a ring never looks like a UI bug laid over the prairie. */
const PACK_HEX = ['#e8b04f', '#7fb0dc', '#e08a7c', '#a6cc7a', '#bca0e0', '#6fc8b8', '#f0d68a', '#d98f5a'];
const MODE_ID: Record<OverlayMode, number> = { none: 0, vegetation: 1, fear: 2, territory: 3, traits: 4 };

const LEGENDS: Record<OverlayMode, { title: string; lo: string; hi: string; ramp: string } | null> = {
  none: null,
  vegetation: { title: 'Vegetation', lo: 'Bare', hi: 'Lush', ramp: 'linear-gradient(90deg, #8a5a2e, #d6b45c, #74ad45, #2f7a33)' },
  fear: { title: 'Landscape of fear', lo: 'Calm', hi: 'Recent kills', ramp: 'linear-gradient(90deg, rgba(240,150,60,0.15), #ef9a3c, #d0241a)' },
  territory: { title: 'Wolf territories', lo: 'Den', hi: 'Range edge', ramp: '' },
  traits: { title: 'Speed genes', lo: 'Slower than average', hi: 'Faster', ramp: 'linear-gradient(90deg, #4c8ceb, rgba(230,225,210,0.12) 50%, #f5941f)' },
};

const VERT = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform sampler2D tVeg;
uniform sampler2D tTrait;
uniform sampler2D tStatic;
uniform float uWorld;
uniform int uMode;
uniform float uAlpha;
uniform float uTime;
uniform vec4 uPacks[${MAX_PACKS}];
uniform vec3 uPackCol[${MAX_PACKS}];
uniform int uPackN;
varying vec2 vXZ;

vec4 over(vec4 dst, vec3 c, float a) { return vec4(mix(dst.rgb, c, a), a + dst.a * (1.0 - a)); }

void main() {
  vec2 uv = vXZ / uWorld;
  vec4 col = vec4(0.0);
  if (uMode == 1) {
    // biomass is absolute; a well-grazed prairie sits around 0.3, ungrazed bottomland near 0.7
    float g = clamp(texture2D(tVeg, uv).r / 0.7, 0.0, 1.0);
    vec3 bare = vec3(0.54, 0.35, 0.18), straw = vec3(0.84, 0.70, 0.36), green = vec3(0.45, 0.68, 0.27), deep = vec3(0.18, 0.48, 0.20);
    vec3 c = g < 0.35 ? mix(bare, straw, g / 0.35) : g < 0.7 ? mix(straw, green, (g - 0.35) / 0.35) : mix(green, deep, (g - 0.7) / 0.3);
    col = vec4(c, 0.7);
  } else if (uMode == 2) {
    float f = texture2D(tVeg, uv).a;
    vec3 c = mix(vec3(0.94, 0.60, 0.24), vec3(0.82, 0.10, 0.07), smoothstep(0.15, 0.7, f));
    col = vec4(c, smoothstep(0.02, 0.5, f) * 0.78);
  } else if (uMode == 3) {
    for (int i = 0; i < ${MAX_PACKS}; i++) {
      if (i >= uPackN) break;
      vec4 p = uPacks[i];
      float d = distance(vXZ, p.xy);
      float aa = max(0.8, fwidth(d) * 1.2);
      float ring = 1.0 - smoothstep(aa * 0.6, aa * 1.6, abs(d - p.z));
      float inside = 1.0 - smoothstep(p.z - aa, p.z, d);
      float fill = inside * (0.07 + 0.16 * smoothstep(p.z * 0.35, p.z, d));
      // the den: a small ring that breathes
      float dr = 5.0 + 0.8 * sin(uTime * 2.0 + float(i));
      float den = (1.0 - smoothstep(aa * 0.6, aa * 1.6, abs(d - dr))) + (1.0 - smoothstep(1.4, 1.4 + aa, d));
      col = over(col, uPackCol[i], clamp(max(max(ring * 0.9, fill), den * 0.95), 0.0, 1.0));
    }
  } else if (uMode == 4) {
    // five soft taps, so the 16 m cells read as regions rather than tiles
    float o = 0.8 / 32.0;
    vec4 t = texture2D(tTrait, uv) * 0.4 + 0.15 * (texture2D(tTrait, uv + vec2(o, o)) + texture2D(tTrait, uv + vec2(-o, o)) + texture2D(tTrait, uv + vec2(o, -o)) + texture2D(tTrait, uv + vec2(-o, -o)));
    float r = clamp((t.r * 255.0 - 128.0) / 127.0, -1.0, 1.0);
    vec3 c = r > 0.0 ? vec3(0.96, 0.58, 0.16) : vec3(0.30, 0.55, 0.92);
    // average bodies stay clear; only real differences are painted
    col = vec4(c, smoothstep(0.02, 0.3, t.g) * smoothstep(0.15, 0.8, abs(r)) * 0.55);
  }
  // fade out at the world edge, matching the terrain falloff
  float edge = smoothstep(0.0, 6.0, min(min(vXZ.x, vXZ.y), min(uWorld - vXZ.x, uWorld - vXZ.y)));
  // keep the ponds and the creek clear (static A = distance to water / 64 m)
  if (uMode != 3) edge *= smoothstep(0.004, 0.035, texture2D(tStatic, uv).a);
  gl_FragColor = vec4(col.rgb, col.a * uAlpha * edge);
}`;

export class OverlayLayer {
  readonly object3D: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private traitTex: THREE.DataTexture;
  private want: OverlayMode = 'none';
  private shown: OverlayMode = 'none';
  private alpha = 0;
  private packs: ArrayLike<number> = [];
  private names: string[] = [];
  private labelRoot: HTMLElement;
  private labels: HTMLElement[] = [];
  private legend: HTMLElement;
  private v = new THREE.Vector3();

  constructor(private worldSize: number, private heightAt: (x: number, z: number) => number, shared: SharedUniforms, hosts: { labels: HTMLElement; legend: HTMLElement }) {
    const geo = new THREE.PlaneGeometry(worldSize, worldSize, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.translate(worldSize / 2, 0, worldSize / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)) + LIFT);
    geo.computeBoundingSphere();

    this.traitTex = new THREE.DataTexture(new Uint8Array(32 * 32 * 4), 32, 32, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.traitTex.minFilter = this.traitTex.magFilter = THREE.LinearFilter;
    this.traitTex.generateMipmaps = false;
    this.traitTex.needsUpdate = true;

    const packs = Array.from({ length: MAX_PACKS }, () => new THREE.Vector4());
    const cols = Array.from({ length: MAX_PACKS }, (_, i) => new THREE.Color(PACK_HEX[i % PACK_HEX.length]));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tVeg: shared.vegTex,
        tTrait: { value: this.traitTex },
        tStatic: shared.staticTex,
        uWorld: { value: worldSize },
        uMode: { value: 0 },
        uAlpha: { value: 0 },
        uTime: shared.time,
        uPacks: { value: packs },
        uPackCol: { value: cols },
        uPackN: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.object3D = new THREE.Mesh(geo, this.mat);
    this.object3D.name = 'overlay';
    this.object3D.renderOrder = 5;
    this.object3D.frustumCulled = false;
    this.object3D.visible = false;

    this.labelRoot = document.createElement('div');
    this.labelRoot.className = 'tg-map-labels';
    this.legend = document.createElement('div');
    this.legend.className = 'tg-map-legend tg-glass';
    this.legend.hidden = true;
    hosts.labels.prepend(this.labelRoot); // beneath the UI chrome
    hosts.legend.append(this.legend);
  }

  setMode(m: OverlayMode): void {
    this.want = m;
  }

  setTraitGrid(data: Uint8Array): void {
    (this.traitTex.image.data as Uint8Array).set(data.subarray(0, 32 * 32 * 4));
    this.traitTex.needsUpdate = true;
  }

  /** Packs as stride-4 (den x, den y, radius, size) with a display name per pack. */
  setPacks(packs: ArrayLike<number>, names: string[]): void {
    this.packs = packs;
    this.names = names;
    const n = Math.min(MAX_PACKS, (packs.length / 4) | 0);
    const u = this.mat.uniforms;
    const arr = u.uPacks.value as THREE.Vector4[];
    const cols = u.uPackCol.value as THREE.Color[];
    for (let i = 0; i < n; i++) {
      arr[i].set(packs[i * 4], packs[i * 4 + 1], packs[i * 4 + 2], packs[i * 4 + 3]);
      cols[i].set(PACK_HEX[this.colorIndex(names[i]) % PACK_HEX.length]);
    }
    u.uPackN.value = n;
  }

  /** A pack keeps its color for life: derived from its name, not its slot. */
  private colorIndex(name: string | undefined): number {
    let h = 0;
    for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  update(dt: number, camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    // fade the current mode out before the next one fades in
    const target = this.want === this.shown && this.want !== 'none' ? 1 : 0;
    this.alpha += Math.sign(target - this.alpha) * Math.min(Math.abs(target - this.alpha), dt / FADE_S);
    if (this.alpha <= 0 && this.want !== this.shown) {
      this.shown = this.want;
      this.mat.uniforms.uMode.value = MODE_ID[this.shown];
      this.renderLegend();
    }
    this.mat.uniforms.uAlpha.value = this.alpha;
    this.object3D.visible = this.alpha > 0.001;
    this.legend.hidden = this.shown === 'none' || this.alpha <= 0.001;
    this.legend.style.opacity = String(this.alpha);
    this.updateLabels(camera, canvas);
  }

  private renderLegend(): void {
    const L = LEGENDS[this.shown];
    this.legend.replaceChildren();
    if (!L) return;
    const title = document.createElement('div');
    title.className = 'tg-map-legend-title';
    title.textContent = L.title;
    this.legend.append(title);
    if (L.ramp) {
      const bar = document.createElement('div');
      bar.className = 'tg-map-legend-ramp';
      bar.style.background = L.ramp;
      const ends = document.createElement('div');
      ends.className = 'tg-map-legend-ends';
      const lo = document.createElement('span'), hi = document.createElement('span');
      lo.textContent = L.lo;
      hi.textContent = L.hi;
      ends.append(lo, hi);
      this.legend.append(bar, ends);
    } else {
      const note = document.createElement('div');
      note.className = 'tg-map-legend-note';
      note.textContent = 'Each ring is one pack\'s range; the small ring is its den.';
      this.legend.append(note);
    }
  }

  private updateLabels(camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    const show = this.shown === 'territory' && this.alpha > 0.01;
    const n = show ? Math.min(MAX_PACKS, (this.packs.length / 4) | 0) : 0;
    while (this.labels.length < n) {
      const el = document.createElement('div');
      el.className = 'tg-map-label';
      el.append(document.createElement('b'), document.createElement('span'));
      this.labelRoot.append(el);
      this.labels.push(el);
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (let i = 0; i < this.labels.length; i++) {
      const el = this.labels[i];
      if (i >= n) { el.style.display = 'none'; continue; }
      const x = this.packs[i * 4], z = this.packs[i * 4 + 1], size = this.packs[i * 4 + 3];
      this.v.set(x, this.heightAt(x, z) + 9, z).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.opacity = String(this.alpha);
      el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px) translate(-50%, calc(-100% - 10px))`;
      el.style.color = PACK_HEX[this.colorIndex(this.names[i]) % PACK_HEX.length];
      const name = `${this.names[i] ?? 'Unnamed'} pack`;
      const count = `${size | 0} ${size === 1 ? 'wolf' : 'wolves'}`;
      if (el.firstChild!.textContent !== name) el.firstChild!.textContent = name;
      if (el.lastChild!.textContent !== count) el.lastChild!.textContent = count;
    }
  }

  dispose(): void {
    this.object3D.geometry.dispose();
    this.mat.dispose();
    this.traitTex.dispose();
    this.labelRoot.remove();
    this.legend.remove();
  }
}
