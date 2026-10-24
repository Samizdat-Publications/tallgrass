// Scripted still capture of the real game: one page load, a sequence of steps, a named JPEG (quality 90) per step.
// Headless Chromium on the real GPU (same flags as capture.mjs). Never an OS screen grab.
//
// Usage: node tools/stills.mjs --out review/round-01 [--set review] [--query "seed=tallgrass"] [--size 1600x900] [--png]
// --png writes lossless .png instead of the default .jpg.
// Steps run in order; each may evaluate JS in the page (hooks from src/main.ts: __cam, __speed, __timeOfDay,
// __find, __followId, __select, __engine, __ui, __focusHerd) and then wait before the shot.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/stills');
const set = arg('set', 'review');
const query = arg('query', '');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const loadTimeout = Number(arg('timeout', 90000));
const shotTimeout = Number(arg('shot-timeout', 30000)); // (a starved machine needs longer)
const waitScale = Number(arg('wait-scale', 1)); // multiplies every step's wait: easing runs per rendered frame, so a slow machine needs more real time
const png = argv.includes('--png'); // default is JPEG quality 90 (much smaller, fine for review); --png opts back into lossless
const ext = png ? 'png' : 'jpg';

// St: 1 graze, 3 run, 4 flee, 5 chase, 6 eat, 9 fly, 10 stalk. Sp: 0 bison, 1 wolf, 2 raven, 3 pronghorn.
const SETS = {
  // DAY-PLAN look set: the same 10 frames before and after every look, ground and animal change. The sim is paused and stepped a
  // fixed number of ticks (so animals stand in the same places whatever the load), the light and season are held, the UI is hidden.
  // Use with --query "seed=tallgrass" (the default world). tools/look_stats.py compares lk_01 and lk_02 with the concept image.
  look: [
    { name: 'lk_00_setup', eval: `(async () => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      window.__lkPick = (sp, st) => { const c = (st !== undefined ? window.__find(sp, st) : []).concat(window.__find(sp)); return c.length ? c[0] : null; };
      window.__lkFollow = (sp, st, dist, pitch) => { const id = window.__lkPick(sp, st); window.__followId(id); e.cam.setView({ distance: dist, pitchDeg: pitch }); };
      await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 900) || ++n > 240) { clearInterval(t); r(); } }, 500); }); // the sim has finished the 900 stepped ticks (a loaded machine used to capture a still-stepping, snowy early world)
    })()`, wait: 6000 },
    { name: 'lk_02_golden_low', eval: "window.__cam('low')", wait: 3500 },
    { name: 'lk_03_golden_wide', eval: "window.__cam('wide')", wait: 3500 },
    { name: 'lk_04_herd_mid', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 60, pitchDeg: 16 })", wait: 3500 },
    { name: 'lk_05_bison_close', eval: "window.__lkFollow(0, 1, 11, 12)", wait: 4000 },
    { name: 'lk_06_wolves_close', eval: "window.__lkFollow(1, undefined, 13, 14)", wait: 4000 },
    { name: 'lk_07_pronghorn_close', eval: "window.__lkFollow(3, undefined, 12, 12)", wait: 4000 },
    { name: 'lk_08_midday_mid', eval: "window.__followId(null); window.__env({ dayFrac: 0.45 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })", wait: 3500 },
    { name: 'lk_09_night', eval: "window.__env({ dayFrac: 0.95 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 70, pitchDeg: 22 })", wait: 3500 },
    { name: 'lk_10_winter_mid', eval: "window.__env({ season: 3.4, dayFrac: 0.42, warmth: 0.1 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })", wait: 4000 },
    // last: __concept() installs a per-frame light hold that outranks __env (found by the r-look builder), so it must come after the others
    { name: 'lk_01_concept', eval: "window.__concept()", wait: 4000 },
  ],
  // r-polish28 chase set: the sim steps (paused between steps) until a land hunter is in a chase with a target ahead of it, then the camera follows
  // it with the player's follow (the same frame the F key gives). ch_01 right after the cut, ch_02 and ch_03 a few ticks on.
  chase: [
    { name: 'ch_00_setup', eval: `(async () => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const sp = await import('/src/sim/species.ts');
      window.__findPrey = (A, count, kp) => {
        const op = kp * 12, s = A[op], px = A[op + 1], py = A[op + 2], hx = Math.cos(A[op + 3]), hy = Math.sin(A[op + 3]);
        let best = -1, bd = Infinity;
        for (let j = 0; j < count; j++) {
          if (j === kp) continue;
          const o = j * 12;
          if (sp.SPECIES[A[o]]?.flies || !sp.canHunt(s, A[o])) continue;
          const dx = A[o + 1] - px, dy = A[o + 2] - py, d = Math.hypot(dx, dy);
          if (d > 55 || d < 0.01) continue;
          if ((dx * hx + dy * hy) / d < 0.3) continue;
          const st = A[o + 7], running = st === 4 || st === 3 || st === 5;
          const dd = d + (running ? 0 : 25);
          if (dd < bd) { bd = dd; best = j; }
        }
        return best;
      };
      await wait(6000);
      let found = null, tries = 0;
      while (!found && tries++ < 80) {
        const c = window.__find(1, 5).concat(window.__find(5, 5), window.__find(6, 5));
        // (a hunter with a target the game itself would film it with: the same nearest-ahead rule as findChasePrey, page side, so before and after agree)
        const sn = window.__snap(), A = sn.agents;
        for (const id of c) {
          const k = Array.from(sn.ids).indexOf(id), j = window.__findPrey(A, sn.count, k);
          if (j >= 0) { found = id; window.__preyOf = sn.ids[j]; break; }
        }
        if (!found) { window.__step(25); await wait(900); }
      }
      window.__chaseId = found;
      console.log('chase id', found, 'tries', tries);
    })()`, wait: 3000 },
    { name: 'ch_01_follow', eval: "window.__chaseId !== null && window.__followId(window.__chaseId)", wait: 4500 },
    { name: 'ch_02_later', eval: "window.__step(8)", wait: 3000 },
    { name: 'ch_03_later', eval: "window.__step(8)", wait: 3000 },
  ],
  // r-polish28: how much of a real chase the follow camera keeps in frame. Follows a chasing hunter at 1x for 14 s and, 10 times a second while the
  // hunter is still in a chase and its target (found page-side: the nearest hoofed animal ahead) is alive, records whether hunter and target are
  // each inside the picture. Printed as '[page error] CHASEMEASURE {...}'.
  chasemeasure: [
    { name: 'cm_00_setup', eval: `(async () => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const sp = await import('/src/sim/species.ts');
      window.__findPrey = (A, count, kp) => {
        const op = kp * 12, s = A[op], px = A[op + 1], py = A[op + 2], hx = Math.cos(A[op + 3]), hy = Math.sin(A[op + 3]);
        let best = -1, bd = Infinity;
        for (let j = 0; j < count; j++) {
          if (j === kp) continue;
          const o = j * 12;
          if (sp.SPECIES[A[o]]?.flies || !sp.canHunt(s, A[o])) continue;
          const dx = A[o + 1] - px, dy = A[o + 2] - py, d = Math.hypot(dx, dy);
          if (d > 55 || d < 0.01) continue;
          if ((dx * hx + dy * hy) / d < 0.3) continue;
          const st = A[o + 7], running = st === 4 || st === 3 || st === 5;
          const dd = d + (running ? 0 : 25);
          if (dd < bd) { bd = dd; best = j; }
        }
        return best;
      };
      await wait(6000);
      let found = null, tries = 0;
      while (!found && tries++ < 80) {
        const c = window.__find(1, 5).concat(window.__find(5, 5), window.__find(6, 5));
        // (a hunter with a target the game itself would film it with: the same nearest-ahead rule as findChasePrey, page side, so before and after agree)
        const sn = window.__snap(), A = sn.agents;
        for (const id of c) {
          const k = Array.from(sn.ids).indexOf(id), j = window.__findPrey(A, sn.count, k);
          if (j >= 0) { found = id; window.__preyOf = sn.ids[j]; break; }
        }
        if (!found) { window.__step(25); await wait(900); }
      }
      window.__chaseId = found; window.__chasePrey = window.__preyOf;
      console.log('chase id', found, 'tries', tries);
    })()`, wait: 3000 },
    { name: 'cm_01_measure', eval: `(async () => {
      const e = window.__engine, V = e.camera.position.constructor;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const vis = (x, y, z) => { const v = new V(x, y, z).project(e.camera); return v.z < 1 && Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.94; };
      const p = new V(), q = new V();
      const T = { trials: 0, settleBoth: 0, settleHunter: 0, live: 0, liveBoth: 0, liveHunter: 0 };
      const rows = [];
      for (let trial = 0; trial < 6; trial++) {
        window.__speed(0); window.__followId(null);
        let id = null, pid = null;
        for (let tries = 0; tries < 70 && id === null; tries++) {
          const sn = window.__snap();
          for (const cand of window.__find(1, 5).concat(window.__find(5, 5), window.__find(6, 5))) {
            const k = Array.from(sn.ids).indexOf(cand), j = window.__findPrey(sn.agents, sn.count, k);
            if (j >= 0) { id = cand; pid = sn.ids[j]; break; }
          }
          if (id === null) { window.__step(30); await wait(900); }
        }
        if (id === null) break;
        T.trials++;
        window.__followId(id);
        await wait(2500);
        if (window.__animals.getPosition(id, p) && window.__animals.getPosition(pid, q)) {
          const a = vis(p.x, p.y + 0.6, p.z), b2 = vis(q.x, q.y + 0.8, q.z);
          if (a && b2) T.settleBoth++; if (a) T.settleHunter++;
          rows.push('settle sep ' + Math.hypot(p.x - q.x, p.z - q.z).toFixed(0) + ' dist ' + e.cam.distance.toFixed(0) + ' hunter ' + a + ' prey ' + b2);
        }
        window.__speed(1);
        for (let t = 0; t < 60; t++) {
          await wait(100);
          const sn = window.__snap(); if (!sn) continue;
          const k = Array.from(sn.ids).indexOf(id), j = Array.from(sn.ids).indexOf(pid);
          if (k < 0 || j < 0 || sn.agents[k * 12 + 7] !== 5) break;
          if (!window.__animals.getPosition(id, p) || !window.__animals.getPosition(pid, q)) continue;
          T.live++;
          const a = vis(p.x, p.y + 0.6, p.z), b2 = vis(q.x, q.y + 0.8, q.z);
          if (a && b2) T.liveBoth++; if (a) T.liveHunter++;
        }
        window.__speed(0);
      }
      console.error('CHASEMEASURE ' + JSON.stringify(T));
      for (const r of rows) console.error('CM ' + r);
    })()`, wait: 500 },
  ],
  // r-polish28 tree set: the golden look (same setup as the look set), then a trunk, a tree and a grove close up. The tree is the tallest one
  // within 160 m of the herd, so every run frames the same one. pl_trunk looks at the trunk base in the low sun; pl_tree the whole tree;
  // pl_grove a stand from a middling height; pl_summer the same tree at midday; pl_night the grove by moonlight.
  trees: [
    { name: 'pl_00_setup', eval: `(async () => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      window.__focusHerd();
      const f = e.cam.getFocus();
      const T = e.world.trees; let best = -1, bh = 0;
      for (let i = 0; i < T.length; i += 4) { if (Math.hypot(T[i] - f.x, T[i + 1] - f.z) < 160 && T[i + 2] > bh) { bh = T[i + 2]; best = i; } }
      window.__tree = best >= 0 ? { x: T[best], z: T[best + 1], h: bh } : { x: f.x, z: f.z, h: 10 };
      window.__tv = (dist, pitch, yaw, up) => e.cam.setView({ x: window.__tree.x, y: window.__tree.z, h: e.cam.groundAt(window.__tree.x, window.__tree.z) + (up ?? 1.2), distance: dist, pitchDeg: pitch, yawDeg: yaw }, true);
      await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 900) || ++n > 240) { clearInterval(t); r(); } }, 500); });
    })()`, wait: 6000 },
    { name: 'pl_01_trunk', eval: "window.__tv(7, 6, 200)", wait: 3500 },
    { name: 'pl_02_tree', eval: "window.__tv(26, 10, 200, window.__tree.h * 0.45)", wait: 3500 },
    { name: 'pl_03_tree_back', eval: "window.__tv(26, 10, 20, window.__tree.h * 0.45)", wait: 3500 },
    { name: 'pl_04_grove', eval: "window.__tv(60, 18, 140, window.__tree.h * 0.4)", wait: 3500 },
    { name: 'pl_05_midday', eval: "window.__env({ dayFrac: 0.45 }); window.__tv(32, 14, 200, window.__tree.h * 0.45)", wait: 3500 },
    { name: 'pl_06_night', eval: "window.__env({ dayFrac: 0.95 }); window.__tv(40, 14, 200, window.__tree.h * 0.4)", wait: 3500 },
    { name: 'pl_07_autumn', eval: "window.__env({ season: 2.2, dayFrac: 0.7 }); window.__tv(40, 12, 200, window.__tree.h * 0.45)", wait: 3500 },
  ],
  // r-look regression set: the lighting cases the look set does not cover. NOTE: in the look set, lk_01's __concept() installs a per-frame
  // env hold (day 0.28, season 1.8) that outranks every later __env() call, so lk_02 to lk_10 all share that dawn light and lk_08 to
  // lk_10 are NOT midday, night and winter. This set never calls __concept, so each step really has the light it names.
  lookreg: [
    { name: 'rg_00_setup', eval: `(async () => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 900) || ++n > 240) { clearInterval(t); r(); } }, 500); }); // the sim has finished the 900 stepped ticks (a loaded machine used to capture a still-stepping, snowy early world)
    })()`, wait: 6000 },
    { name: 'rg_01_dusk_low', eval: "window.__env({ dayFrac: 0.7 }); window.__cam('low')", wait: 3500 },
    { name: 'rg_02_dusk_wide', eval: "window.__cam('wide')", wait: 3500 },
    { name: 'rg_03_dusk_herd', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 60, pitchDeg: 16 })", wait: 3500 },
    { name: 'rg_04_midday_mid', eval: "window.__env({ dayFrac: 0.45 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })", wait: 3500 },
    { name: 'rg_05_midday_wide', eval: "window.__cam('wide')", wait: 3500 },
    { name: 'rg_06_night', eval: "window.__env({ dayFrac: 0.95 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 70, pitchDeg: 22 })", wait: 3500 },
    { name: 'rg_07_winter_mid', eval: "window.__env({ season: 3.4, dayFrac: 0.42, warmth: 0.1 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })", wait: 4000 },
    { name: 'rg_08_winter_dusk', eval: "window.__env({ season: 3.3, dayFrac: 0.7, warmth: 0.1 }); window.__cam('wide')", wait: 4000 },
    { name: 'rg_09_drought_midday', eval: "window.__env({ weather: 2, dayFrac: 0.45 }); window.__cam('wide')", wait: 4000 },
    { name: 'rg_10_autumn_dusk', eval: "window.__env({ season: 2.4, dayFrac: 0.7 }); window.__cam('wide')", wait: 4000 },
    { name: 'rg_11_dawn_wide', eval: "window.__env({ dayFrac: 0.27 }); window.__cam('wide')", wait: 4000 },
    { name: 'rg_13_night_wide', eval: "window.__env({ dayFrac: 0.95 }); window.__cam('wide')", wait: 4000 },
    { name: 'rg_12_rain_midday', eval: "window.__env({ weather: 1, rain: 0.6, dayFrac: 0.45 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })", wait: 5000 },
  ],
  review: [
    { name: '01_opening_herd', eval: 'window.__speed(1); window.__focusHerd()', wait: 3500 },
    { name: '02_wolves_hunting', eval: `(() => { const c = window.__find(1, 5).concat(window.__find(1, 10)).concat(window.__find(1)); const id = c[0]; window.__select(id); window.__followId(id); window.__engine.cam.setView({ distance: 40, pitchDeg: 20 }); })()`, wait: 4000 },
    { name: '03_ravens_kill', eval: `(() => { const r = window.__find(2, 6).concat(window.__find(2)); window.__select(null); window.__followId(r[0]); window.__engine.cam.setView({ distance: 60, pitchDeg: 30 }); })()`, wait: 3500 },
    { name: '04_pronghorn', eval: `(() => { const p = window.__find(3); window.__followId(p[0]); window.__engine.cam.setView({ distance: 70, pitchDeg: 22 }); })()`, wait: 3500 },
    { name: '05_golden_low', eval: "window.__followId(null); window.__timeOfDay(0.7); window.__cam('low')", wait: 4000 },
    { name: '06_evening_wide', eval: "window.__cam('wide')", wait: 3500 },
    { name: '07_night', eval: "window.__timeOfDay(0.95); window.__focusHerd()", wait: 4500 },
    { name: '08_dawn', eval: "window.__timeOfDay(0.27)", wait: 4500 },
    { name: '09_top_map', eval: "window.__cam('top')", wait: 3500 },
    { name: '10_ui_graph_fast', eval: "window.__focusHerd(); window.__speed(100); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))", wait: 9000 },
    { name: '11_overlay_territories', eval: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })); window.__speed(1); window.__timeOfDay(0.62); window.__cam('wide'); window.__overlay.setMode('territory')", wait: 4500 },
  ],
  // R-wideview: deterministic wide, mid and top views (seasons and light held by __env, the sim keeps running underneath) for the
  // landform snow, creek banks, mid-range haze and map-edge checks. Compare the same-named shots before and after a change.
  wideview: [
    { name: 'wv_00_setup', eval: `(() => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.4 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(1); window.__followId(null); window.__env({ season: 1.3, dayFrac: 0.62 }); window.__cam('wide');
    })()`, wait: 3000 },
    { name: 'wv_01_summer_wide', eval: '', wait: 2500 },
    { name: 'wv_02_summer_mid', eval: "window.__engine.cam.setView({ distance: 170, pitchDeg: 26 })", wait: 3000 },
    { name: 'wv_03_summer_top', eval: "window.__cam('top')", wait: 3000 },
    { name: 'wv_04_autumn_wide', eval: "window.__env({ season: 2.4, dayFrac: 0.45 }); window.__cam('wide')", wait: 3000 },
    { name: 'wv_05_winter_wide', eval: "window.__env({ season: 3.5, dayFrac: 0.4 })", wait: 3000 },
    { name: 'wv_06_winter_mid', eval: "window.__engine.cam.setView({ distance: 170, pitchDeg: 26 })", wait: 3000 },
    { name: 'wv_07_winter_top', eval: "window.__cam('top')", wait: 3000 },
    { name: 'wv_08_winter_dusk_wide', eval: "window.__env({ season: 3.3, dayFrac: 0.7 }); window.__cam('wide')", wait: 3000 },
    { name: 'wv_09_winter_night_wide', eval: "window.__env({ season: 3.4, dayFrac: 0.95 })", wait: 3000 },
    { name: 'wv_10_winter_night_top', eval: "window.__cam('top')", wait: 3000 },
  ],
  // R-water2: the far-field look of the creek and ponds (wide, mid, top, graze) in each season and light, UI hidden ('h'). Same views before and after.
  water2: [
    { name: 'w2_00_setup', eval: `(() => {
      const e = window.__engine, w = e.world;
      window.__wv = (t, dist, pitch, rel) => {
        let x, y;
        if (typeof t === 'string') { const q = Number(t.slice(1)) * 4; x = w.ponds[q]; y = w.ponds[q + 1]; }
        else { const n = w.creek.length / 2, k = Math.min(n - 2, Math.max(0, Math.floor(n * t))); x = w.creek[2 * k]; y = w.creek[2 * k + 1]; }
        const L = e.uniforms.lightDir.value;
        const az = Math.atan2(L.x, L.z) * 180 / Math.PI;
        e.cam.setView({ x, y, distance: dist, pitchDeg: pitch, yawDeg: az + 180 + rel }, true);
      };
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.3, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.45 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(1); window.__followId(null); window.__env({ season: 1.3, dayFrac: 0.45 }); window.__cam('wide');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    })()`, wait: 3500 },
    { name: 'w2_01_summer_wide', eval: '', wait: 2500 },
    { name: 'w2_02_summer_mid', eval: "window.__wv(0.45, 190, 30, 60)", wait: 3000 },
    { name: 'w2_03_summer_top', eval: "window.__cam('top')", wait: 3000 },
    { name: 'w2_04_golden_wide', eval: "window.__env({ dayFrac: 0.68 }); window.__cam('wide')", wait: 3000 },
    { name: 'w2_05_dusk_wide', eval: "window.__env({ dayFrac: 0.765 })", wait: 3000 },
    { name: 'w2_06_dusk_mid', eval: "window.__wv(0.45, 190, 24, 40)", wait: 3000 },
    { name: 'w2_07_dawn_wide', eval: "window.__env({ dayFrac: 0.27 }); window.__cam('wide')", wait: 3000 },
    { name: 'w2_08_dawn_top', eval: "window.__cam('top')", wait: 3000 },
    { name: 'w2_09_winter_dusk_wide', eval: "window.__env({ season: 3.3, dayFrac: 0.7, warmth: 0.1 }); window.__cam('wide')", wait: 3000 },
    { name: 'w2_10_winter_mid', eval: "window.__env({ season: 3.3, dayFrac: 0.42, warmth: 0.1 }); window.__wv(0.45, 190, 30, 60)", wait: 3000 },
    { name: 'w2_11_winter_top', eval: "window.__cam('top')", wait: 3000 },
    { name: 'w2_12_pond_wide', eval: "window.__env({ season: 1.3, dayFrac: 0.45 }); window.__wv('p0', 170, 32, 60)", wait: 3000 },
    { name: 'w2_13_pond_dusk', eval: "window.__env({ dayFrac: 0.765 }); window.__wv('p0', 170, 28, 30)", wait: 3000 },
    { name: 'w2_14_pond_top', eval: "window.__env({ dayFrac: 0.45 }); window.__wv('p1', 150, 80, 0)", wait: 3000 },
    { name: 'w2_15_creek_graze', eval: "window.__wv(0.3, 110, 14, 20)", wait: 3000 },
    { name: 'w2_16_night_wide', eval: "window.__env({ dayFrac: 0.95 }); window.__cam('wide')", wait: 3000 },
  ],
  // snow vs calendar: fast-forward through a winter, then drop to 1x and check the ground matches the header's season
  // herd shape: run a few valley-years, then look at the herds from the drone, mid range and above (compare ?p=herdNearest:6)
  herds: [
    { name: 'h0_run', eval: "window.__speed(100); window.__cam('wide')", wait: 20000 },
    { name: 'h1_wide', eval: "window.__speed(1); window.__timeOfDay(0.64); window.__focusHerd(); window.__cam('wide')", wait: 4500 },
    { name: 'h2_herd', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 160, pitchDeg: 32 })", wait: 4000 },
    { name: 'h3_top', eval: "window.__cam('top')", wait: 4000 },
  ],
  // the same views early on, while the herds are big (year 1): a few seconds at 10x so the herd shape forms, then frozen light
  herdsEarly: [
    { name: 'e0_run', eval: "window.__speed(10); window.__cam('wide')", wait: 12000 },
    { name: 'e1_wide', eval: "window.__speed(1); window.__timeOfDay(0.64); window.__focusHerd(); window.__cam('wide')", wait: 4500 },
    { name: 'e2_herd', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 160, pitchDeg: 32 })", wait: 4000 },
    { name: 'e3_top', eval: "window.__timeOfDay(0.5); window.__cam('top')", wait: 4000 },
  ],
  snow: [
    { name: 's1_fast', eval: "window.__speed(100); window.__cam('wide')", wait: 14000 },
    { name: 's2_fast', eval: '', wait: 6000 },
    { name: 's3_slow', eval: "window.__speed(1); window.__timeOfDay(0.62)", wait: 4500 },
    { name: 's4_slow_later', eval: '', wait: 8000 },
  ],
  // herd shape: fast-forward a little, then look down on the biggest herd from two heights
  herd: [
    { name: 'h0_warm', eval: "window.__speed(10)", wait: 20000 },
    { name: 'h1_herd_140', eval: "window.__speed(1); window.__timeOfDay(0.42); window.__focusHerd(); window.__engine.cam.setView({ distance: 140, pitchDeg: 42 })", wait: 4000 },
    { name: 'h2_herd_280', eval: "window.__engine.cam.setView({ distance: 280, pitchDeg: 50 })", wait: 3500 },
  ],
  // map overlays (window.__overlay from src/main.ts), after a fast-forward so packs and grazing patterns exist
  overlays: [
    { name: 'ov_00_warm', eval: "window.__speed(10)", wait: 15000 },
    { name: 'ov_00_midday', eval: "window.__speed(1); window.__timeOfDay(0.45)", wait: 2500 },
    { name: 'ov_01_territory_top', eval: "window.__speed(1); window.__cam('top'); window.__overlay.setMode('territory')", wait: 3500 },
    { name: 'ov_02_territory_wide', eval: "window.__cam('wide')", wait: 3500 },
    { name: 'ov_03_vegetation', eval: "window.__cam('top'); window.__overlay.setMode('vegetation')", wait: 3500 },
    { name: 'ov_04_fear', eval: "window.__overlay.setMode('fear')", wait: 3000 },
    { name: 'ov_05_traits', eval: "window.__overlay.setMode('traits')", wait: 3000 },
    { name: 'ov_06_traits_wide', eval: "window.__cam('wide')", wait: 3000 },
  ],
  // a summer storm held by the same __env hook as the seasons set: drone, map view and an in-between pitch (rain streaks fade when looking down)
  rain: [
    { name: 'r0_setup', eval: `(() => {
      const e = window.__engine;
      window.__envO = { season: 1.2, weather: 3, warmth: 0.7, rain: 0.6, dayFrac: 0.4 };
      window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow(); window.__speed(1); window.__followId(null); window.__cam('wide');
    })()`, wait: 3500 },
    { name: 'r1_storm_wide', eval: '', wait: 1500 },
    { name: 'r2_storm_45deg', eval: "window.__engine.cam.setView({ pitchDeg: 48, distance: 400 })", wait: 3500 },
    { name: 'r3_storm_top', eval: "window.__cam('top')", wait: 3500 },
  ],
  // seasons and weather held by window.__env (the sim keeps running underneath): the same wide valley through the year (snowpack and
  // leaf-out), a bare-to-leafy tree row, rain early and late, and night. Each shot is lit and dressed as asked.
  seasons: [
    { name: 'se_00_setup', eval: `(() => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.4 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(1); window.__followId(null); window.__env({ season: 3.05, dayFrac: 0.4 }); window.__cam('wide');
    })()`, wait: 2500 },
    { name: 'se_01_early_winter', eval: "window.__env({ season: 3.2, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_02_mid_winter', eval: "window.__env({ season: 3.5, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_03_late_winter', eval: "window.__env({ season: 3.8, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_04_early_spring', eval: "window.__env({ season: 0.2, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_05_late_spring', eval: "window.__env({ season: 0.8, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_06_rain_wide', eval: "window.__env({ season: 0.6, dayFrac: 0.4, weather: 1, rain: 0.1 })", wait: 3500 },
    { name: 'se_07_rain_low', eval: "window.__cam('low')", wait: 2500 },
    { name: 'se_08_storm_wide', eval: "window.__cam('wide'); window.__env({ season: 1.2, dayFrac: 0.4, weather: 3, rain: 0.6 })", wait: 3500 },
    { name: 'se_09_night_wide', eval: "window.__env({ season: 1.0, dayFrac: 0.95, weather: 0 })", wait: 3000 },
    { name: 'se_10_night_low', eval: "window.__cam('low')", wait: 2500 },
    { name: 'se_11_winter_night', eval: "window.__cam('wide'); window.__env({ season: 3.5, dayFrac: 0.95, weather: 0 })", wait: 3000 },
  ],
  // water close-ups: the creek and a pond at golden hour, midday from above, dusk, night and in winter.
  // __wv(target, distance, pitchDeg, yawFromLightDeg): orbit a creek point (fraction 0..1 along it) or a pond ('p0'..'p2'), with
  // yaw measured from looking straight into the key light (0 = facing the sun or moon).
  // __env({ dayFrac, season, weather, warmth }): hold the rendered time of day and season (the sim keeps running underneath), so
  // every shot is lit as asked instead of drifting through the valley's short year.
  water: [
    { name: 'wa_00_setup', eval: `(() => {
      const e = window.__engine, w = e.world;
      window.__wv = (t, dist, pitch, rel) => {
        let x, y;
        if (typeof t === 'string') { const q = Number(t.slice(1)) * 4; x = w.ponds[q]; y = w.ponds[q + 1]; }
        else { const n = w.creek.length / 2, k = Math.min(n - 2, Math.max(0, Math.floor(n * t))); x = w.creek[2 * k]; y = w.creek[2 * k + 1]; }
        const L = e.uniforms.lightDir.value;
        const az = Math.atan2(L.x, L.z) * 180 / Math.PI;
        e.cam.setView({ x, y, distance: dist, pitchDeg: pitch, yawDeg: az + 180 + rel }, true);
      };
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(1); window.__followId(null); window.__env({ dayFrac: 0.71 });
    })()`, wait: 2500 },
    { name: 'wa_01_golden_creek', eval: 'window.__wv(0.32, 95, 26, 20)', wait: 3000 },
    { name: 'wa_02_golden_creek_low', eval: 'window.__wv(0.62, 45, 13, 30)', wait: 3000 },
    { name: 'wa_03_golden_creek_close', eval: 'window.__wv(0.5, 24, 34, 70)', wait: 3000 },
    { name: 'wa_04_golden_pond', eval: "window.__wv('p0', 60, 24, 30)", wait: 3000 },
    { name: 'wa_05_golden_pond_away', eval: "window.__wv('p1', 55, 32, 160)", wait: 3000 },
    { name: 'wa_06_noon_creek_above', eval: "window.__env({ dayFrac: 0.5 }); window.__wv(0.6, 42, 64, 90)", wait: 3000 },
    { name: 'wa_07_noon_pond_above', eval: "window.__wv('p0', 52, 62, 90)", wait: 3000 },
    { name: 'wa_08_dusk_creek', eval: "window.__env({ dayFrac: 0.772 }); window.__wv(0.32, 80, 16, 15)", wait: 3000 },
    { name: 'wa_09_night_creek', eval: "window.__env({ dayFrac: 0.95 }); window.__wv(0.32, 70, 20, 8)", wait: 3000 },
    { name: 'wa_10_night_pond', eval: "window.__wv('p0', 55, 22, 5)", wait: 3000 },
    { name: 'wa_11_winter_creek', eval: "window.__env({ dayFrac: 0.42, season: 3.05, weather: 0, warmth: 0.1 }); window.__wv(0.5, 50, 30, 40)", wait: 3000 },
    { name: 'wa_12_winter_pond', eval: "window.__wv('p0', 55, 34, 40)", wait: 3000 },
    { name: 'wa_13_winter_snow_creek', eval: "window.__env({ dayFrac: 0.42, season: 3.05, weather: 4, warmth: 0.1 }); window.__wv(0.62, 50, 30, 40)", wait: 3000 },
    { name: 'wa_14_winter_snow_pond', eval: "window.__wv('p1', 55, 34, 40)", wait: 3000 },
  ],
};

// r-trees3: cottonwood trees under real light, in a grove (the densest cluster of valley trees), by season. Run once without and once with
// ?trees3=1 in --query and compare the same-named frames. t3_00_setup defines window.__grove(k, dist, pitch, relYaw) (k-th densest grove).
SETS.trees3 = [
  { name: 't3_00_setup', eval: `(() => {
    const e = window.__engine, w = e.world;
    window.__env = (o) => {
      window.__envO = Object.assign({ season: 1.3, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
      if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow();
    };
    const T = w.trees, n = T.length / 4, dens = [];
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = 0; j < n; j++) if (j !== i && Math.hypot(T[i * 4] - T[j * 4], T[i * 4 + 1] - T[j * 4 + 1]) < 30) c++;
      dens.push([c, i]);
    }
    dens.sort((a, b) => b[0] - a[0]);
    // spread the picks: skip trees within 90 m of an earlier pick
    const picks = [];
    for (const [c, i] of dens) { if (picks.every((p) => Math.hypot(T[p * 4] - T[i * 4], T[p * 4 + 1] - T[i * 4 + 1]) > 90)) picks.push(i); if (picks.length >= 4) break; }
    window.__picks = picks;
    window.__grove = (k, dist, pitch, rel) => {
      const i = picks[k], L = e.uniforms.lightDir.value;
      const az = Math.atan2(L.x, L.z) * 180 / Math.PI;
      e.cam.setView({ x: T[i * 4], y: T[i * 4 + 1], distance: dist, pitchDeg: pitch, yawDeg: az + 180 + rel }, true);
    };
    window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
  })()`, wait: 6000 },
  { name: 't3_01_grove_close', eval: "window.__grove(0, 24, 9, 35)", wait: 4500 },
  { name: 't3_02_grove_mid', eval: "window.__grove(0, 62, 16, 35)", wait: 4000 },
  { name: 't3_03_grove_wide', eval: "window.__grove(0, 150, 24, 35)", wait: 4000 },
  { name: 't3_04_golden_low', eval: "window.__cam('low')", wait: 4000 },
  { name: 't3_05_midday_close', eval: "window.__env({ dayFrac: 0.45 }); window.__grove(1, 26, 12, 20)", wait: 4500 },
  { name: 't3_06_midday_mid', eval: "window.__grove(1, 80, 20, 20)", wait: 4000 },
  { name: 't3_07_autumn_mid', eval: "window.__env({ season: 2.4, dayFrac: 0.6 }); window.__grove(0, 62, 16, 35)", wait: 4000 },
  { name: 't3_08_autumn_wide', eval: "window.__cam('wide')", wait: 4000 },
  { name: 't3_09_winter_close', eval: "window.__env({ season: 3.5, dayFrac: 0.42, warmth: 0.1 }); window.__grove(0, 26, 10, 35)", wait: 4500 },
  { name: 't3_10_winter_mid', eval: "window.__grove(0, 90, 20, 35)", wait: 4000 },
  { name: 't3_11_winter_wide', eval: "window.__engine.cam.setView({ distance: 170, pitchDeg: 26 })", wait: 4000 },
  { name: 't3_12_winter_dusk_wide', eval: "window.__env({ season: 3.3, dayFrac: 0.7, warmth: 0.1 }); window.__cam('wide')", wait: 4000 },
  { name: 't3_13_snags_close', eval: "(() => { const e = window.__engine, T = e.world.trees, c = window.__picks[2]; for (let j = 0; j < T.length / 4; j++) if (Math.hypot(T[j * 4] - T[c * 4], T[j * 4 + 1] - T[c * 4 + 1]) < 16 && j % 2 === 0) e.trees.updateTree(j, { burned: true }); window.__env({ season: 1.3, dayFrac: 0.6 }); window.__grove(2, 30, 10, 35); })()", wait: 4500 },
];

// r-nightwater: night readability (herd at 20 to 90 m, wide, low) and water (pond and creek at golden hour, midday, wide, dusk, night).
// Sim paused after 900 stepped ticks so animals stand in the same places; light held by __env. __wv(target, dist, pitch, yawFromLight).
SETS.nw = [
  { name: 'nw_00_setup', eval: `(async () => {
    const e = window.__engine, w = e.world;
    window.__env = (o) => {
      window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
      if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow();
    };
    window.__wv = (t, dist, pitch, rel) => {
      let x, y;
      if (typeof t === 'string') { const q = Number(t.slice(1)) * 4; x = w.ponds[q]; y = w.ponds[q + 1]; }
      else { const n = w.creek.length / 2, k = Math.min(n - 2, Math.max(0, Math.floor(n * t))); x = w.creek[2 * k]; y = w.creek[2 * k + 1]; }
      const L = e.uniforms.lightDir.value;
      const az = Math.atan2(L.x, L.z) * 180 / Math.PI;
      e.cam.setView({ x, y, distance: dist, pitchDeg: pitch, yawDeg: az + 180 + rel }, true);
    };
    window.__lkPick = (sp, st) => { const c = (st !== undefined ? window.__find(sp, st) : []).concat(window.__find(sp)); return c.length ? c[0] : null; };
    window.__lkFollow = (sp, st, dist, pitch) => { const id = window.__lkPick(sp, st); window.__followId(id); e.cam.setView({ distance: dist, pitchDeg: pitch }); };
    window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 900) || ++n > 240) { clearInterval(t); r(); } }, 500); });
  })()`, wait: 6000 },
  { name: 'nw_01_night_wide', eval: "window.__env({ dayFrac: 0.95 }); window.__cam('wide')", wait: 4000 },
  { name: 'nw_02_night_mid90', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 22 })", wait: 3500 },
  { name: 'nw_03_night_herd60', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 60, pitchDeg: 16 })", wait: 3500 },
  { name: 'nw_04_night_herd35', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 35, pitchDeg: 14 })", wait: 3500 },
  { name: 'nw_05_night_close', eval: "window.__lkFollow(0, 1, 14, 12)", wait: 4000 },
  { name: 'nw_06_night_wolves', eval: "window.__lkFollow(1, undefined, 16, 14)", wait: 4000 },
  { name: 'nw_07_night_low', eval: "window.__followId(null); window.__cam('low')", wait: 3500 },
  { name: 'nw_08_night_creek', eval: "window.__wv(0.32, 70, 20, 8)", wait: 3000 },
  { name: 'nw_09_night_pond', eval: "window.__wv('p0', 55, 22, 5)", wait: 3000 },
  { name: 'nw_10_golden_pond', eval: "window.__env({ dayFrac: 0.71 }); window.__wv('p0', 60, 24, 30)", wait: 3000 },
  { name: 'nw_11_golden_creek', eval: "window.__wv(0.32, 95, 26, 20)", wait: 3000 },
  { name: 'nw_12_golden_pond_wide', eval: "window.__wv('p0', 170, 28, 40)", wait: 3000 },
  { name: 'nw_13_golden_creek_wide', eval: "window.__wv(0.45, 190, 28, 40)", wait: 3000 },
  { name: 'nw_14_midday_pond', eval: "window.__env({ dayFrac: 0.45 }); window.__wv('p0', 60, 30, 50)", wait: 3000 },
  { name: 'nw_15_midday_creek', eval: "window.__wv(0.6, 80, 28, 50)", wait: 3000 },
  { name: 'nw_16_midday_wide', eval: "window.__cam('wide')", wait: 3000 },
  { name: 'nw_17_dusk_pond', eval: "window.__env({ dayFrac: 0.77 }); window.__wv('p0', 90, 20, 20)", wait: 3000 },
  { name: 'nw_18_day_wide', eval: "window.__env({ dayFrac: 0.62 }); window.__cam('wide')", wait: 3000 },
];

// r-read: the species at the distances a viewer leaves running (80, 140, 200 m), over the spot with the most bison, pronghorn and a wolf
// together. __rdRig(dist, pitch) frames the best mixed group (a wolf with bison and pronghorn within 90 m); the rd_a frames at the same
// distances are over an open herd without the wolf. Same fixed-tick setup as the look set so before and after show the same animals.
SETS.read = [
  { name: 'rd_00_setup', eval: `(async () => {
    const e = window.__engine;
    window.__env = (o) => {
      window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
      if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow();
    };
    window.__speed(0); await new Promise((r) => setTimeout(r, 1200)); window.__step(Math.max(0, 1200 - window.__snap().tick)); window.__followId(null); window.__env({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    window.__rdRig = (dist, pitch, R) => {
      // centre on the wolf with the most bison and pronghorn round it (within 60 m), so a wolf, bison and pronghorn share the frame
      const sn = window.__snap(), A = sn.agents, n = sn.count, r = R || 60;
      const P = { 0: [], 1: [], 3: [], 6: [], 10: [] };
      for (let k = 0; k < n; k++) { const o = k * 12, s = A[o]; if (P[s]) P[s].push([A[o + 1], A[o + 2]]); }
      let best = null, bs = -1;
      for (const w of P[1]) {
        const c = (L) => L.reduce((a, q) => a + (Math.hypot(q[0] - w[0], q[1] - w[1]) < r ? 1 : 0), 0);
        const b = c(P[0]), p = c(P[3]);
        const sc = Math.min(b, 12) * Math.min(p, 12) + 0.1 * (b + p);
        if (sc > bs) { bs = sc; best = [w[0], w[1], b, p]; }
      }
      if (!best) return null;
      window.__cam('wide');
      e.cam.setView({ x: best[0], y: best[1], distance: dist, pitchDeg: pitch }, true);
      window.__rdBest = best;
      return best;
    };
    // follow the animal of species sp with the most of its own kind within 40 m (a herd or a pack), at the given distance and pitch
    window.__rdFollow = (sp, dist, pitch) => {
      // frame (without following) the animal of species sp with the most of its own kind within 40 m, preferring open ground (few trees within 25 m)
      const sn = window.__snap(), A = sn.agents, n = sn.count, P = [], T = e.world.trees;
      for (let k = 0; k < n; k++) if (A[k * 12] === sp) P.push([k, A[k * 12 + 1], A[k * 12 + 2]]);
      let best = -1, bs = -1e9;
      for (const p of P) {
        let c = 0, tr = 0;
        for (const q of P) if (Math.hypot(p[1] - q[1], p[2] - q[2]) < 40) c++;
        for (let i = 0; i < T.length; i += 4) if (Math.hypot(T[i] - p[1], T[i + 1] - p[2]) < 25) tr++;
        const s = Math.min(c, 8) - 2 * tr;
        if (s > bs) { bs = s; best = p[0]; }
      }
      if (best < 0) return null;
      window.__followId(null);
      window.__cam('wide');
      e.cam.setView({ x: A[best * 12 + 1], y: A[best * 12 + 2], distance: dist, pitchDeg: pitch }, true);
      return [best, bs];
    };
    // a kill: the freshest carcass (most meat left), framed from dist
    window.__rdKill = (dist, pitch) => {
      const sn = window.__snap(), C = sn.carcasses, n = sn.carcassCount;
      let best = -1, br = -1;
      for (let k = 0; k < n; k++) if (C[k * 4 + 2] > br) { br = C[k * 4 + 2]; best = k; }
      if (best < 0) return null;
      window.__followId(null);
      window.__cam('wide');
      e.cam.setView({ x: C[best * 4], y: C[best * 4 + 1], distance: dist, pitchDeg: pitch }, true);
      return [C[best * 4], C[best * 4 + 1], br, n];
    };
    await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 1200) || ++n > 240) { clearInterval(t); r(); } }, 500); })
    console.error('rig', JSON.stringify(window.__rdRig(140, 26)));
  })()`, wait: 6000 },
  { name: 'rd_80', eval: "window.__rdRig(80, 24)", wait: 3500 },
  { name: 'rd_140', eval: "window.__rdRig(140, 26)", wait: 3500 },
  { name: 'rd_200', eval: "window.__rdRig(200, 28)", wait: 3500 },
  { name: 'rd_80_mid', eval: "window.__env({ dayFrac: 0.45 }); window.__rdRig(80, 24)", wait: 3500 },
  { name: 'rd_140_mid', eval: "window.__rdRig(140, 26)", wait: 3500 },
  { name: 'rd_200_mid', eval: "window.__rdRig(200, 28)", wait: 3500 },
  { name: 'rf_pron_140', eval: "window.__env({}); window.__rdFollow(3, 140, 26)", wait: 4500 },
  { name: 'rf_pron_200', eval: "window.__rdFollow(3, 200, 28)", wait: 4000 },
  { name: 'rf_wolf_80', eval: "window.__rdFollow(1, 80, 24)", wait: 4500 },
  { name: 'rf_wolf_140', eval: "window.__rdFollow(1, 140, 26)", wait: 4000 },
  { name: 'rf_wolf_200', eval: "window.__rdFollow(1, 200, 28)", wait: 4000 },
  { name: 'rf_coy_140', eval: "window.__rdFollow(6, 140, 26)", wait: 4500 },
  { name: 'rf_bison_140', eval: "window.__rdFollow(0, 140, 26)", wait: 4500 },
  { name: 'rf_bison_200', eval: "window.__rdFollow(0, 200, 28)", wait: 4000 },
  { name: 'rf_deer_140', eval: "window.__rdFollow(10, 140, 26)", wait: 4500 },
  { name: 'rf_kill_140', eval: "console.error('kill', JSON.stringify(window.__rdKill(140, 26)))", wait: 3500 },
  { name: 'rf_kill_200', eval: "window.__rdKill(200, 28)", wait: 3500 },
  { name: 'rf_kill_300', eval: "window.__rdKill(300, 30)", wait: 3500 },
  { name: 'rd_140_winter', eval: "window.__env({ season: 3.4, dayFrac: 0.42, warmth: 0.1 }); window.__rdRig(140, 26)", wait: 4000 },
];

// r-ravens: ravens at a carcass. rv_00_setup steps the sim until a carcass has ravens feeding on it (state 6 within 6 m), then __rvRig(dist, pitch)
// frames it. Close-ups run at 1x (the ravens hop and peck), overviews are held (speed 0) so before and after show the same birds.
SETS.ravens = [
  { name: 'rv_00_setup', eval: `(async () => {
    const e = window.__engine;
    window.__env = (o) => {
      window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.45 }, o);
      if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow();
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__speed(0); await wait(1200); window.__step(Math.max(0, 1200 - window.__snap().tick)); window.__followId(null); window.__env({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    window.__rvScan = () => {
      const sn = window.__snap(), A = sn.agents, n = sn.count, C = sn.carcasses, nc = sn.carcassCount;
      let best = -1, bs = 0, bg = 0;
      for (let k = 0; k < nc; k++) {
        let c = 0, g = 0;
        for (let j = 0; j < n; j++) { const o = j * 12; if (A[o] !== 2) continue; const d = Math.hypot(A[o + 1] - C[k * 4], A[o + 2] - C[k * 4 + 1]); if (d < 6 && A[o + 7] === 6) g++; if (d < 25) c++; }
        const s = g * 10 + c;
        if (s > bs) { bs = s; best = k; bg = g; }
      }
      return best < 0 ? null : { k: best, x: C[best * 4], y: C[best * 4 + 1], rem: C[best * 4 + 2], grounded: bg, score: bs };
    };
    window.__rvRig = (dist, pitch) => {
      const r = window.__rvScan(); if (!r) return window.__rvPin ? (e.cam.setView({ x: window.__rvPin.x, y: window.__rvPin.y, distance: dist, pitchDeg: pitch }, true), window.__rvPin) : null;
      window.__rvPin = window.__rvPin || r;
      window.__followId(null); window.__cam('wide');
      const q = window.__rvPin;
      e.cam.setView({ x: q.x, y: q.y, distance: dist, pitchDeg: pitch }, true);
      return q;
    };
    // the densest sky of ravens that are not at a kill site (a carcass with 2 or more ravens eating; most ravens within 70 m): where the overview swarm is worst
    window.__rvSky = (dist, pitch) => {
      const sn = window.__snap(), A = sn.agents, n = sn.count, C = sn.carcasses, nc = sn.carcassCount;
      const P = [], R = [], E = [], S = [];
      for (let j = 0; j < n; j++) { const o = j * 12; if (A[o] === 2) { R.push([A[o + 1], A[o + 2]]); if (A[o + 7] === 6) E.push([A[o + 1], A[o + 2]]); } }
      for (let k = 0; k < nc; k++) { if (C[k * 4 + 2] < 0.08) continue; let w = 0; for (const q of E) if (Math.hypot(q[0] - C[k * 4], q[1] - C[k * 4 + 1]) < 7) w++; if (w >= 2) S.push([C[k * 4], C[k * 4 + 1]]); }
      window.__rvSites = S;
      for (const q of R) if (!S.some((s) => Math.hypot(q[0] - s[0], q[1] - s[1]) < 28)) P.push(q);
      let best = null, bs = -1;
      for (const p of P) { let c = 0; for (const q of P) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 70) c++; if (c > bs) { bs = c; best = p; } }
      if (!best) return { none: true, ravens: Array.from({ length: n }).filter((_, j) => A[j * 12] === 2).length, carcasses: nc };
      window.__followId(null); window.__cam('wide');
      e.cam.setView({ x: best[0], y: best[1], distance: dist, pitchDeg: pitch }, true);
      return { x: best[0], y: best[1], near: bs, free: P.length, sites: S.length, ravens: R.length };
    };
    await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 1200) || ++n > 240) { clearInterval(t); r(); } }, 500); });
    let found = window.__rvScan(), tries = 0;
    while ((!found || found.grounded < 2) && tries++ < 120) { window.__step(60); await wait(700); found = window.__rvScan(); }
    console.error('rv rig', tries, JSON.stringify(found));
  })()`, wait: 4000 },
  // the sim is paused at a fixed tick here, so before and after show the same birds: the wide default view, and the herd from 150 and 220 m
  { name: 'rv_stat', eval: "(() => { const sn = window.__snap(), C = sn.carcasses, nc = sn.carcassCount, A = sn.agents; const rem = []; for (let k = 0; k < nc; k++) rem.push(+C[k * 4 + 2].toFixed(2)); rem.sort((a, b) => a - b); const bins = [0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.01].map((t) => rem.filter((r) => r < t).length); const near = (th) => { let c = 0, tot = 0, grd = 0; for (let j = 0; j < sn.count; j++) { const o = j * 12; if (A[o] !== 2) continue; tot++; if (A[o + 7] === 6) grd++; let d = 1e9; for (let k = 0; k < nc; k++) if (C[k * 4 + 2] >= th) d = Math.min(d, Math.hypot(A[o + 1] - C[k * 4], A[o + 2] - C[k * 4 + 1])); if (d < 40) c++; } return [tot, grd, c]; }; console.error('stat rem<0.02,.05,.1,.2,.4,.7,1', JSON.stringify(bins), 'ravens/eating/near40 by rem>=0,.05,.1,.2', JSON.stringify([near(0), near(0.05), near(0.1), near(0.2)])); })()", wait: 100 },
  { name: 'rv_s1_120', eval: "window.__speed(0); console.error('sky', JSON.stringify(window.__rvSky(120, 24)))", wait: 3500 },
  { name: 'rv_s2_200', eval: "window.__rvSky(200, 28)", wait: 3500 },
  { name: 'rv_s3_150', eval: "window.__rvSky(150, 18)", wait: 3500 },
  { name: 'rv_w1_wide', eval: "window.__speed(0); window.__followId(null); window.__cam('wide')", wait: 3500 },
  { name: 'rv_w2_150', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 150, pitchDeg: 30 }, true)", wait: 3500 },
  { name: 'rv_w3_220', eval: "window.__engine.cam.setView({ distance: 220, pitchDeg: 35 }, true)", wait: 3500 },
  { name: 'rv_w4_top', eval: "window.__cam('top')", wait: 3500 },
  // one standing raven, from 2.4 m out: its folded wings, feet and beak at the ground (the sim is held, so the bird stays put; only the beat of the pecking runs)
  { name: 'rv_p1', eval: "window.__speed(0); (() => { const r = window.__find(2, 6); window.__select(null); window.__followId(r[Math.min(1, r.length - 1)]); window.__engine.cam.setView({ distance: 2.4, pitchDeg: 9 }, true); })()", wait: 2500 },
  { name: 'rv_p2', eval: "window.__engine.cam.setView({ distance: 2.4, pitchDeg: 9, yawDeg: 90 }, true)", wait: 1200 },
  { name: 'rv_p3', eval: "window.__engine.cam.setView({ distance: 2.4, pitchDeg: 9, yawDeg: 180 }, true)", wait: 1200 },
  { name: 'rv_p4', eval: "window.__engine.cam.setView({ distance: 3.2, pitchDeg: 35, yawDeg: 45 }, true)", wait: 1200 },
  { name: 'rv_o120', eval: "window.__speed(0); console.error('rig', JSON.stringify(window.__rvRig(120, 26)))", wait: 3500 },
  { name: 'rv_o200', eval: "window.__rvRig(200, 28)", wait: 3500 },
  { name: 'rv_o160', eval: "window.__rvRig(160, 27)", wait: 3500 },
  { name: 'rv_o100', eval: "window.__rvRig(100, 25)", wait: 3500 },
  { name: 'rv_o250', eval: "window.__rvRig(250, 30)", wait: 3500 },
  { name: 'rv_c1', eval: "window.__speed(1); console.error('rig', JSON.stringify(window.__rvRig(9, 22)))", wait: 3000 },
  { name: 'rv_c2', eval: "", wait: 1400 },
  { name: 'rv_c3', eval: "", wait: 1400 },
  { name: 'rv_c4', eval: "", wait: 1400 },
  { name: 'rv_c5', eval: "console.error('rig', JSON.stringify(window.__rvRig(6, 14)))", wait: 3000 },
  { name: 'rv_c6', eval: "", wait: 1400 },
  { name: 'rv_c7', eval: "", wait: 1400 },
  // low and close on the carcass (a side view at the ravens' feet): where the wings and the feet meet the ground and the carcass
  { name: 'rv_f1', eval: "window.__speed(1); window.__rvRig(5, 6)", wait: 2500 },
  { name: 'rv_f1b', eval: "(() => { const sn = window.__snap(), A = sn.agents, r = window.__rvScan(); const o = []; for (let j = 0; j < sn.count; j++) { const q = j * 12; if (A[q] !== 2) continue; const d = Math.hypot(A[q + 1] - r.x, A[q + 2] - r.y); if (d < 8) o.push([sn.ids[j], +d.toFixed(1), A[q + 7], +A[q + 9].toFixed(2), +A[q + 4].toFixed(2)]); } console.error('ravens', JSON.stringify(o)); })()", wait: 100 },
  { name: 'rv_f2', eval: "", wait: 700 },
  { name: 'rv_g1', eval: "", wait: 350 },
  { name: 'rv_g2', eval: "", wait: 350 },
  { name: 'rv_g3', eval: "", wait: 350 },
  { name: 'rv_g4', eval: "", wait: 350 },
  { name: 'rv_g5', eval: "", wait: 350 },
  { name: 'rv_g6', eval: "", wait: 350 },
  { name: 'rv_g7', eval: "", wait: 350 },
  { name: 'rv_g8', eval: "", wait: 350 },
  { name: 'rv_g9', eval: "", wait: 350 },
  { name: 'rv_g10', eval: "", wait: 350 },
  { name: 'rv_g11', eval: "", wait: 350 },
  { name: 'rv_g12', eval: "", wait: 350 },
  { name: 'rv_f3', eval: "", wait: 700 },
  { name: 'rv_f4', eval: "", wait: 700 },
  { name: 'rv_f5', eval: "", wait: 700 },
  { name: 'rv_f6', eval: "", wait: 700 },
  { name: 'rv_f7', eval: "", wait: 700 },
  { name: 'rv_f8', eval: "", wait: 700 },
];

