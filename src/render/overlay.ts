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
/**
 * Pack colors: eight hues that all sit in the cool-to-pink half of the wheel (teal through blue and violet to rose), because the grass
 * runs from green through straw gold to autumn copper (hues about 20 to 100 degrees) and a pack tinted in any of those vanished on it
 * (round 17: the gold pack on summer grass). Saturated enough to read on turf, snow and moonlit ground. The tint is lit like the land
 * (see the shader), so it sits in the scene. PACK_HUE is each colour's hue in degrees, for picking the most different free colour.
 */
const PACK_HEX = ['#2f7fe8', '#e0488c', '#14b8a6', '#9b5ae0', '#46d0f0', '#d946e0', '#3b3fc4', '#f0506e'];
const PACK_HUE = [215, 335, 173, 272, 192, 295, 238, 350];
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
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  vNormal = normal;
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
uniform float uNight;
uniform vec4 uPacks[${MAX_PACKS}];
uniform vec3 uPackCol[${MAX_PACKS}];
uniform int uPackN;
uniform vec3 uLightDir;
uniform vec3 uLightCol;
varying vec2 vXZ;
varying vec3 vNormal;

// straight-alpha "over": the old form mixed from black at low alpha, which darkened the tint twice (the output is blended again) and washed every range out
vec4 over(vec4 dst, vec3 c, float a) {
  float oa = a + dst.a * (1.0 - a);
  return vec4((c * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-4), oa);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

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
    // how the ground is lit here: the tint is a stain on the land, so it shades with the slopes and dims with the light
    // (kept off black, or a night range would vanish)
    float lum = dot(uLightCol, vec3(0.3, 0.55, 0.15));
    float lit = clamp(0.52 + 0.48 * max(dot(normalize(vNormal), uLightDir), 0.0) * min(1.0, lum * 0.8), 0.52, 1.0);
    for (int i = 0; i < ${MAX_PACKS}; i++) {
      if (i >= uPackN) break;
      vec4 p = uPacks[i];
      vec2 q = vXZ - p.xy;
      float d = length(q);
      float aa = max(0.8, fwidth(d) * 1.2);
      // a range is not a circle: the radius wanders with the direction, a broad lobe and a finer ripple, so the border
      // follows the land the way a territory does (each pack its own shape)
      vec2 dir = q / max(d, 0.001);
      float fi = float(i);
      float wob = (vnoise(dir * 1.5 + fi * 3.1) - 0.5) * 0.36 + (vnoise(dir * 4.1 + 9.0 + fi * 1.7) - 0.5) * 0.12;
      float R = p.z * (1.0 + wob);
      float r = d / max(R, 1.0);
      // The range is an outline with a faint tint and a light hatch inside, not a solid fill: animals inside a range stay in view
      // (round 20: the saturated fills smothered the scene). A feathered tint, mottled a little, a touch denser toward the edge.
      float inside = 1.0 - smoothstep(0.80, 1.02, r);
      float mott = 0.84 + 0.32 * vnoise(vXZ * 0.11 + fi * 5.0);
      float wash = inside * (0.075 + 0.075 * smoothstep(0.35, 0.95, r)) * mott;
      // a light diagonal hatch, anti-aliased by the screen footprint and faded out where it would shimmer (far away)
      float hv = (vXZ.x - vXZ.y) / 8.0;
      float hw = max(fwidth(hv), 1e-4);
      float hatch = (1.0 - smoothstep(0.045, 0.045 + 1.5 * hw, abs(fract(hv) - 0.5))) * (1.0 - smoothstep(0.18, 0.42, hw));
      // a soft rim just inside the border, so the range reads as a shape at a glance
      float rim = smoothstep(0.80, 0.985, r) * (1.0 - smoothstep(0.985, 1.03, r));
      // the den: a small dot and a faint breathing ring
      float dr = 3.2 + 0.5 * sin(uTime * 1.6 + fi);
      float de = (d - dr) / max(0.9, aa);
      float den = (1.0 - smoothstep(0.7, 0.7 + aa, d)) * 0.85 + exp(-de * de) * 0.35;
      // the pack's own colour, a little desaturated and lit like the ground under it; the border and the den are a brighter tone of it
      vec3 pc = mix(uPackCol[i], vec3(dot(uPackCol[i], vec3(0.3, 0.55, 0.15))), 0.2);
      vec3 base = pc * lit;
      vec3 bright = mix(pc, vec3(1.0), 0.18);
      col = over(col, base, clamp(wash + inside * hatch * 0.1 * mott + rim * 0.1, 0.0, 0.4));
      // a clear border that follows the range's own outline, a little broken along its length, never a drawn circle
      // it tapers: a slow swell along the outline thins it in places and fattens it a little in others
      float swell = smoothstep(0.15, 0.85, vnoise(dir * 2.6 + fi * 4.7));
      // two or three pixels wide at any distance (the width is the screen footprint of a pixel, not a fixed number of metres)
      float px = max(fwidth(d), 0.05);
      float soft = max(px * 2.3, 0.2) * (0.75 + 0.5 * swell);
      float le = (d - R * 0.985) / soft;
      float line = exp(-le * le) * (0.78 + 0.2 * swell) * (0.85 + 0.15 * vnoise(dir * 6.0 + fi * 2.3));
      col = over(col, bright, clamp(line, 0.0, 0.95));
      col = over(col, bright, clamp(den, 0.0, 0.9));
    }
    // at night the ground is dark and the tint needs a little more body to hold
    col.a = min(col.a * (1.0 + 0.35 * uNight), 0.92);
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
  // the night grade cools and lifts everything; keep overlay colours saturated and a little darker so they stay legible
  if (uMode != 3) col.rgb = pow(max(col.rgb, vec3(0.0)), vec3(1.0 + 1.3 * uNight)) * (1.0 - 0.3 * uNight);
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
    geo.computeVertexNormals(); // the tint shades with the slope it lies on
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
        uNight: shared.night,
        uLightDir: shared.lightDir,
        uLightCol: shared.lightColor,
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
    this.assignColors(names, n);
    for (let i = 0; i < n; i++) {
      arr[i].set(packs[i * 4], packs[i * 4 + 1], packs[i * 4 + 2], packs[i * 4 + 3]);
      cols[i].set(this.hexOf(names[i]));
    }
    u.uPackN.value = n;
  }

  /** Pack name to its palette slot. A pack keeps its color for life, and no two living packs share one (up to eight). */
  private slotOf = new Map<string, number>();

  private assignColors(names: string[], n: number): void {
    const live = new Set<string>();
    for (let i = 0; i < n; i++) live.add(names[i] ?? '');
    // a pack that is gone frees its color
    for (const k of this.slotOf.keys()) if (!live.has(k)) this.slotOf.delete(k);
    const used = new Set(this.slotOf.values());
    for (let i = 0; i < n; i++) {
      const name = names[i] ?? '';
      if (this.slotOf.has(name)) continue;
      // the first pack starts from its name's hash; every later one takes the free colour furthest in hue from the colours in use
      let s = this.colorIndex(name) % PACK_HEX.length;
      if (used.size > 0 && used.size < PACK_HEX.length) {
        let best = -1;
        for (let c = 0; c < PACK_HEX.length; c++) {
          if (used.has(c)) continue;
          let gap = 360;
          for (const u of used) {
            const dh = Math.abs(PACK_HUE[c] - PACK_HUE[u]);
            gap = Math.min(gap, Math.min(dh, 360 - dh));
          }
          if (gap > best) { best = gap; s = c; }
        }
      } else {
        for (let tries = 0; tries < PACK_HEX.length && used.has(s); tries++) s = (s + 1) % PACK_HEX.length;
      }
      used.add(s);
      this.slotOf.set(name, s);
    }
  }

  private hexOf(name: string | undefined): string {
    return PACK_HEX[this.slotOf.get(name ?? '') ?? this.colorIndex(name) % PACK_HEX.length];
  }

  /** Name hash: where a pack's search for a free color starts. */
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
      note.textContent = 'Each outlined range is one pack\'s; the small mark is its den.';
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
      el.style.color = this.hexOf(this.names[i]);
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
