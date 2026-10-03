// Standalone dev page for the grass field. Own minimal scene, does not touch src/render/engine.ts.
// Query: ?seed=1&day=0.29&season=1.2&wind=0.6&wdir=0.5&cam=low|lowback|wide|close|hill|top
//        &shadow=1&quality=high|medium&fog=0.0028&exp=1&az=215&hud=0&grass=1&t0=0&bench=0
//        manual camera: &cx=..&cz=..&ch=<m above ground>&yaw=<deg>&pitch=<deg>&fov=<deg>
import * as THREE from 'three';
import { generateWorld, sampleHeight } from '../src/sim/world';
import { Noise2 } from '../src/sim/noise';
import { Rng } from '../src/sim/rng';
import { GrassField, grassTint } from '../src/render/grass';
import type { EnvState } from '../src/sim/types';
import { Weather } from '../src/sim/types';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const seed = num('seed', 1);
const day = num('day', 0.29);
const season = num('season', 1.2);
const windStr = num('wind', 0.6);
const windDir = num('wdir', 0.5);
const camMode = q.get('cam') ?? 'low';
const shadowOn = num('shadow', 1) > 0;
const quality = (q.get('quality') ?? 'high') as 'high' | 'medium';
const fogDensity = num('fog', 0.0028);
const exposure = num('exp', 1.0);
const sunAzDeg = num('az', 215);
const showGrass = num('grass', 1) > 0;
const t0 = num('t0', 0);
const hud = document.getElementById('hud') as HTMLDivElement;
if (num('hud', 1) <= 0) hud.style.display = 'none';

const w = window.innerWidth, h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(w, h);
const tmName = q.get('tm') ?? 'neutral';
renderer.toneMapping = ({ agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, none: THREE.NoToneMapping } as Record<string, THREE.ToneMapping>)[tmName] ?? THREE.AgXToneMapping;
renderer.toneMappingExposure = exposure;
renderer.shadowMap.enabled = shadowOn;
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();

const world = generateWorld(seed);
const n = world.n;

// ---- fake vegetation texture --------------------------------------------------------------------------------
function makeFakeVeg(): THREE.DataTexture {
  const data = new Uint8Array(n * n * 4);
  const noise = new Noise2(new Rng(seed ^ 0xabc));
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // trampled path from (90, 120) to (420, 330)
  const p0 = [90, 120], p1 = [420, 330];
  const pdx = p1[0] - p0[0], pdy = p1[1] - p0[1], pl2 = pdx * pdx + pdy * pdy;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i;
      const x = (i + 0.5) * world.cell, y = (j + 0.5) * world.cell;
      const cap = world.capacity[c];
      let b = Math.min(1, cap / 0.72);
      const graze = smooth(0.18, 0.5, noise.fbm(x / 38 + 9, y / 38 - 3, 2));
      b *= 1 - 0.9 * graze;
      let s = ((x - p0[0]) * pdx + (y - p0[1]) * pdy) / pl2;
      s = Math.max(0, Math.min(1, s));
      const d = Math.hypot(x - (p0[0] + pdx * s), y - (p0[1] + pdy * s));
      b *= 1 - 0.88 * (1 - smooth(1.2, 3.2, d));
      // burned corner
      const bd = Math.hypot(x - 18, y - 18);
      const burn = 1 - smooth(34, 58, bd + noise.get(x / 12, y / 12) * 6);
      b *= 1 - burn;
      data[c * 4] = Math.round(Math.max(0, Math.min(1, b)) * 255);
      data[c * 4 + 1] = Math.round(world.soilBase[c] * 255);
      data[c * 4 + 2] = Math.round(burn * 255);
      data[c * 4 + 3] = 0;
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const vegTex = makeFakeVeg();
const vegData = vegTex.image.data as Uint8Array;

// ---- sun and sky ---------------------------------------------------------------------------------------------
const elevMax = (65 * Math.PI) / 180;
const elev = elevMax * Math.sin(2 * Math.PI * (day - 0.25));
const az = (sunAzDeg * Math.PI) / 180;
const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
const e = sunDir.y;
const sm = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const golden = 1 - sm(0.08, 0.5, Math.max(0, e));
const bright = sm(-0.12, 0.06, e);
const mixC = (a: number[], b: number[], t: number) => new THREE.Color(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
const horizon = mixC([0.62, 0.74, 0.92], [1.0, 0.7, 0.4], golden).multiplyScalar(0.2 + 0.7 * bright);
horizon.lerp(new THREE.Color(0.02, 0.03, 0.07), 1 - bright);
const zenith = mixC([0.1, 0.26, 0.62], [0.34, 0.4, 0.58], golden).multiplyScalar(0.15 + 0.85 * bright);
const sunColor = mixC([1, 0.95, 0.88], [1, 0.58, 0.26], golden).multiplyScalar((2.3 + 0.8 * (1 - golden)) * bright);
const skyCol = zenith.clone().multiplyScalar(0.9).lerp(horizon, 0.55);
const groundCol = new THREE.Color(0.5, 0.33, 0.15).multiplyScalar(0.35 + 0.65 * bright);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(horizon.clone(), fogDensity);
const hemi = new THREE.HemisphereLight(skyCol, groundCol, 1.6 * (0.3 + 0.7 * bright));
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
// DirectionalLight color and intensity: keep radiance in the intensity so grass can read color * intensity.
sunLight.color.copy(sunColor).multiplyScalar(1 / Math.max(1e-3, Math.max(sunColor.r, sunColor.g, sunColor.b)));
sunLight.intensity = Math.max(sunColor.r, sunColor.g, sunColor.b);
sunLight.castShadow = shadowOn;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.05;
const SH = 120;
Object.assign(sunLight.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 700 });
scene.add(sunLight, sunLight.target);
const sunRadiance = sunLight.color.clone().multiplyScalar(sunLight.intensity);

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uHorizon: { value: horizon },
    uZenith: { value: zenith },
    uSun: { value: sunDir },
    uSunCol: { value: sunRadiance },
  },
  vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; uniform vec3 uSunCol; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float up = max(d.y, 0.0);
      vec3 c = mix(uHorizon, uZenith, pow(up, 0.85));
      float s = max(dot(d, normalize(uSun)), 0.0);
      c += uSunCol * (pow(s, 900.0) * 1.5 + pow(s, 24.0) * 0.07 + pow(s, 5.0) * 0.015);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -10;