// r-ravens2: a close look at a raven's form: one flying bird followed at 5 to 14 m from the side, below and above (the sim is held: the wings still beat),
// then the carcass with the wolves and the ravens flying over them, and the overview marks. Reuses the setup of the ravens set.
SETS.ravenlook = [
  SETS.ravens[0],
  { name: 'rl_a_side', eval: "window.__speed(0); (() => { const r = window.__find(2, 9); window.__select(null); window.__followId(r[0]); window.__engine.cam.setView({ distance: 7, pitchDeg: 4, yawDeg: 90 }, true); })()", wait: 2200 },
  { name: 'rl_b_front', eval: "window.__engine.cam.setView({ distance: 7, pitchDeg: 6, yawDeg: 0 }, true)", wait: 1500 },
  { name: 'rl_c_below', eval: "window.__engine.cam.setView({ distance: 9, pitchDeg: -25, yawDeg: 60 }, true)", wait: 1500 },
  { name: 'rl_d_above', eval: "window.__engine.cam.setView({ distance: 9, pitchDeg: 40, yawDeg: 120 }, true)", wait: 1500 },
  { name: 'rl_e_back', eval: "window.__engine.cam.setView({ distance: 12, pitchDeg: 10, yawDeg: 200 }, true)", wait: 1500 },
  { name: 'rl_f_mid', eval: "window.__engine.cam.setView({ distance: 20, pitchDeg: 12, yawDeg: 70 }, true)", wait: 1500 },
  { name: 'rl_g_ground', eval: "(() => { const r = window.__find(2, 6); window.__followId(r[0]); window.__engine.cam.setView({ distance: 3, pitchDeg: 8, yawDeg: 60 }, true); })()", wait: 2000 },
  { name: 'rl_h_kill12', eval: "window.__speed(1); window.__rvRig(12, 24)", wait: 3000 },
  { name: 'rl_i_kill12b', eval: "", wait: 1500 },
  { name: 'rl_j_kill12c', eval: "", wait: 1500 },
  { name: 'rl_k_kill18', eval: "window.__rvRig(18, 20)", wait: 2500 },
  { name: 'rl_l_kill18b', eval: "", wait: 1500 },
  // wolves feeding at a kill with ravens round them: follow the feeder from 9 m and 5 m (1x, so the ravens fly in and land)
  { name: 'rl_w0', eval: `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const scan = () => { const sn = window.__snap(), A = sn.agents, n = sn.count; const W = [], R = []; for (let j = 0; j < n; j++) { const o = j * 12; if (A[o] === 1 && A[o + 7] === 6) W.push(sn.ids[j]); if (A[o] === 2) R.push([A[o + 1], A[o + 2]]); } let best = null, bs = 0; for (const id of W) { const j = sn.ids.indexOf(id), o = j * 12; let c = 0; for (const q of R) if (Math.hypot(q[0] - A[o + 1], q[1] - A[o + 2]) < 12) c++; if (c >= bs) { bs = c; best = id; } } return best === null ? null : { id: best, ravens: bs, wolves: W.length }; };
    window.__speed(0); let f = scan(), tries = 0;
    while ((!f || f.ravens < 2) && tries++ < 260) { window.__step(30); await wait(500); f = scan(); }
    if (f) { const sn = window.__snap(), j = sn.ids.indexOf(f.id); window.__rvWolf = { x: sn.agents[j * 12 + 1], y: sn.agents[j * 12 + 2] }; } console.error('wolf feeders', tries, JSON.stringify(f));
  })()`, wait: 500 },
  { name: 'rl_w1', eval: "window.__speed(0); window.__select(null); window.__rvPin = window.__rvWolf; console.error('rig', JSON.stringify(window.__rvRig(9, 26)))", wait: 3000 },
  { name: 'rl_w2', eval: "window.__rvRig(6, 18)", wait: 3000 },
  { name: 'rl_w3', eval: "window.__rvRig(14, 32)", wait: 3000 },
  { name: 'rl_w4', eval: "window.__rvRig(5, 8)", wait: 3000 },
  { name: 'rl_m_far', eval: "window.__speed(0); window.__rvSky(120, 24)", wait: 3000 },
  { name: 'rl_n_far200', eval: "window.__rvSky(200, 28)", wait: 3000 },
];

