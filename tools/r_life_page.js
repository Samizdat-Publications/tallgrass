// page-side puppet harness (see tools/r_life_shots.mjs): defines window.__scene(spec, mode, dist, pitch, focusAlong, arena)
(() => {
    const e = window.__engine, w = e.world, an = window.__animals;
    window.__speed(1); window.__followId(null);
    window.__envO = { season: 1.8, weather: (window.__lifeRain || 0) > 0 ? 1 : 0, warmth: 0.7, rain: (window.__lifeRain || 0), dayFrac: (window.__lifeDay ?? 0.62) };
    e.onFrame(() => e.setEnv(window.__envO)); e.setEnv(window.__envO); e.applyEnvNow();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    const nc = w.creek.length / 2, k = Math.min(nc - 3, Math.max(2, Math.floor(nc * (window.__lifeCk ?? 0.5))));
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
  })()
