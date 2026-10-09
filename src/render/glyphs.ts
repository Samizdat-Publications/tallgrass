// Map glyphs (r-far-read): from a high camera (about 250 m above the ground and up, the map and the drone views) every living animal gets a
// small clean mark over it in its species palette colour, a chevron pointing the way it is heading (a diamond for the fliers), a
// fixed few pixels across whatever the zoom. A herd, a pack and a lone animal then count at a glance even where the bodies themselves
// are a handful of pixels. One instanced draw, nothing at all below the fade (the layer skips the staging too).
import * as THREE from 'three';
import { SPECIES } from '../sim/species';

/** Camera height above the ground (m) over which the glyphs fade in: nothing below FADE0, full from FADE1. */
export const GLYPH_FADE0 = 210;
export const GLYPH_FADE1 = 300;

/** Size of the glyph in pixels on a 900 px tall viewport, per species key (a predator's mark is a little larger, a bird's smaller). */
const SIZE_PX: Record<string, number> = {
  bison: 7.2, wolf: 12, cougar: 12, coyote: 8, pronghorn: 6.5, muledeer: 6.5, raven: 5, eagle: 8, hawk: 6.5, beaver: 5,
};
/** Species whose glyph is a diamond (the fliers) rather than a chevron. */
const DIAMOND: Record<string, boolean> = { raven: true, eagle: true, hawk: true };
/** Opacity per species: the many small ones (ravens) sit back a little so the herds and the packs lead. */
const ALPHA: Record<string, number> = { raven: 0.7, hawk: 0.85, eagle: 0.9, beaver: 0.8 };

const CAP0 = 2048;

export class MapGlyphs {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private cap = CAP0;
  private p = new Float32Array(CAP0 * 4); // x, y, z, size px
  private c = new Float32Array(CAP0 * 4); // r, g, b, alpha
  private h = new Float32Array(CAP0 * 4); // heading x, heading z, shape (0 chevron, 1 diamond), spare
  private attrP: THREE.InstancedBufferAttribute;
  private attrC: THREE.InstancedBufferAttribute;
  private attrH: THREE.InstancedBufferAttribute;
  private n = 0;
  /** 0..1: how far the glyphs are faded in this frame (0: the layer stages nothing). */
  fade = 0;
  private uFade = { value: 0 };
  private uView = { value: new THREE.Vector2(1600, 900) };
  private uLow: { value: number };
  private tmpV = new THREE.Vector2();
  private col: Array<[number, number, number]>;
  private size: number[];
  private shape: number[];
  private alpha: number[];