scene.add(sky);

// ---- terrain -------------------------------------------------------------------------------------------------
const hn = world.hn;
const tPos = new Float32Array(hn * hn * 3);
const tCol = new Float32Array(hn * hn * 3);
const tmp = new THREE.Color();
const soil = new THREE.Color(0x4a3720);
const waterCol = new THREE.Color(0x1c3a4a);
const ash = new THREE.Color(0x151210);
for (let j = 0; j < hn; j++) {
  for (let i = 0; i < hn; i++) {
    const k = j * hn + i;
    tPos[k * 3] = i * world.cell;
    tPos[k * 3 + 1] = world.height[k];
    tPos[k * 3 + 2] = j * world.cell;
    const ci = Math.min(n - 1, i), cj = Math.min(n - 1, j);
    const ci0 = Math.max(0, i - 1), cj0 = Math.max(0, j - 1);
    let wet = 0, bio = 0, burn = 0, moist = 0, cnt = 0;
    for (const [a, b] of [[ci, cj], [ci0, cj], [ci, cj0], [ci0, cj0]]) {
      const c = b * n + a;
      wet += world.water[c];
      bio += vegData[c * 4] / 255;
      burn += vegData[c * 4 + 2] / 255;
      moist += world.moisture[c];
      cnt++;
    }
    wet /= cnt; bio /= cnt; burn /= cnt; moist /= cnt;
    grassTint(season, moist, bio, tmp);
    // terrain base is the blades' mid tone, slightly darker (the shadowed floor of the canopy)
    tmp.multiplyScalar(0.95);
    tmp.lerp(soil, 1 - sm(0.02, 0.4, bio));
    tmp.lerp(ash, sm(0.1, 0.8, burn));
    tmp.lerp(waterCol, sm(0.2, 0.7, wet));
    tCol[k * 3] = tmp.r; tCol[k * 3 + 1] = tmp.g; tCol[k * 3 + 2] = tmp.b;
  }
}
const tIdx: number[] = [];
for (let j = 0; j < hn - 1; j++) {
  for (let i = 0; i < hn - 1; i++) {
    const a = j * hn + i, b = a + 1, c = a + hn, d = c + 1;
    tIdx.push(a, c, b, b, c, d); // counter-clockwise seen from +Y
  }
}
const tGeo = new THREE.BufferGeometry();
tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
tGeo.setIndex(tIdx);
tGeo.computeVertexNormals();
const terrain = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// cottonwood stand-ins: shadow casters so the grass has something to be shadowed by
{
  const nt = world.trees.length / 4;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 1, 6), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }), nt);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x4f6a2a }), nt);
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3(), qn = new THREE.Quaternion();
  for (let i = 0; i < nt; i++) {
    const x = world.trees[i * 4], y = world.trees[i * 4 + 1], th = world.trees[i * 4 + 2], cr = world.trees[i * 4 + 3];
    const gy = sampleHeight(world.height, hn, world.cell, x, y);
    p.set(x, gy + th * 0.3, y); s.set(1, th * 0.6, 1);
    m.compose(p, qn, s); trunk.setMatrixAt(i, m);
    p.set(x, gy + th * 0.72, y); s.set(cr, cr * 1.1, cr);
    m.compose(p, qn, s); crown.setMatrixAt(i, m);
  }
  for (const mesh of [trunk, crown]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }
}

// ---- grass ---------------------------------------------------------------------------------------------------
const grass = new GrassField(world, vegTex, { quality });
grass.viewportHeight = h;
for (const k of ['lightScale', 'translucency', 'specular', 'gustLight', 'maxHeight', 'bladeWidth', 'windGain', 'baseOcclusion', 'saturation', 'debug'] as const) {
  if (q.has(k)) grass.params[k] = Number(q.get(k));
}
grass.object3D.visible = showGrass;
scene.add(grass.object3D);

