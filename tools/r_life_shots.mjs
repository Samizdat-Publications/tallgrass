// r-life stills: puppet animals through the creek (and other staged scenes) and capture a burst of frames from the real game.
// The sim is left running at 1x; the incoming snapshots are edited in the page so chosen animals walk, trot or run a line across the creek
// (the layer cannot tell: it draws what the snapshot says). Never an OS screen grab.
//
// Usage: node tools/r_life_shots.mjs --scene wade_bison --out review/wip/r-life/before [--n 6] [--gap 700] [--size 1280x720] [--day 0.62] [--rain 0]
// Scenes: wade_bison, wade_wolf, wade_run, wade_pack, wade_front, wade_deer
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/r_life');
const scene = arg('scene', 'wade_bison');
const N = Number(arg('n', 6)), GAP = Number(arg('gap', 700));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const day = Number(arg('day', 0.62)), rain = Number(arg('rain', 0));
const ck = Number(arg('ck', 0.5)); // creek fraction where the crossing is
const ext = 'jpg';

// puppet specs: sp, state, speed (world m/s), lateral offset along the creek (m), cross offset (m)
const SCENES = {
  wade_bison: { cam: [17, 12, 'side'], pup: [[0, 2, 1.5, 0, 0], [0, 2, 1.4, 5, 3], [0, 2, 1.3, -5, 6]] },
  wade_wolf: { cam: [14, 11, 'side'], pup: [[1, 2, 3.2, 0, 0], [1, 2, 3.0, 4, 2]] },
  wade_run: { cam: [16, 11, 'side'], pup: [[1, 5, 8.5, 0, 0], [0, 4, 7.0, 6, 4]] },
  wade_pack: { cam: [18, 14, 'side'], pup: [[1, 2, 3.0, 0, 0], [1, 2, 3.0, 3, 3], [1, 2, 3.1, -3, 5], [0, 2, 1.5, 8, 10]] },
  wade_front: { cam: [18, 14, 'front'], pup: [[0, 2, 1.4, 0, 0], [1, 2, 3.2, 3, 4]] },
  // alert: three grazing bison on the far bank (cr 34 = 14 m across the creek) and a wolf that trots the crossing line past them
  alert: { arena: true, speed: 0.05, cam: [14, 9, 'side', 10], pup: [[0, 1, 0, 0, 30], [0, 1, 0, 5, 32], [0, 1, 0, -5, 29], [1, 2, 4.0, 9, 0]] },
  alert_pg: { arena: true, speed: 0.05, cam: [16, 9, 'side', 10], pup: [[3, 1, 0, 0, 30], [3, 1, 0, 5, 32], [10, 1, 0, -5, 29], [1, 2, 4.0, 9, 0]] },
  wade_deer: { cam: [14, 11, 'side'], pup: [[3, 2, 2.0, 0, 0], [10, 2, 2.0, 4, 3], [3, 5, 9.0, -4, 6]] },
};