  /** `uLow`: the animal layer's night amount (0 day .. 1 night), which takes the marks down a little in the dark. */
  constructor(uLow: { value: number }) {
    this.uLow = uLow;
    this.col = SPECIES.map((s) => { const c = new THREE.Color(s.color); return [c.r, c.g, c.b] as [number, number, number]; });
    this.size = SPECIES.map((s) => SIZE_PX[s.key] ?? 7);
    this.shape = SPECIES.map((s) => (DIAMOND[s.key] ? 1 : 0));
    this.alpha = SPECIES.map((s) => ALPHA[s.key] ?? 1);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setIndex(quad.getIndex());
    this.attrP = new THREE.InstancedBufferAttribute(this.p, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrC = new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrH = new THREE.InstancedBufferAttribute(this.h, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aP', this.attrP);
    this.geo.setAttribute('aC', this.attrC);
    this.geo.setAttribute('aH', this.attrH);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      uniforms: { uView: this.uView, uFade: this.uFade, uLow: this.uLow },
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aC; attribute vec4 aH;
        uniform vec2 uView; uniform float uFade; uniform float uLow;
        varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vOut; varying vec2 vHead;
        const float PAD = 1.4;
        void main() {
          vec4 c0 = projectionMatrix * viewMatrix * vec4(aP.xyz, 1.0);
          // the heading on screen: the point a few metres ahead of the animal, as a direction in pixels (x right, y up)
          vec4 c1 = projectionMatrix * viewMatrix * vec4(aP.xyz + vec3(aH.x, 0.0, aH.y) * 3.0, 1.0);
          vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * uView;
          float dl = length(d);
          vHead = dl > 1e-3 ? d / dl : vec2(0.0, 1.0);
          float px = aP.w * uView.y / 900.0;
          // the quad is a square (PAD times the glyph) that does not turn; the fragment turns the glyph into the heading
          vUv = position.xy * 2.0 * PAD;
          vCol = vec4(aC.rgb * (1.0 - 0.4 * uLow), aC.a * uFade);
          vShape = aH.z;
          vOut = 1.3 * 2.0 / max(px, 1.0);
          vec4 clip = c0;
          clip.xy += position.xy * px * PAD * 2.0 / uView * clip.w;
          if (uFade <= 0.001 || c0.w <= 0.0) clip = vec4(2.0, 2.0, 2.0, 1.0);
          gl_Position = clip;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vOut; varying vec2 vHead;
        void main() {
          // turn the pixel into the glyph's frame (+y along the heading)
          vec2 p = vec2(dot(vUv, vec2(vHead.y, -vHead.x)), dot(vUv, vHead));
          float d;
          if (vShape < 0.5) {
            float ax = abs(p.x);
            float e1 = (p.y - 0.95 + 2.3 * ax) * 0.399;   // the two slanted sides (1 / sqrt(1 + 2.3^2))
            float e2 = -0.8 - p.y;                        // the flat back
            float b = (p.y + 0.15 + 0.9 * ax) * 0.743;    // the notch cut out of the back (1 / sqrt(1 + 0.9^2))
            d = max(max(e1, e2), -b);
          } else {
            d = (abs(p.x) + abs(p.y)) * 0.7071 - 0.62;
          }
          float fw = max(fwidth(d), 1e-4);
          float fill = 1.0 - smoothstep(-fw, fw, d);
          float edge = 1.0 - smoothstep(vOut - fw, vOut + fw, d);   // a dark outline about 1.3 px wide round it
          float a = max(edge * 0.78, fill);
          if (a * vCol.a < 0.01) discard;
          vec3 col = mix(vec3(0.03, 0.025, 0.02), vCol.rgb, fill);
          gl_FragColor = vec4(col, a * vCol.a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 27;
    this.mesh.name = 'map-glyphs';
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (r, scene) => {
      r.getDrawingBufferSize(this.tmpV);
      this.uView.value.copy(this.tmpV);
      this.geo.instanceCount = scene.overrideMaterial ? 0 : this.n;
    };
    this.mesh.onAfterRender = () => { this.geo.instanceCount = this.n; };
  }

  /** Start a frame: `fade` from the camera's height. Returns whether the layer should stage glyphs at all. */
  begin(camAboveGround: number): boolean {
    const t = Math.min(1, Math.max(0, (camAboveGround - GLYPH_FADE0) / (GLYPH_FADE1 - GLYPH_FADE0)));
    this.fade = t * t * (3 - 2 * t);
    this.uFade.value = this.fade;
    this.n = 0;
    this.mesh.visible = this.fade > 0.002;
    if (!this.mesh.visible) this.geo.instanceCount = 0;
    return this.mesh.visible;
  }

  add(sp: number, x: number, y: number, z: number, hx: number, hz: number, scale: number): void {
    if (this.n >= this.cap) this.grow();
    const q = this.n++ * 4;
    const col = this.col[sp];
    if (!col) { this.n--; return; }
    this.p[q] = x; this.p[q + 1] = y; this.p[q + 2] = z;
    this.p[q + 3] = this.size[sp] * Math.sqrt(Math.min(1.25, Math.max(0.7, scale)));
    this.c[q] = col[0]; this.c[q + 1] = col[1]; this.c[q + 2] = col[2]; this.c[q + 3] = this.alpha[sp];
    this.h[q] = hx; this.h[q + 1] = hz; this.h[q + 2] = this.shape[sp]; this.h[q + 3] = 0;
  }

  end(): void {
    this.geo.instanceCount = this.n;
    if (this.n === 0) return;
    for (const a of [this.attrP, this.attrC, this.attrH]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * 4); a.needsUpdate = true; }
  }

  private grow(): void {
    const cap = this.cap * 2;
    const mk = (src: Float32Array) => { const a = new Float32Array(cap * 4); a.set(src); return a; };
    this.p = mk(this.p); this.c = mk(this.c); this.h = mk(this.h);
    this.cap = cap;
    this.attrP = new THREE.InstancedBufferAttribute(this.p, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrC = new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrH = new THREE.InstancedBufferAttribute(this.h, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aP', this.attrP);
    this.geo.setAttribute('aC', this.attrC);
    this.geo.setAttribute('aH', this.attrH);
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