// v10: species glyphs at time-lapse speed (glyphs.ts GLYPH_LAPSE_*): the same drone view at 1x (no glyphs below 210 m) and at 100x
SETS.lapse = [
  { name: 'lapse_01_drone_1x', eval: "window.__speed(1); window.__focusHerd(); window.__engine.cam.setView({ distance: 300, pitchDeg: 40 })", wait: 4000 },
  { name: 'lapse_02_drone_100x', eval: "window.__speed(100)", wait: 5000 },
  { name: 'lapse_03_drone_100x_lower', eval: "window.__engine.cam.setView({ distance: 220, pitchDeg: 35 })", wait: 4000 },
];


const only = arg('only', '').split(',').filter(Boolean); // --only lk_02,lk_08: just those steps (the first, the setup step, always runs)
const steps = SETS[set] && only.length ? SETS[set].filter((s, i) => i === 0 || only.some((o) => s.name.startsWith(o))) : SETS[set];
if (!steps) { console.error('unknown set', set); process.exit(1); }
const kill = setTimeout(() => { console.error('stills: hard timeout'); process.exit(2); }, 10 * 60 * 1000 * waitScale + 2 * loadTimeout);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: arg('cache', undefined) });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: loadTimeout });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: loadTimeout });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  for (const s of steps) {
    if (s.eval) await page.evaluate(s.eval);
    await page.waitForTimeout((s.wait ?? 2500) * waitScale);
    const p = `${out}/${s.name}.${ext}`;
    await page.screenshot(png ? { path: p, timeout: shotTimeout } : { path: p, type: 'jpeg', quality: 90, timeout: shotTimeout });
    console.log('saved', p);
  }
} catch (e) {
  console.error('stills failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