const kill = setTimeout(() => { console.error('r_life_shots: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_life') });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); else if (m.text().startsWith('arena')) console.log(m.text()); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => {
    const e = window.__engine, w = e.world, an = window.__animals;
    window.__speed(1); window.__followId(null);
    window.__envO = { season: 1.8, weather: ${rain > 0 ? 1 : 0}, warmth: 0.7, rain: ${rain}, dayFrac: ${day} };
    e.onFrame(() => e.setEnv(window.__envO)); e.setEnv(window.__envO); e.applyEnvNow();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    const nc = w.creek.length / 2, k = Math.min(nc - 3, Math.max(2, Math.floor(nc * ${ck})));
    let cx = w.creek[2 * k], cz = w.creek[2 * k + 1];
    let tx = w.creek[2 * k + 2] - w.creek[2 * k - 2], tz = w.creek[2 * k + 3] - w.creek[2 * k - 1];
    const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    let nx = -tz, nz = tx;
    const creekFrame = { cx, cz, tx, tz, nx, nz };
    const LEN = 40; let t0 = performance.now(); let pups = []; window.__lifePups = () => pups;
    window.__scene = (spec, mode, dist, pitch, fa, arena) => {
      if (arena) {
        // the emptiest dry spot of the valley: the animals there are only the puppets
        const sn = window.__snap(); let best = -1, bx = 256, bz = 256;
        for (let gx = 60; gx <= 450; gx += 15) for (let gz = 60; gz <= 450; gz += 15) {
          const c = Math.floor(gz / w.cell) * w.n + Math.floor(gx / w.cell);
          if (w.water[c] || w.waterDist[c] < 25) continue;
          let d = 120;
          for (let i = 0; i < sn.count; i++) { const dx = sn.agents[i * 12 + 1] - gx, dz = sn.agents[i * 12 + 2] - gz; const q = Math.sqrt(dx * dx + dz * dz); if (q < d) d = q; }
          if (d > best) { best = d; bx = gx; bz = gz; }
        }
        cx = bx; cz = bz; tx = 0; tz = 1; nx = 1; nz = 0;
        console.log('arena', bx, bz, 'clear radius', best);
      } else { cx = creekFrame.cx; cz = creekFrame.cz; tx = creekFrame.tx; tz = creekFrame.tz; nx = creekFrame.nx; nz = creekFrame.nz; }
      const used = new Set();
      pups = spec.map((s) => { const c = window.__find(s[0], undefined).filter((i) => !used.has(i)); const id = c.length ? c[Math.floor(c.length / 3)] : null; if (id !== null) used.add(id); return { id, sp: s[0], st: s[1], v: s[2], lat: s[3], cr: s[4] }; }).filter((p) => p.id !== null);
      t0 = performance.now();
      const yaw = (mode === 'side' ? Math.atan2(tx, tz) : Math.atan2(nx, nz)) * 180 / Math.PI;
      e.cam.setView({ x: cx + tx * 1.5 + nx * (fa || 0), y: cz + tz * 1.5 + nz * (fa || 0), distance: dist, pitchDeg: pitch, yawDeg: yaw }, true);
    };
    const puppet = (snap) => {
      if (!snap) return;
      const idx = new Map(); for (let i = 0; i < snap.count; i++) idx.set(snap.ids[i], i);
      const now = (performance.now() - t0) / 1000;
      for (const p of pups) {
        const i = idx.get(p.id); if (i === undefined) continue;
        const o = i * 12, A = snap.agents;
        const u = (((now * p.v + p.cr) % LEN) + LEN) % LEN;
        const along = u - LEN / 2;
        A[o + 1] = cx + nx * along + tx * p.lat; A[o + 2] = cz + nz * along + tz * p.lat;
        A[o + 3] = Math.atan2(nz, nx); A[o + 4] = p.v / 1.5; A[o + 7] = p.st; A[o + 8] = 0; A[o + 9] = 0;
      }
    };
    // the puppets are written into the layer's snapshots every frame (the sim's own snapshots can be seconds apart at a crawl)
    const origUpdate = an.update.bind(an);
    an.update = (...a) => { puppet(an.curr); if (an.prev && an.prev !== an.curr) puppet(an.prev); origUpdate(...a); };
  })()`);
  mkdirSync(out, { recursive: true });
  for (const name of scene.split(',')) {
    const sc = SCENES[name];
    if (!sc) { console.log('unknown scene', name); continue; }
    await page.evaluate(`window.__speed(${sc.speed ?? 1})`);
    await page.evaluate(`window.__scene(${JSON.stringify(sc.pup)}, '${sc.cam[2]}', ${sc.cam[0]}, ${sc.cam[1]}, ${sc.cam[3] || 0}, ${sc.arena ? 'true' : 'false'})`);
    await page.evaluate('window.__animals.alertProfile = true; window.__animals.alertMs = 0; window.__animals.alertFrames = 0');
    await page.waitForTimeout(3500);
    for (let i = 0; i < N; i++) {
      const p = `${out}/${name}_${String(i).padStart(2, '0')}.${ext}`;
      await page.screenshot({ path: p, type: 'jpeg', quality: 90, timeout: 150000 });
      console.log('saved', p);
      await page.waitForTimeout(GAP);
    }
    if (argv.includes('--bench')) {
      // A/B of the whole animal update with the alert pass on and off (interleaved, 4 s each), the layer's own cost per frame
      const r = await page.evaluate(`(async () => {
        const an = window.__animals, orig = an.update.bind(an); let acc = 0, n = 0;
        an.update = (...a) => { const t = performance.now(); orig(...a); acc += performance.now() - t; n++; };
        const out = { on: [], off: [] };
        for (const mode of [true, false, true, false]) {
          an.alertEnabled = mode; acc = 0; n = 0;
          await new Promise((r) => setTimeout(r, 4000));
          out[mode ? 'on' : 'off'].push(acc / Math.max(1, n));
        }
        an.update = orig; an.alertEnabled = true;
        return out;
      })()`);
      console.log(name, 'animals.update ms per frame (alert on / off):', JSON.stringify(r), 'agents', await page.evaluate('window.__snap().count'));
    }
  }
} catch (e) {
  console.error('r_life_shots failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
