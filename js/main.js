// Boot: renderer, input, game loop, HUD.
(function () {
  const canvas = document.getElementById('game');
  const menu = document.getElementById('menu');
  const startBtn = document.getElementById('start');
  const staminaEl = document.getElementById('stamina');
  const staminaFill = document.getElementById('stamina-fill');
  const debugEl = document.getElementById('debug');
  const vignette = document.getElementById('vignette');

  // ---------- settings (remembered between sessions) ----------
  // keybinds: two keys per action (KeyboardEvent.code values; null = empty slot)
  const DEFAULT_BINDS = {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['ControlLeft', 'KeyC'], jump: ['Space', null], interact: ['KeyE', null],
    flashlight: ['KeyF', null], respawn: ['KeyR', null], debug: ['KeyH', null], map: ['KeyM', null],
  };
  const BIND_NAMES = {
    forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', sprint: 'Sprint (hold)', crouch: 'Crouch (hold)',
    jump: 'Jump', interact: 'Interact / pick up (hold)', flashlight: 'Flashlight', respawn: 'Respawn', debug: 'Debug info', map: 'Debug map',
  };
  const RESERVED = ['Escape', 'Digit0', 'Digit1', 'Numpad0', 'Numpad1', 'Backspace'];      // pause, the two modes, the lock's undo
  const settings = { sens: 3, fov: 78, fullscreen: true, map: 'house', vol: { master: 0.5, sfx: 1, music: 0.8, ambience: 1 }, binds: null };
  try {
    const saved = JSON.parse(localStorage.getItem('run-settings') || '{}');
    Object.assign(settings, saved, { vol: Object.assign({}, settings.vol, saved.vol || {}) });
  } catch (e) {}
  const binds = {};
  for (const a in DEFAULT_BINDS) binds[a] = (settings.binds && Array.isArray(settings.binds[a]) ? settings.binds[a] : DEFAULT_BINDS[a]).slice(0, 2);
  settings.binds = binds;
  Sfx.setVolumes(settings.vol);
  const saveSettings = () => { try { localStorage.setItem('run-settings', JSON.stringify(settings)); } catch (e) {} };

  const sensEl = document.getElementById('sens'), fovEl = document.getElementById('fov'), fsEl = document.getElementById('fs');
  sensEl.value = settings.sens; fovEl.value = settings.fov; fsEl.checked = settings.fullscreen;
  const showSettings = () => {
    document.getElementById('sens-val').textContent = Number(settings.sens).toFixed(1);
    document.getElementById('fov-val').textContent = settings.fov + '°';
  };
  sensEl.oninput = () => { settings.sens = +sensEl.value; showSettings(); saveSettings(); };
  fovEl.oninput = () => { settings.fov = +fovEl.value; showSettings(); saveSettings(); };
  fsEl.onchange = () => { settings.fullscreen = fsEl.checked; saveSettings(); };
  showSettings();

  // ---------- sound sliders ----------
  for (const k of ['master', 'sfx', 'music', 'ambience']) {
    const el = document.getElementById('vol-' + k), lab = document.getElementById('vol-' + k + '-val');
    const show = () => { lab.textContent = Math.round(settings.vol[k] * 100) + '%'; };
    el.value = Math.round(settings.vol[k] * 100); show();
    el.oninput = () => { settings.vol[k] = el.value / 100; show(); Sfx.setVolumes(settings.vol); saveSettings(); };
    el.onchange = () => { if (k === 'sfx' || k === 'master') { Sfx.init(); Sfx.setVolumes(settings.vol); Sfx.thump(140, 0.12, 0.4); Sfx.burst(1800, 0.08, 0.2); } };   // a test sound
  }

  // ---------- keybinds ----------
  const keyName = code => {
    if (!code) return '—';
    const special = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=',
      BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
    if (special[code]) return special[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  };
  let listening = null;                // { action, slot, el } while waiting for a key
  const bindsEl = document.getElementById('binds');
  function drawBinds() {
    bindsEl.innerHTML = '';
    for (const a in DEFAULT_BINDS) {
      const row = document.createElement('div'); row.className = 'bind-row';
      const lab = document.createElement('span'); lab.textContent = BIND_NAMES[a]; row.appendChild(lab);
      for (let slot = 0; slot < 2; slot++) {
        const b = document.createElement('button');
        b.className = 'bind-key' + (binds[a][slot] ? '' : ' empty');
        b.textContent = keyName(binds[a][slot]);
        b.onclick = () => {
          if (listening) listening.el.classList.remove('listening');
          listening = { action: a, slot, el: b };
          b.classList.add('listening'); b.textContent = 'press a key…';
        };
        row.appendChild(b);
      }
      bindsEl.appendChild(row);
    }
    // the on-screen hints follow the interact key
    const ik = keyName(binds.interact[0] || binds.interact[1]);
    document.querySelectorAll('.bind-interact').forEach(el => { el.textContent = ik; });
    refreshGameKeys();
  }
  // capture the next key press while a bind button is waiting (before anything else sees it)
  window.addEventListener('keydown', (e) => {
    if (!listening) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const { action, slot } = listening;
    if (e.code === 'Escape') { listening = null; drawBinds(); return; }
    if (e.code === 'Delete') { binds[action][slot] = null; listening = null; drawBinds(); saveSettings(); return; }
    if (RESERVED.includes(e.code)) { listening.el.textContent = keyName(e.code) + ' is reserved'; return; }
    // a key can only do one thing: take it off anything else that had it
    for (const a in binds) for (let k = 0; k < 2; k++) if (binds[a][k] === e.code) binds[a][k] = null;
    binds[action][slot] = e.code;
    listening = null; drawBinds(); saveSettings();
  }, true);
  document.getElementById('binds-reset').onclick = () => {
    for (const a in DEFAULT_BINDS) binds[a] = DEFAULT_BINDS[a].slice();
    listening = null; drawBinds(); saveSettings();
  };
  const isBind = (action, code) => binds[action].includes(code);

  const mapEl = document.getElementById('map');
  mapEl.value = settings.map;
  mapEl.onchange = () => { settings.map = mapEl.value; saveSettings(); location.reload(); };

  // ---------- three.js ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050608);
  scene.fog = new THREE.FogExp2(0x050608, 0.03);

  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const flashlight = new THREE.SpotLight(0xfff0d8, 1.8, 32, 0.42, 0.5, 1.4);
  flashlight.position.set(0.2, -0.15, 0);
  flashlight.target.position.set(0.05, -0.2, -6);
  camera.add(flashlight, flashlight.target);

  Sfx.loadClips();                     // real recordings from sounds/, if any (otherwise synthesized)
  World.build(scene, settings.map);
  Arms.init(scene);
  LedgeHint.init(scene, document.getElementById('prompt'));
  const player = new Player(World);

  // ---------- debug minimap (M) ----------
  const minimap = document.getElementById('minimap');
  let showMap = false;
  let mapBase = null;            // one picture per floor
  const MAP_PX = 5;
  if (World.layout && World.layout.floors) {
    const Lay = World.layout;
    minimap.width = Lay.W * MAP_PX; minimap.height = Lay.H * MAP_PX;
    const COLORS = {
      '#': '#0b0b0b', '.': '#5a554c', D: '#7a6a4a', V: '#3f7fbf', v: '#3f7fbf', H: '#d0b040', O: '#d0702a', W: '#58b058',
      L: '#58b058', b: '#a0603a', k: '#8a7a5a', j: '#8a7a5a', n: '#8a7a5a', q: '#8a7a5a', l: '#8a7a5a', f: '#7a6a5a',
      w: '#2a2a2a', g: '#2a2a2a', t: '#6a6252', S: '#e0d0a0', X: '#4a7a5a', B: '#9a7a7a', s: '#9a8a6a',
      y: '#26331c', Z: '#141414', h: '#1a2a12', T: '#3a2a1a', G: '#5a5a58', o: '#7aa0d0', E: '#c04030', ' ': '#000', _: '#151310',
      c: '#9aa', u: '#9aa', i: '#9aa', F: '#5a3a2a', e: '#333', r: '#888', d: '#9a8a6a', z: '#9a8a6a', C: '#8a3030', K: '#c0a060', p: '#2a2a2a', Q: '#6a6a6a',
    };
    mapBase = Lay.floors.map(grid => {
      const cv = document.createElement('canvas');
      cv.width = minimap.width; cv.height = minimap.height;
      const g = cv.getContext('2d');
      for (let r = 0; r < Lay.H; r++) for (let c = 0; c < Lay.W; c++) {
        g.fillStyle = COLORS[grid[r][c]] || '#5a554c';
        g.fillRect(c * MAP_PX, r * MAP_PX, MAP_PX, MAP_PX);
      }
      return cv;
    });
  }
  const playerFloor = () => (!World.storey ? 0 : player.pos.y > World.storey - 1.2 ? 1 : player.pos.y < -1.8 ? 2 : 0);
  const FLOOR_NAMES = ['GROUND FLOOR', 'UPSTAIRS', 'BASEMENT'];
  // ---------- objective HUD ----------
  const interactEl = document.getElementById('interact'), interactText = document.getElementById('interact-text');
  const interactFill = document.getElementById('interact-fill');
  const toastEl = document.getElementById('toast');
  const invKeys = document.getElementById('inv-keys'), invParts = document.getElementById('inv-parts'), invCode = document.getElementById('inv-code');
  const keypadEl = document.getElementById('keypad');
  let lastInv = {};
  const hideShade = document.getElementById('hideshade'), winEl = document.getElementById('win');
  let lastPrompt = null;
  const hurtEl = document.getElementById('hurt'), deadEl = document.getElementById('dead');
  let camShake = 0;
  HealthBar.init(document.getElementById('hud'));
  const ui = {
    prompt(text, progress = 0) {
      if (text) text = text.replace('[E]', '[' + keyName(binds.interact[0] || binds.interact[1]) + ']');
      if (text !== lastPrompt) { interactText.textContent = text || ''; interactEl.classList.toggle('show', !!text); lastPrompt = text; }
      interactEl.classList.toggle('holding', progress > 0.01);
      interactFill.style.width = (Math.min(1, progress) * 100).toFixed(1) + '%';
    },
    toast(text) { if (text) toastEl.textContent = text; toastEl.classList.toggle('show', !!text); },
    setInventory(inv) {
      const row = (el, show, text, done, changed) => {
        el.classList.toggle('show', show); el.classList.toggle('done', !!done);
        el.querySelector('span').textContent = text;
        if (changed) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
      };
      const found = inv.keys + inv.keysUsed;
      // totals only show once you know them (a note told you, or you saw the padlocks yourself)
      const allOpen = inv.keyTotal && inv.keysUsed >= inv.keyTotal;
      row(invKeys, found > 0, allOpen ? 'PADLOCKS OPEN' : 'KEYS ' + found + (inv.keyTotal ? '/' + inv.keyTotal : '') + (inv.keysUsed ? '  (' + inv.keysUsed + ' used)' : ''), allOpen, found !== lastInv.found);
      row(invParts, inv.parts > 0, inv.fitted ? 'CRANK FITTED' : inv.crank ? 'CRANK HANDLE' : inv.partTotal ? 'CRANK PARTS ' + inv.parts + '/' + inv.partTotal : 'IRON PIECES ' + inv.parts, inv.fitted, inv.parts !== lastInv.parts || inv.crank !== lastInv.crank);
      row(invCode, !!inv.code, inv.codeOk ? 'LOCK OPEN' : (inv.code || ''), inv.codeOk, inv.code !== lastInv.code);
      lastInv = { found, parts: inv.parts, code: inv.code, crank: inv.crank };
    },
    keypad(show, entry = '', known = null, state = '') {
      keypadEl.classList.toggle('show', show);
      keypadEl.classList.toggle('bad', state === 'bad');
      keypadEl.classList.toggle('good', state === 'good');
      const spans = keypadEl.querySelectorAll('.kp-digits span');
      for (let i = 0; i < 4; i++) spans[i].textContent = entry[i] || '_';
      keypadEl.querySelector('.kp-known').textContent = known ? 'the tag from the well said: ' + known.split('').join(' ') : '';
    },
    setHidden(h) { hideShade.classList.toggle('show', h); },
    setHealth(hp, hurt) {
      HealthBar.set(hp, hurt);
      if (hurt) { hurtEl.classList.remove('flash'); void hurtEl.offsetWidth; hurtEl.classList.add('flash'); camShake = Math.max(camShake, 1); }
    },
    note(text) {
      if (text) document.getElementById('note-text').textContent = text;
      document.getElementById('note').classList.toggle('show', !!text);
    },
    win({ time, searched, total }) {
      const m = Math.floor(time / 60), s = Math.floor(time % 60);
      document.getElementById('win-stats').innerHTML =
        `Time: ${m}:${String(s).padStart(2, '0')}<br>Drawers searched: ${searched} / ${total}`;
      winEl.classList.remove('hidden');
      ui.prompt(null);
      document.exitPointerLock();
    },
  };
  Game.init({ world: World, player, scene, camera, ui });
  Props.init({ world: World, scene, camera, player, game: Game });

  // ---------- the entity: roams the house, chases you, crawls through doorways ----------
  const entity = World.mapName === 'house' ? EntityAI.create({ world: World, scene, player, game: Game }) : null;

  // ---------- its sounds: heavy footsteps (heavier the closer it is), the screech, a heartbeat while it hunts you ----------
  let heartT = 0;
  function entitySounds(dt) {
    if (!entity) return;
    const panOf = (x, z) => {
      const dx = x - player.pos.x, dz = z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;      // -1 left .. 1 right
    };
    // through a floor it's further (and duller) than it looks
    const distTo = (x, z, y = player.pos.y) => Math.hypot(x - player.pos.x, z - player.pos.z, (y - player.pos.y) * 1.6);
    for (const ev of entity.events) {
      const d = distTo(ev.x, ev.z, ev.y);
      if (ev.type === 'step') {
        // how close: falls off steeply, so 3 m / 10 m / 25 m sound clearly different (and silent past ~45 m)
        const flat = Math.hypot(ev.x - player.pos.x, ev.z - player.pos.z), dy = (ev.y || 0) - player.pos.y;
        const through = Math.abs(dy) > 2.6 ? (dy > 0 ? 'above' : 'below') : null;   // a floor between you
        const dd = Math.hypot(flat, dy);
        const near = dd > 45 ? 0 : Math.exp(-dd / 8) * (1 - dd / 45 * 0.3);
        // direction around your head: right, up, back (the listener faces -z)
        const ex = ev.x - player.pos.x, ez = ev.z - player.pos.z, cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
        const rel = { x: ex * cy - ez * sy, y: dy, z: ex * sy + ez * cy };
        Sfx.entityStep({ near, rel, through, crawl: ev.crawl });
        camShake = Math.max(camShake, near * near * near * (through ? 0.35 : 0.8));   // the floor shakes when it's close
      } else if (ev.type === 'screech') Sfx.screech(panOf(ev.x, ev.z), 0.4 + 0.35 * Math.max(0, 1 - d / 20));
      else if (ev.type === 'swipe') Sfx.swipe(panOf(ev.x, ev.z));
      else if (ev.type === 'spawn') Sfx.garageDoor(Math.max(0.15, 1 - d / 45));          // heard through the whole house, louder nearer the cellar
    }
    entity.events.length = 0;
    // heartbeat while it's hunting you: faster (and louder) the closer it is
    if (entity.hunting && !Game.dead && !monsterFrozen) {
      const p = entity.pos, k = Math.max(0, Math.min(1, 1 - distTo(p.x, p.z, p.y) / 22));
      if ((heartT -= dt) <= 0) { Sfx.heartbeat(k); heartT = 60 / (80 + 100 * k); }
    } else heartT = 0;
  }

  // ---------- noise meter: how much noise you're making, and how far it carries ----------
  // It reads the same noises the monster hears (drawers, things you throw, the well, the lock, landing hard,
  // sliding). Footsteps only nudge the bottom of it: the monster doesn't listen for them.
  const noiseEl = document.getElementById('noisemeter');
  const NM_SEGS = 14, NM_FULL = 26;                      // full bar = a drawer opening (~26 m)
  const nmBar = noiseEl.querySelector('.nm-bar'), nmText = noiseEl.querySelector('.nm-text');
  const nmSegs = [];
  for (let i = 0; i < NM_SEGS; i++) {
    const d = document.createElement('div');
    d.className = 'nm-seg ' + (i < 4 ? 'g' : i < 9 ? 'y' : 'r');
    nmBar.appendChild(d); nmSegs.push(d);
  }
  const nmPeakEl = document.createElement('div'); nmPeakEl.className = 'nm-peak'; nmBar.appendChild(nmPeakEl);
  let nmLevel = 0, nmShown = -1, nmPeak = 0, nmPeakT = 0, nmRadius = 0, landNoise = 0;
  function noiseMeter(dt) {
    const N = entity ? entity.tuning.noise : { slide: 5, land: 10, rummage: 10, drawer: 26 };
    let r = 0;
    for (const ev of Game.events) if (ev.type === 'noise') r = Math.max(r, N[ev.kind] || ev.radius || 10);
    if (player.sliding) r = Math.max(r, N.slide);
    if (landNoise > 0) { r = Math.max(r, landNoise); landNoise = 0; }
    let quiet = 0;                                       // footsteps: shown, but below what it listens for
    if (player.grounded && player.hSpeed > 1 && !Game.hidden) quiet = player.sprinting ? 0.1 : player.crouching ? 0.03 : 0.06;
    const target = Math.max(quiet, Math.min(1, r / NM_FULL));
    if (r > 0) nmRadius = Math.max(r, target >= nmLevel ? r : nmRadius);
    nmLevel = target > nmLevel ? target : Math.max(target, nmLevel - dt * 0.9);     // jumps up, falls back slowly
    if (nmLevel >= nmPeak) { nmPeak = nmLevel; nmPeakT = 1.2; } else if ((nmPeakT -= dt) <= 0) nmPeak = Math.max(nmLevel, nmPeak - dt * 0.6);
    const lit = Math.round(nmLevel * NM_SEGS);
    if (lit !== nmShown) {
      for (let i = 0; i < NM_SEGS; i++) nmSegs[i].classList.toggle('on', i < lit || (i === 0 && nmLevel > 0.01));
      nmShown = lit;
    }
    nmPeakEl.style.left = (3 + Math.min(NM_SEGS - 1, Math.floor(nmPeak * NM_SEGS)) * 11) + 'px';
    nmPeakEl.style.opacity = nmPeak > 0.12 ? 0.9 : 0;
    const loud = nmLevel > 0.62, noisy = !loud && nmLevel > 0.14;
    if (nmLevel <= 0.14) nmRadius = 0;
    noiseEl.classList.toggle('loud', loud); noiseEl.classList.toggle('noisy', noisy);
    nmText.textContent = loud ? 'LOUD  ~' + Math.round(nmRadius) + ' m' : noisy ? 'NOISY  ~' + Math.round(nmRadius) + ' m' : 'QUIET';
  }

  // ---------- game over: it gets you ----------
  let deathT = -1;
  function updateDeath(dt) {
    if (!Game.dead || !entity) return;
    if (deathT < 0) {
      deathT = 0;
      entity.startJumpscare(camera);
      Sfx.jumpscare();
      flashlight.visible = true; flashlight.intensity = 1.8;
      document.getElementById('hud').style.visibility = 'hidden';
    }
    deathT += dt;
    entity.updateJumpscare(dt);
    if (deathT > 1.6 && deadEl.classList.contains('hidden')) {
      deadEl.classList.remove('hidden');
      document.exitPointerLock();
    }
  }
  document.getElementById('retry').onclick = () => location.reload();

  // ---------- eerie atmosphere (house only): dust in the flashlight beam, film grain, a flashlight that falters ----------
  const eerie = World.mapName === 'house';
  let dust = null;
  const DUST_N = 450, DUST_BOX = 12;
  const camDir = new THREE.Vector3();
  if (eerie) {
    const pos = new Float32Array(DUST_N * 3), vel = new Float32Array(DUST_N * 3);
    for (let i = 0; i < DUST_N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * DUST_BOX; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = (Math.random() - 0.5) * DUST_BOX;
      vel[i * 3] = (Math.random() - 0.5) * 0.04; vel[i * 3 + 1] = (Math.random() - 0.6) * 0.03; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // only visible inside the flashlight cone, so it looks like dust caught in the light
    const mat = new THREE.ShaderMaterial({
      uniforms: { camPos: { value: new THREE.Vector3() }, camDir: { value: new THREE.Vector3() }, on: { value: 1 } },
      vertexShader: `
        uniform vec3 camPos; uniform vec3 camDir; uniform float on; varying float vA;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 d = wp.xyz - camPos; float dist = length(d);
          float cone = smoothstep(0.9, 0.975, dot(d / dist, camDir));
          vA = on * cone * smoothstep(8.0, 1.5, dist) * smoothstep(0.25, 0.7, dist);
          gl_PointSize = clamp(14.0 / dist, 1.0, 5.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          gl_FragColor = vec4(0.9, 0.85, 0.75, vA * (1.0 - r * 2.0) * 0.55);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    dust = new THREE.Points(geo, mat);
    dust.frustumCulled = false;
    dust.userData.vel = vel;
    scene.add(dust);
  }
  function updateDust(dt) {
    if (!dust) return;
    const p = dust.geometry.attributes.position.array, v = dust.userData.vel, c = camera.position, H = DUST_BOX / 2;
    for (let i = 0; i < DUST_N; i++) {
      const k = i * 3;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      // keep every mote in a box around the player (wrap around)
      if (p[k] - c.x > H) p[k] -= DUST_BOX; else if (p[k] - c.x < -H) p[k] += DUST_BOX;
      if (p[k + 2] - c.z > H) p[k + 2] -= DUST_BOX; else if (p[k + 2] - c.z < -H) p[k + 2] += DUST_BOX;
      if (p[k + 1] < 0) p[k + 1] += 4; else if (p[k + 1] > 4) p[k + 1] -= 4;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    camera.getWorldDirection(camDir);
    dust.material.uniforms.camPos.value.copy(c);
    dust.material.uniforms.camDir.value.copy(camDir);
    dust.material.uniforms.on.value = flashlight.visible ? flashlight.intensity / 1.8 : 0;
  }

  // the flashlight occasionally falters for a moment
  let flickNext = 10 + Math.random() * 20, flickT = 0;
  function updateFlashlight(dt) {
    if (!eerie) return;
    if (flickT > 0) {
      flickT -= dt;
      flashlight.intensity = Math.random() < 0.5 ? 0.15 + Math.random() * 0.3 : 1.8;
      if (flickT <= 0) flashlight.intensity = 1.8;
    } else if ((flickNext -= dt) <= 0) {
      flickT = 0.25 + Math.random() * 0.6;
      flickNext = 12 + Math.random() * 30;
    }
  }

  // film grain: shift a noise tile around every frame
  const grainEl = document.getElementById('grain');
  if (eerie) {
    const gc = document.createElement('canvas'); gc.width = gc.height = 200;
    const gg = gc.getContext('2d'), img = gg.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    gg.putImageData(img, 0, 0);
    grainEl.style.backgroundImage = `url(${gc.toDataURL()})`;
    grainEl.classList.add('show');
  }
  document.getElementById('again').onclick = () => location.reload();

  function drawMinimap() {
    if (!showMap || !mapBase) return;
    const Lay = World.layout, g = minimap.getContext('2d'), pf = playerFloor();
    g.drawImage(mapBase[pf], 0, 0);
    g.fillStyle = '#e0c070'; g.font = 'bold 12px Consolas, monospace'; g.fillText(FLOOR_NAMES[pf], 6, 14);
    const px = (player.pos.x / Lay.CELL + Lay.W / 2) * MAP_PX, pz = (player.pos.z / Lay.CELL + Lay.H / 2) * MAP_PX;
    g.fillStyle = '#ff3b2f';
    g.beginPath(); g.arc(px, pz, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ff3b2f'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(px, pz); g.lineTo(px - Math.sin(player.yaw) * 10, pz - Math.cos(player.yaw) * 10); g.stroke();
    if (entity && entity.arrived) {
      const p = entity.pos, ex = (p.x / Lay.CELL + Lay.W / 2) * MAP_PX, ez = (p.z / Lay.CELL + Lay.H / 2) * MAP_PX;
      g.fillStyle = g.strokeStyle = entity.state === 'chase' ? '#ff00ff' : '#e8e8e8';
      g.globalAlpha = entity.floor === pf ? 1 : 0.35;                // faded = on the other floor
      g.beginPath(); g.arc(ex, ez, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(ex, ez); g.lineTo(ex + Math.sin(entity.yaw) * 12, ez + Math.cos(entity.yaw) * 12); g.stroke();
      g.globalAlpha = 1;
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- input ----------
  const keys = new Set();
  let GAME_KEYS = new Set();
  function refreshGameKeys() {
    GAME_KEYS = new Set(['Tab', 'Digit0', 'Digit1', 'Numpad0', 'Numpad1']);
    for (const a in binds) for (const k of binds[a]) if (k) GAME_KEYS.add(k);
  }
  const input = { fwd: 0, side: 0, sprint: false, crouch: false, jumpHeld: false, jumpPressed: false, crouchPressed: false, eHeld: false, ePressed: false };
  let monsterFrozen = false;   // mode 1 (press 1): the monster stands still; mode 0 (press 0): normal game
  let typed = '';   // last few letters typed, for the "key" / "prox" test cheats
  const held = action => binds[action].some(k => k && keys.has(k));
  const crouchHeld = () => held('crouch');
  let locked = false;
  let showDebug = true;

  window.addEventListener('keydown', (e) => {
    if (locked && (GAME_KEYS.has(e.code) || e.ctrlKey)) e.preventDefault();
    if (!locked) return;
    if (e.code === 'Escape') { document.exitPointerLock(); return; }
    if (Game.typing && (/^[0-9]$/.test(e.key) || e.key === 'Backspace')) { e.preventDefault(); if (!e.repeat) Game.keypadKey(e.key); return; }
    if (!keys.has(e.code)) {
      if (e.key && e.key.length === 1) {
        typed = (typed + e.key.toLowerCase()).slice(-4);
        if (typed.endsWith('key')) { Game.toggleReveal(); typed = ''; }
        if (typed === 'prox' && entity) { Game.toast(entity.toggleProx() ? '[test] Entity sight radius shown' : '[test] Sight radius hidden', 2); typed = ''; }
      }
      // modes: 0 = normal game, 1 = the monster is frozen (it stops moving, hearing and attacking)
      if (entity && (e.code === 'Digit0' || e.code === 'Numpad0') && monsterFrozen) { monsterFrozen = false; Game.toast('Mode 0: normal game', 2); }
      if (entity && (e.code === 'Digit1' || e.code === 'Numpad1') && !monsterFrozen) { monsterFrozen = true; Game.toast('Mode 1: monster frozen', 2); }
      if (isBind('interact', e.code)) input.ePressed = true;
      if (isBind('jump', e.code)) input.jumpPressed = true;
      if (isBind('crouch', e.code) && !crouchHeld()) input.crouchPressed = true;
      if (isBind('respawn', e.code) && !Game.dead) { Props.drop(); Game.onRespawn(); player.reset(); }
      if (isBind('flashlight', e.code)) flashlight.visible = !flashlight.visible;
      if (isBind('debug', e.code)) { showDebug = !showDebug; debugEl.style.display = showDebug ? '' : 'none'; }
      if (isBind('map', e.code) && mapBase) { showMap = !showMap; minimap.style.display = showMap ? 'block' : 'none'; }
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); });
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return; // ignore browser glitches
    const s = settings.sens * 0.0007;
    player.yaw -= e.movementX * s;
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * s));
  });

  function readInput() {
    input.fwd = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0);
    input.side = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    input.sprint = held('sprint');
    input.crouch = crouchHeld();
    input.jumpHeld = held('jump');
    input.eHeld = held('interact');
  }
  drawBinds();

  // ---------- pointer lock / fullscreen / pause ----------
  function lockPointer() {
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true }); // raw mouse input, no OS accel
      if (p && p.catch) p.catch(() => canvas.requestPointerLock());
    } catch (e) { canvas.requestPointerLock(); }
  }

  // ---------- menu screens: main / settings / quit ----------
  const screens = {
    main: document.getElementById('screen-main'),
    settings: document.getElementById('screen-settings'),
    quit: document.getElementById('screen-quit'),
  };
  const quitBtn = document.getElementById('btn-quit');
  const hudEl = document.getElementById('hud');
  hudEl.style.visibility = 'hidden';                             // no HUD behind the menu
  let started = false;      // has the player entered the game yet (then the menu is a pause menu)
  function showScreen(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
  }
  document.getElementById('btn-settings').addEventListener('click', () => showScreen('settings'));
  document.getElementById('btn-back').addEventListener('click', () => showScreen('main'));
  document.getElementById('btn-unquit').addEventListener('click', () => showScreen('main'));
  quitBtn.addEventListener('click', () => {
    if (started) { location.reload(); return; }                 // pause menu: quit back to the title screen
    window.close();                                              // only works if a script opened this tab...
    setTimeout(() => showScreen('quit'), 150);                   // ...otherwise tell the player they can close it
  });
  window.addEventListener('keydown', (e) => {                    // Esc backs out of settings
    if (!locked && e.code === 'Escape' && !screens.settings.classList.contains('hidden')) showScreen('main');
  });

  // title screen music: starts on the first click / key press (browsers block sound before that)
  const menuMusic = () => { if (started) return; Sfx.init(); Sfx.menuMusicStart(); };
  window.addEventListener('pointerdown', menuMusic);
  window.addEventListener('keydown', menuMusic);

  startBtn.addEventListener('click', () => {
    Sfx.init();
    if (eerie) Sfx.ambience();
    if (settings.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    lockPointer();
  });

  // Keyboard lock lets the game receive Ctrl+W / Ctrl+S etc. instead of the browser (Chrome/Edge, fullscreen only)
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) {
      navigator.keyboard.lock([...GAME_KEYS, 'KeyK', 'KeyY', 'KeyP', 'KeyO', 'KeyX', 'KeyW', 'KeyS']).catch(() => {});
    }
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    menu.classList.toggle('hidden', locked || Game.won || Game.dead);
    if (locked) { started = true; Sfx.menuMusicStop(); }
    hudEl.style.visibility = locked && !Game.dead ? 'visible' : 'hidden';
    if (!locked) {
      keys.clear();
      Sfx.slideStop();
      showScreen('main');
      startBtn.textContent = 'RESUME';
      quitBtn.textContent = 'QUIT TO MENU';
    }
    last = performance.now();
    acc = 0;
  });

  // Safety net if the browser still catches Ctrl+W
  window.addEventListener('beforeunload', (e) => {
    if (locked) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- loop ----------
  const STEP = 1 / 120; // fixed physics rate, camera is interpolated for smoothness
  let last = performance.now();
  let acc = 0;
  let fps = 60;

  function handleEvents() {
    for (const ev of player.events) {
      if (ev.type === 'step') Sfx.step(ev.kind);
      else if (ev.type === 'jump') Sfx.jump();
      else if (ev.type === 'slideJump') Sfx.burst(1600, 0.18, 0.3);
      else if (ev.type === 'vault') { Sfx.vault(); if (ev.high) Sfx.strain(); }
      else if (ev.type === 'vaultOver') Sfx.burst(1200, 0.25, 0.22);
      else if (ev.type === 'vaultEnd') Sfx.step('walk');
      else if (ev.type === 'climbStart' || ev.type === 'climbStep') Sfx.climb(ev.kind);
      else if (ev.type === 'land') { Sfx.land(ev.impact); if (ev.impact > 8) { landNoise = entity ? entity.tuning.noise.land : 10; if (entity) entity.noise(player.pos.x, player.pos.z, entity.tuning.noise.land, player.pos.y); } }
      else if (ev.type === 'slideStart') Sfx.slideStart();
      else if (ev.type === 'slideEnd') Sfx.slideStop();
    }
    player.events.length = 0;
    if (player.sliding) Sfx.slideUpdate(player.hSpeed);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;

    const frozen = Game.hidden || Game.won || Game.dead;
    if (locked) {
      readInput();
      if (!frozen) {
        acc += dt;
        while (acc >= STEP) {
          player.update(STEP, input);
          input.jumpPressed = false;   // one-shot presses are consumed by the first step
          input.crouchPressed = false;
          acc -= STEP;
        }
      } else {
        acc = 0;
        input.jumpPressed = input.crouchPressed = false;
      }
    }

    player.updateCamera(camera, dt, frozen ? 1 : acc / STEP, frozen ? { side: 0 } : input, settings.fov);
    if (camShake > 0.001) {                                       // hits and close footsteps shake the view
      const a = camShake * camShake;
      camera.rotation.x += (Math.random() - 0.5) * 0.035 * a;
      camera.rotation.z += (Math.random() - 0.5) * 0.03 * a;
      camera.position.y += (Math.random() - 0.5) * 0.05 * a;
      camShake = Math.max(0, camShake - dt * 2.5);
    }
    Arms.update(camera, player, dt);
    updateFlashlight(dt);
    updateDust(dt);
    if (eerie) grainEl.style.backgroundPosition = `${(Math.random() * 200) | 0}px ${(Math.random() * 200) | 0}px`;
    LedgeHint.update(player, dt, locked && !frozen);
    if (locked && !Game.won && !Game.dead) Props.update(dt, input);
    if (locked) Game.update(dt, input);
    if (locked) noiseMeter(dt);                                  // before the monster hears (and clears) this frame's noises
    if (entity && locked && !Game.won && !Game.dead && !monsterFrozen) entity.update(dt);
    else if (!entity || monsterFrozen) Game.events.length = 0;      // frozen: noises made now are never heard later
    if (locked || Game.dead) entitySounds(dt);
    updateDeath(dt);
    HealthBar.update(dt);
    input.ePressed = false;
    World.update(dt);
    handleEvents();
    updateHud();
    drawMinimap();
    renderer.render(scene, camera);
  }

  function updateHud() {
    const st = player.stamina / P.stamMax;
    staminaFill.style.width = (st * 100).toFixed(1) + '%';
    staminaEl.style.opacity = st >= 0.999 && !player.exhausted ? 0 : 1;
    staminaEl.classList.toggle('exhausted', player.exhausted);

    const hs = player.hSpeed;
    vignette.style.opacity = ((eerie ? 0.6 : 0.35) + Math.min(Math.max((hs - P.walkSpeed) / 6, 0), 1) * 0.4 + (player.exhausted ? 0.2 : 0)).toFixed(3);

    if (showDebug) {
      debugEl.textContent =
        `state    ${player.state}\n` +
        `speed    ${hs.toFixed(2)} m/s\n` +
        `vert     ${player.vel.y.toFixed(2)} m/s\n` +
        `height   ${player.height.toFixed(2)} m\n` +
        `stamina  ${player.stamina.toFixed(0)}${player.exhausted ? '  EXHAUSTED' : ''}\n` +
        `health   ${Game.hp}\n` +
        `pos      ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(2)}, ${player.pos.z.toFixed(1)}\n` +
        (World.storey ? `floor    ${FLOOR_NAMES[playerFloor()].toLowerCase()}\n` : '') +
        (entity ? `entity   ${monsterFrozen ? 'FROZEN  ' : ''}${entity.arrived ? '' : 'not here yet  '}${entity.state} (${FLOOR_NAMES[entity.floor].toLowerCase()})${entity.crawl > 0.05 ? `  crawl ${(entity.crawl * 100).toFixed(0)}%` : ''}\n` : '') +
        `fps      ${fps.toFixed(0)}`;
    }
  }

  requestAnimationFrame(frame);
})();
