// Tiny synthesized sound effects (no audio files needed).
const Sfx = {
  ctx: null,
  noise: null,
  master: null,
  slideSrc: null,
  slideGain: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // volume channels: every sound effect goes into `master` (the effects channel); music and ambience
    // have their own; all three go through `out` (the overall volume)
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.ambBus = this.ctx.createGain();
    for (const b of [this.master, this.musicBus, this.ambBus]) b.connect(this.out);
    this.setVolumes(this.vol);
  },
  // levels 0..1 (the settings sliders). Overall 0.5 = the original mix.
  vol: { master: 0.5, sfx: 1, music: 0.8, ambience: 1 },
  setVolumes(v) {
    Object.assign(this.vol, v || {});
    if (!this.ctx) return;
    const t = this.ctx.currentTime, set = (g, x) => g.gain.setTargetAtTime(x, t, 0.03);
    set(this.out, this.vol.master * 1.1);
    set(this.master, this.vol.sfx);
    set(this.musicBus, this.vol.music);
    set(this.ambBus, this.vol.ambience);
  },

  // filtered noise burst: scuffs, steps
  burst(freq, dur, vol) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  },

  // low sine thump with a pitch drop: body weight of a step or landing
  thump(freq, dur, vol) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  step(kind) {
    if (kind === 'sprint') { this.burst(1100, 0.11, 0.35); this.thump(90, 0.12, 0.35); }
    else if (kind === 'crouch') { this.burst(500, 0.07, 0.08); }
    else { this.burst(750, 0.09, 0.2); this.thump(80, 0.1, 0.18); }
  },

  jump() { this.burst(900, 0.08, 0.15); },

  // hands slapping down on a ledge
  vault() { this.thump(120, 0.1, 0.3); this.burst(1500, 0.1, 0.25); },

  // effortful exhale while pulling up
  strain() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + 0.12;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.65);
  },

  // ---------- objective sounds ----------
  tone(freq, dur, vol, type = 'sine', delay = 0, slideTo = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  rummage() { this.burst(900 + Math.random() * 900, 0.12, 0.12); if (Math.random() < 0.5) this.thump(160, 0.05, 0.08); },
  drawerSlide() { this.burst(500, 0.3, 0.12); this.thump(110, 0.08, 0.1); },
  keyPickup() { this.tone(1760, 0.18, 0.12, 'triangle'); this.tone(2350, 0.25, 0.1, 'triangle', 0.08); this.tone(1320, 0.3, 0.06, 'triangle', 0.16); },
  lockedRattle() { for (let i = 0; i < 4; i++) { this.tone(900 + Math.random() * 600, 0.06, 0.06, 'square', i * 0.07); } this.thump(90, 0.15, 0.25); },
  unlock() { this.thump(140, 0.1, 0.4); this.tone(1200, 0.1, 0.1, 'square', 0.05); this.burst(3000, 0.08, 0.15); this.thump(70, 0.25, 0.35); },
  doorCreak() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + 0.25;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(90, t + 1.4);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 6;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.7);
  },
  // the combination lock rejects you: a harsh electric-ish buzz through the brass
  buzz() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    for (const f of [110, 116]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.setValueAtTime(0.12, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.65);
    }
  },
  // the old well winch turning: a rusty, rising shriek of metal on metal
  squeak() {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, f = 700 + Math.random() * 500, d = 0.22 + Math.random() * 0.12;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (1.15 + Math.random() * 0.25), t + d);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 4;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05);
    this.thump(120, 0.08, 0.12);
  },
  // a wooden chair hitting the floor / a wall
  clatter(k = 0.5) {
    this.thump(140 + Math.random() * 40, 0.12, 0.25 + 0.35 * k);
    this.burst(1800, 0.08, 0.12 + 0.25 * k);
    for (let i = 0; i < 2 + Math.floor(k * 3); i++) this.tone(500 + Math.random() * 500, 0.05, 0.03 + 0.05 * k, 'triangle', 0.05 + i * (0.04 + Math.random() * 0.05));
  },
  // a vase knocking against something without breaking
  clink(k = 0.5) {
    this.tone(1400 + Math.random() * 600, 0.25, 0.04 + 0.06 * k, 'sine');
    this.tone(2600 + Math.random() * 800, 0.15, 0.02 + 0.04 * k, 'sine');
    this.thump(260, 0.05, 0.1 * k);
  },
  // a vase smashing
  shatter(k = 0.7) {
    this.thump(200, 0.08, 0.3 + 0.2 * k);
    this.burst(9000, 0.35, 0.3 + 0.25 * k);
    this.burst(4000, 0.2, 0.2);
    for (let i = 0; i < 9; i++) this.tone(2000 + Math.random() * 4000, 0.06 + Math.random() * 0.1, 0.03 + Math.random() * 0.04, 'sine', Math.random() * 0.35);
  },

  // it arrives: the garage door is wrenched up somewhere far below — a long, grinding metal scream and a boom
  garageDoor(k = 0.5) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, out = c.createGain(); out.gain.value = 0.35 + 0.6 * k; out.connect(this.master);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + 2500 * k; lp.connect(out);   // muffled through the floors
    const n = this.noiseSrc(t, 2.4), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(900, t + 2); bp.Q.value = 3;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.5, t + 0.3); ng.gain.setValueAtTime(0.5, t + 1.8); ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    n.connect(bp); bp.connect(ng); ng.connect(lp);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(110, t + 2);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.25, t + 0.4); og.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    o.connect(og); og.connect(lp); o.start(t); o.stop(t + 2.4);
    setTimeout(() => { this.thump(45, 1.0, 0.6 + 0.6 * k); this.burst(400 + 1200 * k, 0.6, 0.25 + 0.3 * k); }, 2300);
  },

  lockerDoor() { this.thump(220, 0.08, 0.2); this.burst(2600, 0.1, 0.12); this.tone(380, 0.25, 0.04, 'triangle'); },
  win() { [392, 494, 587, 784].forEach((f, i) => this.tone(f, 1.6, 0.07, 'triangle', i * 0.18)); },

  // ---------- title screen music: a slow, slightly detuned music box over a low drone ----------
  menu: null,
  menuMusicStart() {
    const c = this.ctx; if (!c || this.menu) return;
    const t0 = c.currentTime;
    const bus = c.createGain(); bus.gain.setValueAtTime(0.0001, t0); bus.gain.exponentialRampToValueAtTime(0.9, t0 + 3);
    bus.connect(this.musicBus);
    // echo: the music box rings out down an empty hall
    const delay = c.createDelay(2); delay.delayTime.value = 0.48;
    const fb = c.createGain(); fb.gain.value = 0.42;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2200;
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    const wet = c.createGain(); wet.gain.value = 0.55; damp.connect(wet); wet.connect(bus);
    // drone: A and E, low and breathing slowly
    const nodes = [];
    const droneG = c.createGain(); droneG.gain.value = 0.06; droneG.connect(bus);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lfoG = c.createGain(); lfoG.gain.value = 0.03;
    lfo.connect(lfoG); lfoG.connect(droneG.gain); lfo.start(); nodes.push(lfo);
    for (const f of [55, 55.4, 82.4]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(droneG); o.start(); nodes.push(o); }
    // the melody (A minor lullaby). 0 = rest. One step = 0.62 s.
    const N = { A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, Gs4: 415.3, E4: 329.6 };
    const tune = ['E5', 0, 'C5', 'A4', 0, 'B4', 'Gs4', 0, 'A4', 'C5', 'E5', 0, 'D5', 'B4', 0, 0,
                  'E5', 0, 'F5', 'E5', 0, 'C5', 'A4', 0, 'B4', 0, 'Gs4', 'E4', 'A4', 0, 0, 0];
    const STEP = 0.62;
    const note = (f, at) => {
      for (const det of [1, 1.004]) {                            // two slightly out-of-tune tines: unsettling
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(f * det * (0.997 + Math.random() * 0.006), at);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.07, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.8);
        o.connect(g); g.connect(bus); g.connect(delay);
        o.start(at); o.stop(at + 1.9);
      }
    };
    let step = 0, next = t0 + 1.2;
    const timer = setInterval(() => {                             // schedule a little ahead so timing stays even
      while (next < c.currentTime + 0.3) {
        const n = tune[step % tune.length];
        if (n) note(N[n], next);
        step++;
        next += STEP * (step % tune.length === 0 ? 2.5 : 1);       // a long pause before it loops
      }
    }, 100);
    this.menu = { bus, nodes, timer };
  },
  menuMusicStop() {
    const m = this.menu; if (!m) return;
    this.menu = null;
    const t = this.ctx.currentTime;
    m.bus.gain.cancelScheduledValues(t);
    m.bus.gain.setValueAtTime(Math.max(0.0001, m.bus.gain.value), t);
    m.bus.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    setTimeout(() => { clearInterval(m.timer); m.nodes.forEach(n => n.stop()); m.bus.disconnect(); }, 1700);
  },

  // ---------- ambience: a low drone, a draught, and the house making noises somewhere else ----------
  ambienceOn: false,
  ambience() {
    const c = this.ctx; if (!c || this.ambienceOn) return;
    this.ambienceOn = true;
    const bus = c.createGain(); bus.gain.value = 0; bus.connect(this.ambBus);
    bus.gain.linearRampToValueAtTime(1, c.currentTime + 4);
    // drone: two slightly detuned low saws, heavily filtered, slowly breathing
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110;
    const dg = c.createGain(); dg.gain.value = 0.05;
    for (const f of [41, 41.7, 61.5]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lfoG = c.createGain(); lfoG.gain.value = 0.025;
    lfo.connect(lfoG); lfoG.connect(dg.gain); lfo.start();
    lp.connect(dg); dg.connect(bus);
    // draught through the house
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.7;
    const wg = c.createGain(); wg.gain.value = 0.025;
    const wl = c.createOscillator(); wl.frequency.value = 0.11; const wlg = c.createGain(); wlg.gain.value = 0.018;
    wl.connect(wlg); wlg.connect(wg.gain); wl.start();
    n.connect(bp); bp.connect(wg); wg.connect(bus); n.start();
    this.ambBus = bus;
    this.scheduleHouseSound();
  },
  scheduleHouseSound() {
    setTimeout(() => { this.houseSound(); this.scheduleHouseSound(); }, 6000 + Math.random() * 14000);
  },
  // one distant sound, panned to a random side
  houseSound() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const out = c.createGain(); out.gain.value = 0.6 + Math.random() * 0.4;
    if (pan) { pan.pan.value = Math.random() * 2 - 1; out.connect(pan); pan.connect(this.ambBus); } else out.connect(this.ambBus);
    const kind = Math.random();
    if (kind < 0.35) {                        // a long floorboard / door creak
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f0 = 70 + Math.random() * 60; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.6 + Math.random() * 0.6), t + 1.8);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 450 + Math.random() * 400; f.Q.value = 8;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 2.3);
    } else if (kind < 0.6) {                  // knocking, somewhere in the walls
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.35 + Math.random() * 0.25);
        const o = c.createOscillator(); o.frequency.setValueAtTime(95, tt); o.frequency.exponentialRampToValueAtTime(45, tt + 0.15);
        const g = c.createGain(); g.gain.setValueAtTime(0.18, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
        const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 300;
        o.connect(lpf); lpf.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.2);
      }
    } else if (kind < 0.8) {                  // a breathy whisper you can't make out
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
      f.frequency.setValueAtTime(1600, t);
      for (let k = 0; k < 8; k++) f.frequency.linearRampToValueAtTime(900 + Math.random() * 1800, t + 0.15 * (k + 1));
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < 6; k++) { g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.03, t + 0.1 + k * 0.2); g.gain.linearRampToValueAtTime(0.004, t + 0.2 + k * 0.2); }
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random()); src.stop(t + 1.6);
    } else {                                  // the house settling: a deep groan
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(36, t + 2.5);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 3);
    }
  },

  // ---------- recorded sound files (optional) ----------
  // Drop real recordings into the sounds/ folder and they replace the synthesized versions:
  //   sounds/screech.(ogg|mp3|wav)    — the shriek when it spots you
  //   sounds/jumpscare.(ogg|mp3|wav)  — game over (falls back to the screech file)
  // Plain <audio> playback, so it works when index.html is opened straight from disk (file://).
  clips: {},
  // playback speed for each file: below 1 = lower pitch (and a little slower). Each play varies slightly.
  clipRate: { screech: 0.72, jumpscare: 0.8 },
  loadClips() {
    for (const name of ['screech', 'jumpscare']) {
      const tryExt = exts => {
        if (!exts.length) return;
        const a = new Audio();
        a.preload = 'auto';
        a.addEventListener('canplaythrough', () => { this.clips[name] = a; }, { once: true });
        a.addEventListener('error', () => tryExt(exts.slice(1)), { once: true });
        a.src = `sounds/${name}.${exts[0]}`;
        a.load();
      };
      tryExt(['ogg', 'mp3', 'wav']);
    }
  },
  // play a loaded file (a fresh copy each time, so they can overlap). false = no file, use the synth
  playClip(name, vol = 1) {
    const a = this.clips[name];
    if (!a) return false;
    const p = a.cloneNode();
    p.volume = Math.max(0, Math.min(1, vol * this.vol.master * 2 * this.vol.sfx));
    p.preservesPitch = p.mozPreservesPitch = p.webkitPreservesPitch = false;    // slower = deeper, like a bigger throat
    p.playbackRate = (this.clipRate[name] || 1) * (0.95 + Math.random() * 0.1);
    p.play().catch(() => {});
    return true;
  },

  // ---------- the entity ----------
  // a gain node feeding the master, optionally panned left/right (-1..1)
  bus(vol, pan = 0) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  },
  noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    src.start(t, Math.random() * 1.5); src.stop(t + dur);
    return src;
  },

  // one of its feet slamming down. k: 0 (far away) .. 1 (right on top of you) — closer = louder, deeper, longer
  // a sound placed in 3D around your head (HRTF): rel = { x: right, y: up, z: back } in metres, relative to you.
  // Distance loudness is done by the caller; this only gives direction (left/right, front/back, a little up/down).
  spatial(rel) {
    const c = this.ctx;
    const g = c.createGain();
    if (c.createPanner) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 10000;
      const len = Math.hypot(rel.x, rel.y, rel.z) || 1, sc = 2 / len;           // a fixed 2 m away: only the direction matters
      if (p.positionX) { p.positionX.value = rel.x * sc; p.positionY.value = rel.y * sc; p.positionZ.value = rel.z * sc; }
      else p.setPosition(rel.x * sc, rel.y * sc, rel.z * sc);
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return g;
  },

  // the entity's footstep.
  //   near    0..1  how close it is (1 = right on top of you, ~0.1 = far across the house)
  //   rel     direction to it, around your head (see spatial)
  //   through null (same floor) | 'above' | 'below'  — a floor between you muffles it into a deep thud
  //   crawl   flattened out: lighter, scrabbling
  entityStep({ near, rel, through = null, crawl = 0 }) {
    const c = this.ctx; if (!c || near <= 0.004) return;
    const t = c.currentTime;
    const out = this.spatial(rel);
    const thru = !!through;
    out.gain.value = (crawl > 0.5 ? 0.65 : 1) * (thru ? 0.55 : 1);
    // brightness falls away with distance (close = a sharp crack, far = a dull knock); a floor in between leaves only the boom
    const bright = thru ? 90 + 160 * near : 160 + 2400 * near * near;
    // 1) the impact: a deep sine dropping in pitch
    const o = c.createOscillator();
    const f0 = thru ? 46 : 70 - near * 22;
    o.frequency.setValueAtTime(f0 * 1.7, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + 0.3 + near * 0.3);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(120, bright * 0.35);
    const g = c.createGain(), v = 0.03 + 1.5 * near;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45 + near * 0.45 + (thru ? 0.4 : 0));
    o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + 1.4);
    // 2) the crack of weight landing on boards: only when it's close and on your floor
    if (!thru) {
      const n = this.noiseSrc(t, 0.4);
      const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = bright;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.75 * Math.pow(near, 1.3), t + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 + near * 0.16);
      n.connect(nf); nf.connect(ng); ng.connect(out);
    }
    // 3) through a floor: the whole structure booms. Overhead it comes with creaking joists + a patter of dust;
    //    underneath it's only a low, felt thump through your feet
    if (thru) {
      const b = c.createOscillator(); b.frequency.setValueAtTime(through === 'above' ? 58 : 38, t);
      const bg = c.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.35 + 0.9 * near, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      b.connect(bg); bg.connect(out); b.start(t); b.stop(t + 1);
      if (through === 'above' && Math.random() < 0.3 + 0.6 * near) {
        const cr = c.createOscillator(); cr.type = 'sawtooth';
        const cf = 70 + Math.random() * 40; cr.frequency.setValueAtTime(cf, t + 0.05); cr.frequency.linearRampToValueAtTime(cf * 0.75, t + 0.7);
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320 + Math.random() * 200; bp.Q.value = 6;
        const cg = c.createGain(); cg.gain.setValueAtTime(0.0001, t + 0.05); cg.gain.linearRampToValueAtTime(0.09 * (0.4 + near), t + 0.2); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        cr.connect(bp); bp.connect(cg); cg.connect(out); cr.start(t + 0.05); cr.stop(t + 0.85);
        const dust = this.noiseSrc(t + 0.12, 0.5), df = c.createBiquadFilter(); df.type = 'highpass'; df.frequency.value = 3500;
        const dg = c.createGain(); dg.gain.setValueAtTime(0.0001, t + 0.12); dg.gain.linearRampToValueAtTime(0.025 * (0.3 + near), t + 0.2); dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        dust.connect(df); df.connect(dg); dg.connect(this.master);                                   // falls all around you
      }
    } else if (near > 0.35 && Math.random() < 0.45) {
      // close by on your floor, the boards groan after it
      const cr = c.createOscillator(); cr.type = 'sawtooth';
      const cf = 90 + Math.random() * 50; cr.frequency.setValueAtTime(cf, t + 0.08); cr.frequency.linearRampToValueAtTime(cf * 0.7, t + 0.6);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500 + Math.random() * 300; bp.Q.value = 7;
      const cg = c.createGain(); cg.gain.setValueAtTime(0.0001, t + 0.08); cg.gain.linearRampToValueAtTime(0.07 * near, t + 0.2); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      cr.connect(bp); bp.connect(cg); cg.connect(out); cr.start(t + 0.08); cr.stop(t + 0.75);
    }
  },

  // it has seen you: a long, tearing shriek
  screech(pan = 0, vol = 0.55, len = 1.5) {
    if (this.playClip('screech', Math.min(1, vol * 1.6))) return;        // a real recording, if there is one
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, out = this.bus(vol, pan);
    const shaper = c.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 5); }
    shaper.curve = curve;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + 0.05);
    env.gain.setValueAtTime(1, t + len * 0.6); env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const lfo = c.createOscillator(); lfo.frequency.value = 13; const lfoG = c.createGain(); lfoG.gain.value = 55;
    lfo.connect(lfoG); lfo.start(t); lfo.stop(t + len + 0.1);
    for (const m of [1, 1.017, 1.49, 0.502]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const b = 400 * m;
      o.frequency.setValueAtTime(b * 0.55, t); o.frequency.exponentialRampToValueAtTime(b * 1.9, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(b * 1.55, t + len * 0.45); o.frequency.exponentialRampToValueAtTime(b * 0.8, t + len);
      lfoG.connect(o.frequency);
      const og = c.createGain(); og.gain.value = m === 0.502 ? 0.5 : 0.3;
      o.connect(og); og.connect(shaper); o.start(t); o.stop(t + len + 0.1);
    }
    shaper.connect(bp); bp.connect(env);
    // breathy rasp on top
    const n = this.noiseSrc(t, len + 0.1);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const ng = c.createGain(); ng.gain.value = 0.35;
    n.connect(hp); hp.connect(ng); ng.connect(env);
    env.connect(out);
  },

  // lub-dub. k: 0 (calm) .. 1 (it's right behind you) — louder and harder when it's close.
  // Layered so it's obvious on laptop speakers too: a deep body, a punchier mid thump, and a soft knock.
  heartbeat(k = 0.5) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, vol = 0.75 + 0.55 * k;
    const out = c.createGain(); out.gain.value = vol;
    const comp = c.createDynamicsCompressor();                       // keeps it loud without clipping
    comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
    out.connect(comp); comp.connect(this.master);
    for (const [dt, f, v] of [[0, 64, 1], [0.17, 52, 0.75]]) {
      const at = t + dt;
      // deep body
      const o = c.createOscillator();
      o.frequency.setValueAtTime(f * 1.4, at); o.frequency.exponentialRampToValueAtTime(f * 0.6, at + 0.16);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(1.0 * v, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.3);
      // mid thump: what small speakers actually play
      const m = c.createOscillator(); m.type = 'triangle';
      m.frequency.setValueAtTime(f * 2.6, at); m.frequency.exponentialRampToValueAtTime(f * 1.4, at + 0.09);
      const mg = c.createGain();
      mg.gain.setValueAtTime(0.0001, at); mg.gain.linearRampToValueAtTime(0.55 * v, at + 0.005); mg.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      m.connect(mg); mg.connect(out); m.start(at); m.stop(at + 0.16);
      // soft knock of the beat
      const n = this.noiseSrc(at, 0.1);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, at); ng.gain.linearRampToValueAtTime(0.5 * v, at + 0.003); ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      n.connect(lp); lp.connect(ng); ng.connect(out);
    }
  },

  // its arm whipping through the air
  swipe(pan = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, out = this.bus(0.4, pan);
    const n = this.noiseSrc(t, 0.4);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.18); bp.frequency.exponentialRampToValueAtTime(600, t + 0.35);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    n.connect(bp); bp.connect(g); g.connect(out);
  },

  // you got hit
  hurt() {
    this.thump(95, 0.35, 0.8);
    this.burst(2600, 0.18, 0.5);
    this.tone(320, 0.3, 0.07, 'sawtooth', 0.02, 110);
    this.burst(400, 0.5, 0.3);
  },

  // bandage + a soft rising tone
  medkit() {
    for (let i = 0; i < 3; i++) setTimeout(() => this.burst(3200, 0.08, 0.1), i * 90);
    this.tone(523, 0.5, 0.06, 'triangle', 0.25, 784);
    this.tone(784, 0.6, 0.05, 'triangle', 0.4);
  },

  // game over: right in your face
  jumpscare() {
    const c = this.ctx; if (!c) return;
    if (!this.playClip('jumpscare', 1)) this.screech(0, 1.1, 1.6);
    this.thump(48, 1.4, 1.2);
    this.burst(7000, 0.7, 0.7);
    this.burst(300, 1.2, 0.6);
  },

  climb(kind) {
    if (kind === 'ladder') { this.thump(340, 0.05, 0.12); this.burst(3000, 0.04, 0.08); } // metal rung
    else { this.burst(2200, 0.14, 0.12); }                                                // leaf rustle
  },

  land(impact) {
    const v = Math.min(impact / 12, 1);
    if (v < 0.15) return;
    this.burst(800, 0.15, 0.25 + v * 0.35);
    this.thump(70, 0.2, 0.25 + v * 0.5);
  },

  slideStart() {
    const c = this.ctx; if (!c) return;
    this.slideStop();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.04);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    this.slideSrc = src; this.slideGain = g; this.slideFilter = f;
  },

  slideUpdate(speed) {
    if (!this.slideGain) return;
    const t = this.ctx.currentTime;
    this.slideGain.gain.setTargetAtTime(Math.min(0.06 + speed * 0.02, 0.28), t, 0.03);
    this.slideFilter.frequency.setTargetAtTime(600 + speed * 110, t, 0.05);
  },

  slideStop() {
    if (!this.slideSrc) return;
    const t = this.ctx.currentTime;
    this.slideGain.gain.cancelScheduledValues(t);
    this.slideGain.gain.setTargetAtTime(0.0001, t, 0.05);
    this.slideSrc.stop(t + 0.3);
    this.slideSrc = null; this.slideGain = null;
  },
};
