// The house's atmosphere: sounds placed in 3D at real spots in the house, depending on where you are.
// Everything goes through the Ambience volume channel, is muffled through floors, and is kept clearly
// different from the monster's footsteps (no heavy thuds), so it never fools you about where IT is.
//
//   the grandfather clocks   tick (near one) and chime every couple of minutes (heard through the house)
//   the bathrooms            drip, and the pipes in the walls clank and gurgle now and then
//   the piano                plays a few out-of-tune notes by itself, only when you're nowhere near it
//   doorways                 a door somewhere creaks open... or slams
//   the wind                 gusts outside: loud in the garden, rattling the windows upstairs, whistling in the vents
//   the garden               crickets, an owl, distant thunder
//   the basement             the bare bulbs hum, water drips from the ceiling
const Atmos = (function () {
  let L = null, ready = false;
  const src = { clocks: [], piano: [], baths: [], vents: [], doors: [] };
  const T = {};                         // countdown timers
  let loops = null, gust = 0, gustT = 0, gustLen = 0, tock = false;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init(layout) {
    L = layout;
    if (!L || !L.floors) return;
    const FY = L.floorY;
    const at = (f, c, r, h) => ({ x: (c + 0.5 - L.W / 2) * L.CELL, y: FY[f] + h, z: (r + 0.5 - L.H / 2) * L.CELL, f });
    L.floors.forEach((g, f) => g.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === 'g') src.clocks.push(at(f, c, r, 1.6));
      else if (ch === 'n') src.piano.push(at(f, c, r, 1.0));
      else if (ch === 'c' || ch === 'i' || ch === 'u') src.baths.push(at(f, c, r, 0.8));
      else if (ch === 'V' || ch === 'v') src.vents.push(at(f, c, r, ch === 'v' ? 0.1 : 0.4));
      else if (ch === 'D') src.doors.push(at(f, c, r, 1.5));
    })));
    Object.assign(T, { tick: 1, chime: rnd(60, 120), drip: 2, pipes: rnd(25, 60), piano: rnd(90, 180), cricket: 1,
      owl: rnd(20, 50), gust: rnd(6, 15), door: rnd(30, 70), thunder: rnd(50, 120) });
    ready = true;
  }

  // ---------- where you are ----------
  let P = null;
  const floorOf = y => (y > L.STOREY - 1.2 ? 1 : y < -1.8 ? 2 : 0);
  function outdoors() {
    const c = Math.floor(P.pos.x / L.CELL + L.W / 2), r = Math.floor(P.pos.z / L.CELL + L.H / 2);
    if (floorOf(P.pos.y) !== 0) return false;
    return L.zones.some(z => z.outdoor && z.f === 0 && c >= z.c0 && c <= z.c1 && r >= z.r0 && r <= z.r1);
  }
  // distance to a spot (a floor in between counts extra) and its direction around your head
  function place(s) {
    const ex = s.x - P.pos.x, ez = s.z - P.pos.z, dy = s.y - (P.pos.y + 1.6);
    const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
    return {
      d: Math.hypot(ex, ez, Math.abs(dy) > 2.6 ? dy * 1.6 : dy),
      rel: { x: ex * cy - ez * sy, y: dy, z: ex * sy + ez * cy },
      muffle: Math.abs(dy) > 2.6,
    };
  }
  const nearest = list => { let best = null; for (const s of list) { const p = place(s); if (!best || p.d < best.d) best = Object.assign(p, { s }); } return best; };
  // a random spot around you, `a`..`b` metres away on your level (for things with no fixed place: crickets, drips)
  function around(a, b, h = 1) {
    const ang = Math.random() * Math.PI * 2, d = rnd(a, b);
    return { x: P.pos.x + Math.sin(ang) * d, y: P.pos.y + h, z: P.pos.z + Math.cos(ang) * d };
  }

  // ---------- audio plumbing ----------
  const ctx = () => (typeof Sfx !== 'undefined' && Sfx.ctx && Sfx.ctx.state === 'running' ? Sfx.ctx : null);
  // an output placed at `rel` (direction only), `gain` loud, dulled through a floor
  function out(rel, gain, muffle) {
    const c = Sfx.ctx, g = c.createGain(); g.gain.value = gain;
    let last = g;
    if (muffle) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; g.connect(lp); last = lp; }
    if (c.createPanner) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 10000;
      const len = Math.hypot(rel.x, rel.y, rel.z) || 1, sc = 2 / len;
      if (p.positionX) { p.positionX.value = rel.x * sc; p.positionY.value = rel.y * sc; p.positionZ.value = rel.z * sc; }
      else p.setPosition(rel.x * sc, rel.y * sc, rel.z * sc);
      last.connect(p); p.connect(Sfx.ambBus);
    } else last.connect(Sfx.ambBus);
    return g;
  }
  function tone(dest, f, t, dur, vol, type = 'sine', f2 = null, attack = 0.005) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dest, t, dur, vol, type, freq, q = 1, attack = 0.005) {
    const c = Sfx.ctx, n = c.createBufferSource(); n.buffer = Sfx.noise; n.loop = true;   // the buffer is only 2 s
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(dest); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
    return f;
  }

  // ---------- the sounds ----------
  const S = {
    tick(o, tockSide) {                              // the clock: a dry wooden tick... tock
      const t = Sfx.ctx.currentTime;
      noise(o, t, 0.03, 0.5, 'bandpass', tockSide ? 2100 : 3200, 6);
      tone(o, tockSide ? 900 : 1250, t, 0.04, 0.15, 'triangle');
    },
    chime(o) {                                       // the hour: slow, deep bell strikes with long tails
      const t0 = Sfx.ctx.currentTime, n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 2.4, f = 174.6;
        for (const [m, v, d] of [[1, 0.22, 4.5], [2.0, 0.1, 3], [2.76, 0.08, 2.2], [5.4, 0.04, 1.2], [0.5, 0.08, 5]]) tone(o, f * m, t, d, v, 'sine', null, 0.004);
      }
    },
    drip(o, echo) {                                  // a single drop: a quick falling plink (with an echo in the basement)
      const t = Sfx.ctx.currentTime, f = rnd(1400, 2400);
      tone(o, f, t, 0.09, 0.18, 'sine', f * 0.45);
      if (echo) { tone(o, f, t + 0.13, 0.09, 0.06, 'sine', f * 0.45); tone(o, f, t + 0.27, 0.09, 0.025, 'sine', f * 0.45); }
    },
    pipes(o) {                                       // pipes in the walls: a few metal knocks, then water rushing
      const t = Sfx.ctx.currentTime, n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const tt = t + i * rnd(0.12, 0.35);
        tone(o, rnd(160, 260), tt, 0.35, 0.12, 'square', null, 0.002);
        tone(o, rnd(900, 1300), tt, 0.25, 0.05, 'sine', null, 0.002);
      }
      const w = noise(o, t + n * 0.25, 2.8, 0.12, 'lowpass', 500, 1, 0.8);
      w.frequency.linearRampToValueAtTime(900, Sfx.ctx.currentTime + n * 0.25 + 1.5);
    },
    piano(o) {                                       // a few notes on the old, out-of-tune piano, slowly
      const t0 = Sfx.ctx.currentTime;
      const scale = [246.9, 261.6, 293.7, 311.1, 329.6, 349.2, 392.0, 415.3, 493.9];
      const n = 3 + Math.floor(Math.random() * 3);
      let t = t0;
      for (let i = 0; i < n; i++) {
        const f = scale[Math.floor(Math.random() * scale.length)] * (1 + rnd(-0.012, 0.012));   // out of tune
        tone(o, f, t, 3.2, 0.14, 'triangle', null, 0.004);
        tone(o, f * 1.004, t, 2.4, 0.06, 'sine', null, 0.004);
        tone(o, f * 2, t, 1.2, 0.03, 'sine', null, 0.004);
        t += rnd(0.5, 1.4);
      }
    },
    cricket(o) {                                     // a cricket: three quick high chirps
      const t = Sfx.ctx.currentTime, f = rnd(4200, 5200);
      for (let i = 0; i < 3; i++) tone(o, f, t + i * 0.045, 0.03, 0.05, 'sine', null, 0.004);
    },
    owl(o) {                                         // hoo... hoo-hoo
      const t = Sfx.ctx.currentTime;
      for (const [dt, d] of [[0, 0.5], [0.85, 0.22], [1.15, 0.6]]) tone(o, 390, t + dt, d, 0.12, 'sine', 330, d * 0.4);
    },
    creak(o) {                                       // a door swinging slowly on rusty hinges, then the latch
      const c = Sfx.ctx, t = c.currentTime, len = rnd(1.4, 2.6);
      const os = c.createOscillator(); os.type = 'sawtooth';
      const f0 = rnd(180, 300); os.frequency.setValueAtTime(f0, t);
      for (let k = 1; k <= 6; k++) os.frequency.linearRampToValueAtTime(f0 * rnd(0.7, 1.5), t + len * k / 6);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(900, 1500); bp.Q.value = 10;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.3); g.gain.setValueAtTime(0.09, t + len - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      os.connect(bp); bp.connect(g); g.connect(o); os.start(t); os.stop(t + len + 0.05);
      if (Math.random() < 0.6) { noise(o, t + len + 0.05, 0.05, 0.3, 'bandpass', 2500, 3); tone(o, 600, t + len + 0.05, 0.06, 0.06, 'square'); }
    },
    slam(o) {                                        // a door slamming somewhere, and the house ringing after it
      const t = Sfx.ctx.currentTime;
      noise(o, t, 0.25, 0.6, 'lowpass', 900, 1, 0.002);
      tone(o, 70, t, 0.4, 0.25, 'sine', 40, 0.002);
      for (let i = 1; i <= 3; i++) noise(o, t + i * 0.11, 0.35, 0.18 / i, 'bandpass', 500, 1.5, 0.01);
    },
    rattle(o) {                                      // a window shaking in its frame in a gust
      const t = Sfx.ctx.currentTime, n = 6 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) noise(o, t + i * rnd(0.035, 0.07), 0.03, rnd(0.1, 0.22), 'bandpass', rnd(1200, 2200), 4, 0.002);
    },
    thunder(o, k) {                                  // far-off thunder: a crack (if you're outside), then a long roll
      const t = Sfx.ctx.currentTime, len = rnd(4, 7);
      if (k > 0.7) noise(o, t, 0.6, 0.25, 'bandpass', 1200, 0.8, 0.01);
      const f = noise(o, t + 0.2, len, 0.5, 'lowpass', 160, 0.7, 0.6);
      f.frequency.linearRampToValueAtTime(70, Sfx.ctx.currentTime + len);
    },
  };

  // ---------- steady beds: wind outside, the basement's hum, a whistle in the vents ----------
  function makeLoops(c) {
    const mk = (node) => { const g = c.createGain(); g.gain.value = 0; node.connect(g); g.connect(Sfx.ambBus); return g; };
    const wn = c.createBufferSource(); wn.buffer = Sfx.noise; wn.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
    wn.connect(wf); wn.start();
    const hum = c.createGain();
    for (const [f, v] of [[50, 0.6], [100, 0.4], [150, 0.15]]) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.value = v; o.connect(g); g.connect(hum); o.start(); }
    const buzz = c.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 100;
    const bl = c.createBiquadFilter(); bl.type = 'bandpass'; bl.frequency.value = 1800; bl.Q.value = 3;
    const bg = c.createGain(); bg.gain.value = 0.15; buzz.connect(bl); bl.connect(bg); bg.connect(hum); buzz.start();
    const vn = c.createBufferSource(); vn.buffer = Sfx.noise; vn.loop = true;
    const vf = c.createBiquadFilter(); vf.type = 'bandpass'; vf.frequency.value = 950; vf.Q.value = 14;
    vn.connect(vf); vn.start();
    return { wind: mk(wf), windF: wf, hum: mk(hum), vent: mk(vf), ventF: vf };
  }
  const setGain = (g, v) => g.gain.setTargetAtTime(v, Sfx.ctx.currentTime, 0.4);

  // ---------- every frame while you're playing ----------
  function update(dt, player) {
    if (!ready || !ctx()) return;
    P = player;
    if (!loops) loops = makeLoops(Sfx.ctx);
    const fl = floorOf(P.pos.y), outside = outdoors(), base = fl === 2;
    const fire = (k, fn) => { if ((T[k] -= dt) <= 0) fn(); };

    // gusts of wind come and go
    if (gustT > 0) { gustT -= dt; gust = Math.sin(Math.PI * (1 - gustT / gustLen)); if (gustT <= 0) gust = 0; }
    fire('gust', () => {
      gustLen = gustT = rnd(3, 7); T.gust = rnd(12, 30);
      if (fl === 1 && !outside) { const w = around(4, 9, 1.2); const p = place(w); S.rattle(out(p.rel, 0.9, false)); }
    });
    const windBase = outside ? 0.05 : base ? 0.003 : fl === 1 ? 0.016 : 0.01;
    setGain(loops.wind, windBase * (1 + gust * (outside ? 2.2 : 1.6)));
    loops.windF.frequency.setTargetAtTime(380 + gust * 260, Sfx.ctx.currentTime, 0.5);
    setGain(loops.hum, base ? 0.035 : 0);
    // the vents whistle when the wind blows and you're close to one
    const v = nearest(src.vents.filter(s => s.f === fl));
    setGain(loops.vent, v && v.d < 6 ? (1 - v.d / 6) * (0.006 + gust * 0.02) : 0);

    // the clock you're nearest ticks; any of them chimes now and then
    fire('tick', () => {
      T.tick = 1; tock = !tock;
      const n = nearest(src.clocks);
      if (n && n.d < 16) S.tick(out(n.rel, Math.pow(1 - n.d / 16, 2) * 0.55, n.muffle), tock);
    });
    fire('chime', () => {
      T.chime = rnd(110, 200);
      const n = nearest(src.clocks);
      if (n) S.chime(out(n.rel, Math.max(0.12, 1 - n.d / 40) * 0.9, n.muffle));
    });
    // drips: the bathrooms, and the basement ceiling
    fire('drip', () => {
      T.drip = rnd(0.7, 2.6);
      if (base) { const p = place(around(3, 10, 2.8)); S.drip(out(p.rel, 0.5, false), true); return; }
      const n = nearest(src.baths);
      if (n && n.d < 11) S.drip(out(n.rel, Math.pow(1 - n.d / 11, 1.5) * 0.7, n.muffle), false);
    });
    fire('pipes', () => {
      T.pipes = rnd(40, 90);
      if (!src.baths.length) return;
      const p = place(src.baths[Math.floor(Math.random() * src.baths.length)]);
      S.pipes(out(p.rel, Math.max(0.12, 1 - p.d / 35) * 0.8, p.muffle));
    });
    // the piano plays itself, but never while you can see it
    fire('piano', () => {
      T.piano = rnd(150, 300);
      const n = nearest(src.piano);
      if (n && n.d > 9) S.piano(out(n.rel, Math.max(0.12, 1 - n.d / 35) * 0.8, n.muffle));
      else T.piano = rnd(30, 60);
    });
    // a door somewhere, 10-30 m away
    fire('door', () => {
      T.door = rnd(45, 110);
      const far = src.doors.map(s => Object.assign(place(s), { s })).filter(p => p.d > 10 && p.d < 30);
      if (!far.length) return;
      const p = far[Math.floor(Math.random() * far.length)], k = 1 - p.d / 35;
      if (Math.random() < 0.72) S.creak(out(p.rel, k * 0.7, p.muffle)); else S.slam(out(p.rel, k * 0.8, p.muffle));
    });
    // outside: crickets and an owl (crickets faintly through the walls on the ground floor)
    fire('cricket', () => {
      T.cricket = rnd(0.4, 1.6);
      if (base || fl === 1) return;
      const p = place(around(4, 14, 0.2));
      S.cricket(out(p.rel, outside ? rnd(0.3, 0.7) : 0.08, !outside));
    });
    fire('owl', () => {
      T.owl = rnd(35, 80);
      if (!outside && Math.random() < 0.6) return;
      const p = place(around(18, 28, 6));
      S.owl(out(p.rel, outside ? 0.5 : 0.15, !outside));
    });
    fire('thunder', () => {
      T.thunder = rnd(80, 200);
      const k = outside ? 1 : base ? 0.25 : 0.55;
      const p = place(around(200, 300, 50));
      S.thunder(out(p.rel, k * 0.8, !outside), k);
    });
  }

  // fade everything steady out (death, winning) and stop the one-shots
  function silence() {
    ready = false;
    if (loops && Sfx.ctx) for (const g of [loops.wind, loops.hum, loops.vent]) g.gain.setTargetAtTime(0, Sfx.ctx.currentTime, 0.3);
  }

  return { init, update, silence, sounds: S };
})();