// ---- camera --------------------------------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(num('fov', 50), w / h, 0.05, 4000);
const groundY = (x: number, z: number) => sampleHeight(world.height, hn, world.cell, x, z);
function creekPoint(frac: number): [number, number] {
  const k = Math.floor((world.creek.length / 2) * frac);
  return [world.creek[k * 2], world.creek[k * 2 + 1]];
}
{
  const [cxk, czk] = creekPoint(0.5);
  let cx = cxk, cz = czk + 38, ch = 1.4, yaw = sunAzDeg, pitch = 3, fov = 50;
  [cx, cz] = [250, 150];
  switch (camMode) {
    case 'lowback': yaw = sunAzDeg + 180; pitch = 2; break;
    case 'wide': [cx, cz] = [140, 235]; ch = 55; yaw = sunAzDeg + 150; pitch = -24; fov = 52; break;
    case 'grazed': [cx, cz] = [150, 230]; ch = 3; yaw = sunAzDeg + 150; pitch = -14; fov = 55; break;
    case 'close': [cx, cz] = [255, 155]; ch = 1.1; yaw = sunAzDeg + 25; pitch = -24; fov = 55; break;
    case 'hill': [cx, cz] = [150, 230]; ch = 22; yaw = sunAzDeg + 150; pitch = -14; fov = 55; break;
    case 'creek': [cx, cz] = [cxk - 4, czk + 20]; ch = 1.6; yaw = sunAzDeg + 60; pitch = 2; break;
    case 'top': [cx, cz] = [world.size * 0.5, world.size * 0.5]; ch = 420; yaw = 0; pitch = -89.9; fov = 60; break;
    default: break;
  }
  cx = num('cx', cx); cz = num('cz', cz); ch = num('ch', ch); yaw = num('yaw', yaw); pitch = num('pitch', pitch); fov = num('fov', fov);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(cx, groundY(cx, cz) + ch, cz);
  const yr = (yaw * Math.PI) / 180, pr = (pitch * Math.PI) / 180;
  camera.lookAt(camera.position.x + Math.cos(yr) * Math.cos(pr), camera.position.y + Math.sin(pr), camera.position.z + Math.sin(yr) * Math.cos(pr));
}

const env: EnvState = {
  tick: 0, year: 0, season, dayFrac: day, weather: Weather.Clear, rain: 0, windDir, windStrength: windStr, warmth: 0.6,
};

// ---- loop ----------------------------------------------------------------------------------------------------
const times: number[] = [];
let frames = 0;
let benching = false;
const clock0 = performance.now();

function renderOnce(tSec: number): void {
  // keep the shadow frustum centered ahead of the camera
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const cx = camera.position.x + fwd.x * 55, cz = camera.position.z + fwd.z * 55;
  const cy = groundY(Math.max(0, Math.min(world.size, cx)), Math.max(0, Math.min(world.size, cz)));
  sunLight.target.position.set(cx, cy, cz);
  sunLight.position.copy(sunLight.target.position).addScaledVector(sunDir, 300);
  sunLight.target.updateMatrixWorld();
  grass.update(camera, tSec, env, { dir: sunDir, color: sunRadiance });
  renderer.render(scene, camera);
}

function tick(): void {
  if (benching) return;
  const now = performance.now();
  renderOnce(t0 + (now - clock0) / 1000);
  times.push(now);
  if (times.length > 90) times.shift();
  if (times.length > 5) (window as any).__fps = Math.round(((times.length - 1) * 1000) / (times[times.length - 1] - times[0]) * 10) / 10;
  frames++;
  if (frames === 6) (window as any).__ready = true;
  if (frames % 15 === 0 && hud.style.display !== 'none') {
    const st = grass.stats;
    hud.textContent = `fps ${(window as any).__fps ?? '-'}  cells ${st.cells.join('/')}  instances ${(st.instances / 1000).toFixed(0)}k  verts ${(st.vertices / 1e6).toFixed(2)}M\n` +
      `cam ${camMode}  day ${day}  season ${season}  wind ${windStr}  quality ${quality}  shadow ${shadowOn ? 'on' : 'off'}`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Synchronous benchmark: renders back to back with a GPU sync after each frame, vsync does not apply.
(window as any).__bench = async (count = 150, withGrass = true): Promise<number> => {
  benching = true;
  await new Promise((r) => setTimeout(r, 50));
  grass.object3D.visible = withGrass;
  const px = new Uint8Array(4);
  for (let i = 0; i < 20; i++) { renderOnce(i * 0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const t = performance.now();
  for (let i = 0; i < count; i++) { renderOnce(i * 0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const ms = (performance.now() - t) / count;
  grass.object3D.visible = showGrass;
  benching = false;
  requestAnimationFrame(tick);
  return ms;
};
(window as any).__grass = grass;
(window as any).__renderer = renderer;
if (num('bench', 0) > 0) {
  setTimeout(async () => {
    const a = await (window as any).__bench(150, true);
    const b = await (window as any).__bench(150, false);
    (window as any).__benchResult = { withGrassMs: a, withoutGrassMs: b, grassMs: a - b };
  }, 1500);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  grass.viewportHeight = window.innerHeight;
});
