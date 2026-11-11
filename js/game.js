// Objective + interaction.
//   Find the 3 keys (in drawers around the house) -> open the 3 padlocks on the front door.
//   Find the 3 crank parts (in a drawer in each bedroom) -> build the crank handle at the workbench in the basement
//   -> fit it to the well in the garden -> wind up the bucket -> the paper inside it has the 4-digit code
//   -> type it into the lock on the front door.
//   Both done -> the door opens -> escape.
// Also: notes, medkits, hiding in lockers, picking things up (props.js), and the "key" test cheat.
const Game = (function () {
  const SEARCH_TIME = 2.5;          // seconds holding E to search a drawer
  const WIND_TIME = 4.5;            // seconds holding E to wind the bucket up the well
  const BUILD_TIME = 3.5;           // seconds holding E at the workbench to put the crank together
  const REACH = 2.3;                // how far you can interact from (m, from your eyes)
  const KEY_COUNT = 3, PART_COUNT = 3;
  const DIFF = typeof Difficulty !== 'undefined' ? Difficulty.cur : { medkits: 4, hp: 100, lockerOnce: false, totals: true };
  const MEDKIT_COUNT = DIFF.medkits;  // how many drawers hold a medkit (set by the difficulty)
  const MAX_HP = DIFF.hp, MEDKIT_HEAL = 25;

  // The way out is never told to you up front. The first drawer you open always holds the first note; after that
  // the clues turn up in order, one every drawer or two, until you know the whole way out.
  const INTRO = "If you are reading this, it already knows you are here.\n\nThe front door will not open for you. Not yet.\n\nI hid everything you will need in the drawers of this house. Open them. All of them.\n\nIt hears the drawers. I am sorry. There was no other way.";
  const CLUES = [
    { tag: 'keys', text: "I chained the front door and hung three padlocks on the chain. I gave a key to each of the children.\n\nThey hid them in the drawers, like it was a game.\n\nI can't find the keys now. I can't find the children either." },
    { tag: 'code', text: "There is a second lock, set into the door itself. It wants four numbers.\n\nI wrote them on a scrap of paper and put it in the bucket of the garden well. Then I let the bucket down, all the way to the bottom." },
    { tag: 'crank', text: "I took the crank off the well winch and broke it into three pieces, so it could never be wound up again.\n\nOne piece went into a drawer in each of the bedrooms upstairs." },
    { tag: 'bench', text: "The crank pieces won't hold together in your hands. Father's vise is on the workbench in the cellar. The cellar doors are out in the garden, by the ladder.\n\nIt follows you down there too. It has to crawl. It still follows." },
  ];
  // the rest: things the family learned about it, found at random once the clues are out
  const LORE = [
    "Day 12.\n\nFather says the halls get longer at night. I counted the doors on the way to the kitchen, then again on the way back.\n\nThere was one more the second time.",
    "The vents upstairs drop straight down to the rooms below. So does the rotten floor.\n\nIt cannot follow you down. It has to take the stairs.",
    "It doesn't see well. It HEARS.\n\nThrow something across the room and it goes to look.",
    "Mrs. Hale,\n\nThe lockers are for coats ONLY.\n\n(I have slept in one twice now. If it doesn't see you climb in, it walks right past.)",
    "Every clock in the house stopped at 3:07 the night it came.\n\nI wound the one in the foyer myself. It stopped again before I took my hand away.",
    "If you're upstairs and it's coming up the stairs: the little bedroom window. There's a ladder down to the garden.\n\nIt won't climb.",
    "Don't bother creeping. It doesn't care about footsteps.\n\nIt cares about drawers. Rattling, scraping drawers.",
    "We used to hear it in the walls, before it was ever in the halls.\n\nMother said it was the pipes. Mother stopped saying that.",
  ];
  const JUNK = [
    'Just old letters. The ink has run.',
    'A broken pocket watch.',
    'Candle stubs and spent matches.',
    'A photograph. The faces are scratched out.',
    'Nothing useful.',
    'Moth-eaten gloves.',
    'Empty medicine bottles.',
    'Tarnished silverware.',
  ];
  const PART_NAMES = ['the crank arm', 'the wooden grip', 'the square axle socket'];

  let world, player, scene, camera, ui;
  let items = [], drawers = [], exitDoor = null, keypad = null, well = null, bench = null, partDrawers = [];
  let keyDrawers = [], lore = [];
  let target = null, hold = 0, rummageT = 0, windNoiseT = 0, squeakT = 0;
  let toastT = 0, reading = null;
  let reveal = false, revealT = 0;
  const beacons = [];
  const st = {
    active: false, keys: 0, keysUsed: 0, parts: 0, crank: false, code: null, codeKnown: false, codeOk: false,
    won: false, dead: false, hidden: null, searched: 0, time: 0, hp: MAX_HP,
    typing: null, entry: '', entryFlash: 0, entryState: '',
    introDone: false, clue: 0, dry: 0, know: {},         // know.keys / code / crank / bench: what the notes (or your own eyes) have told you
  };
  // things the entity can notice (noises, you getting into a locker). Read + cleared by the entity every frame.
  // Deliberately never shown to the player.
  const events = [];
  const fallen = [];                // lockers the entity has knocked over (animating the fall)
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();

  // ---------- small models ----------
  const M = {};
  function mats() {
    const lin = h => new THREE.Color(h).convertSRGBToLinear();
    M.brass = new THREE.MeshStandardMaterial({ color: lin(0xb08a3a), metalness: 0.9, roughness: 0.35, emissive: lin(0x2a1c05) });
    M.paper = new THREE.MeshStandardMaterial({ color: lin(0xcfc4a8), roughness: 1, side: THREE.DoubleSide });
    M.wax = new THREE.MeshStandardMaterial({ color: lin(0xd8d0b8), roughness: 0.8 });
    M.glass = new THREE.MeshStandardMaterial({ color: lin(0x3a2410), roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.75 });
    M.silver = new THREE.MeshStandardMaterial({ color: lin(0x5a5a58), roughness: 0.4, metalness: 0.8 });
    M.cloth = new THREE.MeshStandardMaterial({ color: lin(0x2a2420), roughness: 1 });
    M.note = new THREE.MeshStandardMaterial({ map: noteTex(), roughness: 1, side: THREE.DoubleSide });
    M.photo = new THREE.MeshStandardMaterial({ map: photoTex(), roughness: 0.7, side: THREE.DoubleSide });
    M.kit = new THREE.MeshStandardMaterial({ color: lin(0xe8e2d4), roughness: 0.6 });
    M.cross = new THREE.MeshStandardMaterial({ color: lin(0xb3161c), roughness: 0.5, emissive: lin(0x300404) });
    M.iron = new THREE.MeshStandardMaterial({ color: lin(0x4a4c4e), roughness: 0.45, metalness: 0.8, emissive: lin(0x14110c) });
    M.wood = new THREE.MeshStandardMaterial({ color: lin(0x4a2c16), roughness: 0.7, emissive: lin(0x120804) });
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function noteTex() {
    return canvasTex(128, 176, (g, w, h) => {
      g.fillStyle = '#d9cfb2'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(40,30,20,0.75)'; g.lineWidth = 1.4;
      for (let y = 18; y < h - 14; y += 11) {
        g.beginPath(); let x = 10; g.moveTo(x, y);
        const end = w - 10 - Math.random() * 30;
        while (x < end) { x += 3 + Math.random() * 4; g.lineTo(x, y + (Math.random() - 0.5) * 4); }
        g.stroke();
      }
      g.fillStyle = 'rgba(80,50,20,0.15)'; g.fillRect(0, h / 2 - 1, w, 2);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,40,20,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
  }
  function photoTex() {
    return canvasTex(96, 128, (g, w, h) => {
      g.fillStyle = '#e8e0cc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a3a2a'; g.fillRect(7, 7, w - 14, h - 30);
      g.fillStyle = '#2a2018';
      for (const x of [28, 50, 70]) { g.beginPath(); g.arc(x, 48, 8, 0, 7); g.fill(); g.fillRect(x - 9, 56, 18, 32); }
      g.strokeStyle = '#120c08'; g.lineWidth = 3;
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(20 + Math.random() * 60, 38 + Math.random() * 20); g.lineTo(20 + Math.random() * 60, 38 + Math.random() * 20); g.stroke(); }
    });
  }
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

  function makeKey(scale = 1) {
    const k = new THREE.Group();
    const bow = mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 16), M.brass, -0.075, 0, 0); bow.rotation.x = Math.PI / 2; k.add(bow);
    k.add(mesh(new THREE.BoxGeometry(0.12, 0.009, 0.013), M.brass, 0.0, 0, 0));
    for (const [x, h] of [[0.04, 0.028], [0.056, 0.02]]) k.add(mesh(new THREE.BoxGeometry(0.009, 0.007, h), M.brass, x, 0, h / 2));
    k.scale.setScalar(scale);
    return k;
  }
  function makeMedkit() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.15, 0.05, 0.1), M.kit, 0, 0.025, 0));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.004, 0.018), M.cross, 0, 0.052, 0));
    g.add(mesh(new THREE.BoxGeometry(0.018, 0.004, 0.06), M.cross, 0, 0.052, 0));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.006), M.silver, 0, 0.03, 0.052));
    return g;
  }
  function makeNote() {
    const n = mesh(new THREE.PlaneGeometry(0.15, 0.2), M.note, 0, 0.004, 0);
    n.rotation.x = -Math.PI / 2;
    const g = new THREE.Group(); g.add(n); return g;
  }
  // the three pieces of the well crank
  function makePart(i) {
    const g = new THREE.Group();
    if (i === 0) {                                   // the bent iron arm
      const a = mesh(new THREE.BoxGeometry(0.42, 0.035, 0.05), M.iron, 0, 0.025, 0); g.add(a);
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.035, 0.12), M.iron, 0.2, 0.025, 0.05));
    } else if (i === 1) {                            // the wooden grip
      const gr = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), M.wood, 0, 0.035, 0); gr.rotation.z = Math.PI / 2; g.add(gr);
      const pin = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), M.iron, 0, 0.035, 0); pin.rotation.z = Math.PI / 2; g.add(pin);
    } else {                                         // the square socket that fits the axle
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M.iron, 0, 0.05, 0));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), M.iron, 0, 0.05, 0.1));
    }
    return g;
  }
  const JUNK_MODELS = [
    () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const e = mesh(new THREE.BoxGeometry(0.15, 0.006, 0.1), M.paper, (Math.random() - 0.5) * 0.02, 0.003 + i * 0.006, (Math.random() - 0.5) * 0.02); e.rotation.y = (Math.random() - 0.5) * 0.5; g.add(e); } return g; },
    () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const c = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05 + Math.random() * 0.04, 8), M.wax, (i - 1) * 0.035, 0.012, (Math.random() - 0.5) * 0.04); c.rotation.z = Math.PI / 2; c.rotation.y = Math.random(); g.add(c); } return g; },
    () => { const g = new THREE.Group(); const b = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10), M.glass, 0, 0.025, 0); b.rotation.z = Math.PI / 2; g.add(b); const n = mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.04, 8), M.glass, 0.07, 0.025, 0); n.rotation.z = Math.PI / 2; g.add(n); return g; },
    () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), M.brass, 0, 0.006, 0)); const r = mesh(new THREE.TorusGeometry(0.01, 0.003, 4, 10), M.brass, 0, 0.006, -0.038); r.rotation.x = Math.PI / 2; g.add(r); return g; },
    () => { const p = mesh(new THREE.PlaneGeometry(0.09, 0.12), M.photo, 0, 0.003, 0); p.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(p); return g; },
    () => { const g = new THREE.Group(); for (const s of [-1, 1]) { const gl = mesh(new THREE.BoxGeometry(0.07, 0.012, 0.15), M.cloth, s * 0.03, 0.006 + (s > 0 ? 0.01 : 0), 0); gl.rotation.y = s * 0.3; g.add(gl); } return g; },
    () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const sp = mesh(new THREE.BoxGeometry(0.14, 0.005, 0.018), M.silver, 0, 0.004 + i * 0.003, (i - 1) * 0.025); sp.rotation.y = (Math.random() - 0.5) * 0.4; g.add(sp); } return g; },
  ];

  function placeIn(drawer, model, slotsLeft) {
    const a = drawer.area;
    const slot = slotsLeft.splice(Math.floor(Math.random() * slotsLeft.length), 1)[0];
    const sx = slot % 3, sz = Math.floor(slot / 3);
    model.position.set(a.x0 + (sx + 0.5) * (a.x1 - a.x0) / 3, a.y, a.z0 + (sz + 0.5) * (a.z1 - a.z0) / 2);
    model.rotation.y += (Math.random() - 0.5) * 1.2;
    drawer.group.add(model);
    return model;
  }

  // three drawers for the keys: spread out, at least one upstairs and one down
  function chooseKeyDrawers() {
    const dist = (a, b) => Math.hypot(a.focus.x - b.focus.x, (a.focus.y - b.focus.y) * 2, a.focus.z - b.focus.z);
    let best = null, bestScore = -1;
    for (let t = 0; t < 300; t++) {
      const pick = drawers.filter(d => !d.part).sort(() => Math.random() - 0.5).slice(0, KEY_COUNT);
      const floors = new Set(pick.map(d => d.floor));
      if (floors.size < 2 && t < 250) continue;
      let minD = Infinity;
      for (let i = 0; i < pick.length; i++) for (let j = i + 1; j < pick.length; j++) minD = Math.min(minD, dist(pick[i], pick[j]));
      if (minD > 16) return pick;
      if (minD > bestScore) { bestScore = minD; best = pick; }
    }
    return best;
  }

  // ---------- setup ----------
  function init(opts) {
    ({ world, player, scene, camera, ui } = opts);
    items = world.interactables;
    drawers = items.filter(i => i.type === 'drawer');
    exitDoor = items.find(i => i.type === 'exit') || null;
    keypad = items.find(i => i.type === 'keypad') || null;
    well = items.find(i => i.type === 'well') || null;
    bench = items.find(i => i.type === 'bench') || null;
    st.active = drawers.length > 0 && !!exitDoor;
    if (!st.active) return;
    mats();
    st.code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

    // a crank part in one drawer in each bedroom
    const rooms = [...new Set(drawers.filter(d => d.room).map(d => d.room))].sort(() => Math.random() - 0.5).slice(0, PART_COUNT);
    rooms.forEach((room, i) => {
      const list = drawers.filter(d => d.room === room), d = list[Math.floor(Math.random() * list.length)];
      d.part = { name: PART_NAMES[i], index: i };
      partDrawers.push(d);
    });
    // keys in three other drawers, then notes + medkits, junk everywhere
    keyDrawers = chooseKeyDrawers();
    const others = drawers.filter(d => !keyDrawers.includes(d)).sort(() => Math.random() - 0.5);
    lore = LORE.slice().sort(() => Math.random() - 0.5);
    const kitDrawers = new Set(others.slice(0, MEDKIT_COUNT));
    for (const d of drawers) {
      const slots = [0, 1, 2, 3, 4, 5];
      if (keyDrawers.includes(d)) { d.key = placeIn(d, makeKey(1.3), slots); d.key.position.y += 0.006; }
      if (d.part) d.part.mesh = placeIn(d, makePart(d.part.index), slots);
      if (kitDrawers.has(d)) d.medkit = placeIn(d, makeMedkit(), slots);
      const junk = d.key || d.part ? 1 : 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < junk && slots.length > 1; i++) placeIn(d, JUNK_MODELS[Math.floor(Math.random() * JUNK_MODELS.length)](), slots);
      d.slots = slots;                                   // room left for a note
    }

    // test-cheat visuals: drawn on top of everything, ignores fog -> visible from anywhere in the house
    const tex = canvasTex(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,240,150,1)'); grd.addColorStop(0.3, 'rgba(255,200,60,0.6)'); grd.addColorStop(1, 'rgba(255,180,40,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    });
    tex.encoding = THREE.LinearEncoding;
    const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false, sizeAttenuation: false, blending: THREE.AdditiveBlending });
    const beamMat = o => new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) {
      const sprite = new THREE.Sprite(spriteMat); sprite.renderOrder = 1000;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 8, 1, true), beamMat(0.55)); beam.renderOrder = 999;
      sprite.visible = beam.visible = false;
      scene.add(sprite, beam);
      beacons.push({ sprite, beam });
    }
    drawKeypad();
    updateInventory();
    if (well) {
      // a folded scrap of paper wedged in the bucket, the four numbers scrawled on it big enough to read
      const tex = canvasTex(256, 320, (g, w, h) => {
        g.fillStyle = '#ddd2b4'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(70,50,25,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
        g.fillStyle = 'rgba(90,60,30,0.2)'; g.fillRect(0, h / 2 - 2, w, 4); g.fillRect(w / 2 - 2, 0, 4, h);   // fold lines
        g.fillStyle = '#1c120a'; g.font = 'bold 92px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        st.code.split('').forEach((ch, i) => { g.save(); g.translate(w * (0.2 + i * 0.2), h * 0.47 + (Math.random() - 0.5) * 18); g.rotate((Math.random() - 0.5) * 0.25); g.fillText(ch, 0, 0); g.restore(); });
        g.strokeStyle = 'rgba(28,18,10,0.6)'; g.lineWidth = 3;
        for (const [x0, yy] of [[30, 0.72], [40, 0.76]]) {                                                     // underlined twice
          g.beginPath(); g.moveTo(x0, h * yy); for (let x = x0; x < w - 40; x += 8) g.lineTo(x, h * yy + (Math.random() - 0.5) * 6); g.stroke();
        }
      });
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.21), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide, emissive: new THREE.Color(0x1a1408) }));
      paper.position.set(0.02, -0.22, 0.05); paper.rotation.set(-0.45, 0.3, 0.06);          // sticking up out of the bucket
      well.bucket.add(paper);
      well.paper = paper;
      const glow = new THREE.PointLight(0xffe2b0, 0, 1.2, 2); glow.position.set(0, -0.05, 0.25); well.bucket.add(glow); well.paperGlow = glow;
    }
  }

  // ---------- helpers ----------
  function toast(text, secs = 3.2) { ui.toast(text); toastT = secs; }
  function updateInventory() {
    ui.setInventory({ keys: st.keys, keysUsed: st.keysUsed, keyTotal: st.know.keys && DIFF.totals ? KEY_COUNT : 0, parts: st.parts, partTotal: st.know.crank && DIFF.totals ? PART_COUNT : 0, crank: st.crank, fitted: well && well.fitted, code: st.codeKnown ? st.code : null, codeOk: st.codeOk });
  }
  function available(it) {
    if (it.type === 'drawer') return !it.searched || (it.open > 0.8 && (it.key || it.part || it.medkit || it.note));
    if (it.type === 'exit') return !exitDoor.unlocked && it.padlocks.length > 0;
    if (it.type === 'keypad') return !st.codeOk;
    if (it.type === 'locker') return !it.broken && !it.spent;
    if (it.type === 'bench') return !it.done;
    if (it.type === 'well') return !it.done;
    if (it.type === 'prop') return it.alive && !it.held;
    return true;
  }
  function findTarget() {
    camera.getWorldDirection(fwd);
    let best = null, bestDot = 0.72;
    for (const it of items) {
      if (!available(it)) continue;
      tmp.copy(it.focus).sub(camera.position);
      const dist = tmp.length();
      if (dist > (it.reach || REACH)) continue;
      if (it.normal && (player.pos.x - it.focus.x) * it.normal.x + (player.pos.z - it.focus.z) * it.normal.z < 0.05) continue;  // must be in front
      const dot = tmp.dot(fwd) / dist;
      if (dot > bestDot) { bestDot = dot; best = it; }
    }
    return best;
  }

  // ---------- actions ----------
  // put a note in a drawer as it opens
  function giveNote(d, text, intro = false, tag = null) {
    const m = makeNote();
    if (d.slots && d.slots.length) placeIn(d, m, d.slots);
    else { m.position.set(0, d.area.y + 0.02, (d.area.z0 + d.area.z1) / 2); d.group.add(m); }
    d.note = text; d.intro = intro; d.noteTag = tag; d.noteMesh = m;
  }
  // a drawer can hold several things (a key, a medkit, a note...): E takes whichever one you're looking at
  const _ip = new THREE.Vector3();
  function drawerChoice(d) {
    const list = [];
    if (d.key) list.push({ kind: 'key', obj: d.key });
    if (d.part) list.push({ kind: 'part', obj: d.part.mesh });
    if (d.medkit) list.push({ kind: 'medkit', obj: d.medkit });
    if (d.note) list.push({ kind: 'note', obj: d.noteMesh });
    if (list.length <= 1) return { pick: list[0], count: list.length };
    camera.getWorldDirection(fwd);
    let pick = null, best = -2;
    for (const it of list) {
      if (!it.obj) continue;
      it.obj.getWorldPosition(_ip).sub(camera.position).normalize();
      let dot = _ip.dot(fwd);
      if (it.kind === 'note' && d.intro && !d.introRead) dot += 0.004;      // the first note wins a tie
      if (dot > best) { best = dot; pick = it; }
    }
    return { pick: pick || list[0], count: list.length };
  }
  function finishSearch(it) {
    it.searched = true;
    st.searched++;
    if (!st.introDone) { giveNote(it, INTRO, true); st.introDone = true; }
    else if (!it.key && !it.part && st.clue < CLUES.length && (st.dry >= 1 || Math.random() < 0.5)) {
      const c = CLUES[st.clue++]; giveNote(it, c.text, false, c.tag); st.dry = 0;
    } else {
      if (!it.key && !it.part) st.dry++;
      if (!it.key && !it.part && !it.medkit && st.clue >= 2 && lore.length && Math.random() < 0.3) giveNote(it, lore.pop());
    }
    Sfx.drawerSlide();
    events.push({ type: 'noise', kind: 'drawer', x: it.focus.x, y: it.focus.y, z: it.focus.z });
    if (it.intro) toast('There is a note inside.');
    else if (it.key) toast('Something glints inside the drawer.');
    else if (it.part) toast('There is a piece of iron machinery inside.');
    else if (it.medkit) toast('There is a medkit inside.');
    else if (it.note) toast('There is a note inside.');
    else toast(JUNK[Math.floor(Math.random() * JUNK.length)]);
  }
  function takeKey(it) {
    it.group.remove(it.key);
    it.key = null;
    st.keys++;
    Sfx.keyPickup();
    const total = st.keys + st.keysUsed;
    toast(st.know.keys ? (total < KEY_COUNT ? `You took one of the padlock keys.  (${total} of ${KEY_COUNT})` : 'That\'s all three keys.') : 'A small brass key.  It must open something.', 3.5);
    updateInventory();
    if (reveal) placeReveal();
  }
  function takePart(d) {
    const name = d.part.name;
    d.group.remove(d.part.mesh);
    d.part = null;
    st.parts++;
    Sfx.keyPickup(); Sfx.thump(180, 0.08, 0.15);
    toast(!st.know.crank ? 'A heavy piece of iron.  Part of a handle, maybe.'
      : st.parts < PART_COUNT ? `You found ${name} of the well crank.  (${st.parts} of ${PART_COUNT})`
      : `You found ${name}.  That's every piece of the crank.`, 4);
    updateInventory();
    if (reveal) placeReveal();
  }
  function useMedkit(it) {
    if (st.hp >= MAX_HP) { toast("You're not hurt. Save it for later.", 2.2); return; }
    it.group.remove(it.medkit);
    it.medkit = null;
    st.hp = Math.min(MAX_HP, st.hp + MEDKIT_HEAL);
    ui.setHealth(st.hp / MAX_HP * 100, false);
    Sfx.medkit();
    toast('You patch yourself up.  +' + MEDKIT_HEAL + ' health', 2.5);
  }

  // the entity hit you: lose health, get knocked away from it
  function damage(n, fromX, fromZ) {
    if (st.dead || st.won || st.hidden) return;
    st.hp = Math.max(0, st.hp - n);
    ui.setHealth(st.hp / MAX_HP * 100, true);
    Sfx.hurt();
    let dx = player.pos.x - fromX, dz = player.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    player.vel.x += dx * 7; player.vel.z += dz * 7; player.vel.y = Math.max(player.vel.y, 3.2);
    if (st.hp <= 0) { st.dead = true; closeNote(); stopTyping(); ui.prompt(null); if (typeof Props !== 'undefined') Props.drop(); }
  }

  function readNote(text) {
    reading = { x: player.pos.x, z: player.pos.z };
    Sfx.burst(2500, 0.15, 0.08);
    ui.note(text);
  }
  function closeNote() { reading = null; ui.note(null); }

  function hide(locker) {
    st.hidden = locker;
    events.push({ type: 'hide', locker });
    locker.animT = 0.6;
    Sfx.lockerDoor();
    player.vel.set(0, 0, 0);
    player.pos.set(locker.hideAt.x, locker.y || 0, locker.hideAt.z);
    player.prevPos.copy(player.pos);
    player.height = player.prevHeight = P.standHeight;
    player.yaw = locker.yaw; player.pitch = 0;
    if (player.sliding) player.endSlide();
    ui.setHidden(true);
  }
  function leave() {
    const l = st.hidden;
    st.hidden = null;
    l.animT = 0.6;
    Sfx.lockerDoor();
    player.pos.set(l.exitAt.x, l.y || 0, l.exitAt.z);
    player.prevPos.copy(player.pos);
    player.vel.set(0, 0, 0);
    ui.setHidden(false);
    // hard / nightmare: the rusted door won't latch a second time
    if (DIFF.lockerOnce) { l.spent = true; toast("The door sticks behind you. It won't close again.", 2.6); }
  }

  // the entity saw you get in: it knocks the locker over, you're thrown out, and the locker is ruined for good
  function knockLocker(l, fromX, fromZ) {
    if (l.broken) return;
    l.broken = true;
    l.animT = 0;
    Sfx.thump(60, 0.6, 0.6); Sfx.burst(700, 0.5, 0.35); Sfx.lockerDoor();
    const n = l.normal, t = l.along, S = l.size, y0 = l.y || 0;
    world.removeCollider(l.collider);
    const x0 = l.focus.x, z0 = l.focus.z, x1 = x0 + n.x * S.h, z1 = z0 + n.z * S.h;
    const hw = S.w / 2;
    const flat = {
      min: { x: Math.min(x0, x1) - Math.abs(t.x) * hw, y: y0, z: Math.min(z0, z1) - Math.abs(t.z) * hw },
      max: { x: Math.max(x0, x1) + Math.abs(t.x) * hw, y: y0 + S.d, z: Math.max(z0, z1) + Math.abs(t.z) * hw },
    };
    l.fallAxis = new THREE.Vector3(n.z, 0, -n.x);
    l.fallT = 0; l.fallV = 0; l.fallA = 0;
    fallen.push(l);
    if (st.hidden === l) {
      st.hidden = null;
      ui.setHidden(false);
      const away = Math.sign((x0 - fromX) * t.x + (z0 - fromZ) * t.z) || 1;
      const spots = [[away, 0.8], [-away, 0.8], [away, 1.6], [-away, 1.6], [0, S.h + 0.6]];
      let spot = null;
      for (const [s, out] of spots) {
        const x = x0 + n.x * out + t.x * s * (hw + 0.75), z = z0 + n.z * out + t.z * s * (hw + 0.75);
        if (!player.overlapAt(x, y0, z, P.standHeight)) { spot = { x, z, s }; break; }
      }
      if (!spot) spot = { x: x0 + n.x * (S.h + 0.6), z: z0 + n.z * (S.h + 0.6), s: 0 };
      player.pos.set(spot.x, y0, spot.z);
      player.prevPos.copy(player.pos);
      player.vel.set(n.x * 2.5 + t.x * spot.s * 3.5, 2.2, n.z * 2.5 + t.z * spot.s * 3.5);
      player.height = player.prevHeight = P.standHeight;
      player.yaw = Math.atan2(-(n.x + t.x * spot.s), -(n.z + t.z * spot.s));
      player.pitch = -0.1;
    }
    world.boxes.push(flat);
  }
  function updateFallen(dt) {
    for (let i = fallen.length - 1; i >= 0; i--) {
      const l = fallen[i];
      l.fallV += 9 * dt;
      l.fallA += l.fallV * dt;
      if (l.fallA >= Math.PI / 2) {
        l.fallA = Math.PI / 2;
        if (l.fallV > 1.2) { l.fallV *= -0.25; Sfx.thump(50, 0.4, 0.5); } else { l.fallV = 0; fallen.splice(i, 1); }
      }
      l.group.quaternion.setFromAxisAngle(l.fallAxis, l.fallA);
    }
  }

  // ---------- the front door: three padlocks + the combination lock ----------
  const dropping = [];
  function useExit() {
    const left = exitDoor.padlocks.length;
    if (!st.know.keys) { st.know.keys = true; updateInventory(); }
    if (st.keys <= 0) {
      Sfx.lockedRattle();
      toast(left === KEY_COUNT ? 'The door is chained shut.  Three padlocks hold the chain.' : `${left} padlock${left > 1 ? 's' : ''} still hold${left > 1 ? '' : 's'} the chain.  You need another key.`);
      return;
    }
    const lock = exitDoor.padlocks.shift();
    dropping.push({ obj: lock, vy: 0, t: 0 });
    st.keys--; st.keysUsed++;
    Sfx.unlock();
    if (exitDoor.padlocks.length === 0) {
      dropping.push({ obj: exitDoor.chain, vy: 0, t: 0 });
      toast(st.codeOk ? 'The last lock falls away.' : 'The chain slides off.  But the combination lock still holds the door.', 3.5);
    } else toast(`The padlock clicks open and drops.  ${exitDoor.padlocks.length} left.`, 3);
    updateInventory();
    tryOpen();
  }
  function tryOpen() {
    if (exitDoor.unlocked || exitDoor.padlocks.length || !st.codeOk) return;
    exitDoor.unlocked = true;
    world.removeCollider(exitDoor.collider);
    Sfx.doorCreak();
    setTimeout(() => toast('The door swings open.  RUN.', 3), 600);
    if (reveal) placeReveal();
  }
  function drawKeypad() {
    if (!keypad) return;
    const g = keypad.screen.getContext('2d'), w = keypad.screen.width, h = keypad.screen.height;
    g.fillStyle = '#0d0a06'; g.fillRect(0, 0, w, h);
    const digits = st.codeOk ? st.code : st.entry.padEnd(4, '_');
    const col = st.entryState === 'bad' ? '#ff3a2a' : st.entryState === 'good' || st.codeOk ? '#7dff7a' : st.typing ? '#ffe2a0' : '#9a7a40';
    for (let i = 0; i < 4; i++) {
      const x = 14 + i * 60;
      g.fillStyle = '#1e1810'; g.fillRect(x, 10, 50, h - 20);
      g.strokeStyle = '#5a4520'; g.lineWidth = 3; g.strokeRect(x, 10, 50, h - 20);
      g.fillStyle = col; g.font = 'bold 56px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(digits[i], x + 25, h / 2 + 3);
    }
    keypad.screenTex.needsUpdate = true;
  }
  function startTyping() {
    st.typing = { x: player.pos.x, z: player.pos.z };
    st.entry = ''; st.entryState = '';
    Sfx.tone(900, 0.05, 0.05, 'square');
    ui.keypad(true, st.entry, st.codeKnown ? st.code : null);
    drawKeypad();
  }
  function stopTyping() {
    if (!st.typing) return;
    st.typing = null; st.entry = ''; st.entryState = '';
    ui.keypad(false);
    drawKeypad();
  }
  // a number key while you're at the lock
  function keypadKey(k) {
    if (!st.typing || st.entryFlash > 0) return false;
    if (k === 'Backspace') { st.entry = st.entry.slice(0, -1); Sfx.tone(600, 0.04, 0.04, 'square'); }
    else if (/^[0-9]$/.test(k) && st.entry.length < 4) {
      st.entry += k;
      Sfx.thump(400 + Math.random() * 60, 0.03, 0.12); Sfx.tone(1400, 0.03, 0.03, 'square');
      if (st.entry.length === 4) {
        if (st.entry === st.code) {
          st.entryState = 'good'; st.codeOk = true; st.entryFlash = 0.9;
          Sfx.unlock(); Sfx.tone(1200, 0.12, 0.08, 'triangle', 0.1); Sfx.tone(1800, 0.2, 0.08, 'triangle', 0.22);
          toast(exitDoor.padlocks.length ? 'The combination lock clunks open.  Now the padlocks.' : 'The combination lock clunks open.', 3.5);
          updateInventory();
        } else {
          st.entryState = 'bad'; st.entryFlash = 0.8;
          Sfx.lockedRattle(); Sfx.buzz();
          events.push({ type: 'noise', kind: 'buzz', x: keypad.focus.x, y: keypad.focus.y, z: keypad.focus.z, radius: 14 });
        }
      }
    } else return false;
    ui.keypad(true, st.entry, st.codeKnown ? st.code : null, st.entryState);
    drawKeypad();
    return true;
  }

  // ---------- the well ----------
  function useWell(input, dt) {
    const w = well;
    if (!w.fitted) {
      ui.prompt(st.crank ? '[E]  Fit the crank handle' : '[E]  The well', 0);
      if (!input.ePressed) return;
      if (st.crank) {
        w.fitted = true; w.crank.visible = true;
        Sfx.thump(150, 0.1, 0.4); Sfx.burst(2800, 0.08, 0.15); Sfx.thump(90, 0.2, 0.3);
        toast('You fit the crank handle onto the winch.', 3);
        updateInventory();
      } else if (st.parts === 0) toast('An old well. The rope runs down into the dark.  The winch has no crank handle.', 4);
      else if (st.parts < PART_COUNT) toast(`The winch needs a crank. You only have part of it  (${st.parts} of ${PART_COUNT}).`, 3.5);
      else toast(st.know.bench ? 'The pieces won\'t stay together in your hands.  They need the vise in the cellar.' : 'The pieces won\'t stay together in your hands.  They need fixing together properly.', 4);
      return;
    }
    if (!w.raised) {
      if (input.eHeld) {
        hold += dt;
        w.wound = Math.min(1, hold / WIND_TIME);
        // an old winch shrieks as it turns: it carries a long way
        if ((squeakT -= dt) <= 0) { Sfx.squeak(); squeakT = 0.38 + Math.random() * 0.12; }
        if ((windNoiseT -= dt) <= 0) { events.push({ type: 'noise', kind: 'crank', x: w.x, y: 1, z: w.z, radius: 18 }); windNoiseT = 0.5; }
        if (w.wound >= 1) { w.raised = true; hold = 0; Sfx.thump(120, 0.15, 0.35); Sfx.burst(1800, 0.1, 0.12); toast('The bucket comes up out of the dark.  There is a folded paper inside it.', 3.5); }
      }
      ui.prompt(w.raised ? null : 'Hold [E]  Wind up the bucket', w.wound);
      return;
    }
    ui.prompt('[E]  Take the paper from the bucket', 0);
    if (input.ePressed) {
      w.done = true;
      st.codeKnown = true;
      Sfx.keyPickup();
      updateInventory();
      if (w.paper) { w.bucket.remove(w.paper); w.paper = null; }
      readNote(`A scrap of paper, damp from the well.\n\nFour numbers, written hard enough to tear it:\n\n${st.code.split('').join('   ')}`);
      if (reveal) placeReveal();
    }
  }
  // ---------- the workbench in the basement: clamp the three pieces in the vise and hammer them together ----------
  let clankT = 0;
  function useBench(input, dt) {
    if (st.parts < PART_COUNT) {
      ui.prompt('[E]  Workbench', 0);
      if (input.ePressed) toast(st.parts ? `A workbench with a heavy vise.  You only have ${st.parts} of the ${PART_COUNT} crank pieces.` : 'A workbench with a heavy vise and old tools.  You could put something together here.', 3.5);
      return;
    }
    if (input.eHeld) {
      hold += dt;
      if ((clankT -= dt) <= 0) {
        Sfx.thump(220 + Math.random() * 80, 0.06, 0.35); Sfx.tone(1800 + Math.random() * 700, 0.12, 0.05, 'square'); Sfx.burst(3000, 0.05, 0.1);
        events.push({ type: 'noise', kind: 'hammer', x: bench.focus.x, y: bench.focus.y, z: bench.focus.z, radius: 15 });   // hammering carries
        clankT = 0.42 + Math.random() * 0.15;
      }
      if (hold >= BUILD_TIME) {
        hold = 0; bench.done = true; st.crank = true;
        Sfx.unlock(); Sfx.keyPickup();
        toast('You clamp the pieces in the vise and hammer them together.  A crank handle — now the well in the garden.', 4.5);
        updateInventory();
        if (reveal) placeReveal();
      }
    } else hold = Math.max(0, hold - dt * 2);
    ui.prompt(bench.done ? null : 'Hold [E]  Build the crank handle', hold / BUILD_TIME);
  }

  function animateWell(dt) {
    if (!well) return;
    const w = well;
    const d = (1 - w.wound) * w.deep;
    const hy = w.top - 0.08 - d;                         // where the rope ties onto the handle: wound right up, it hangs clear above the rim
    w.bucket.position.set(w.x, hy, w.z);
    w.bucket.visible = d < 1.8;                          // hidden down in the dark until it's near the top
    if (w.paperGlow) w.paperGlow.intensity = w.raised && w.paper ? 0.35 : 0;   // the paper catches a little light
    const len = w.top - hy;
    w.rope.scale.set(1, Math.max(0.01, len), 1);
    w.rope.position.set(w.x, w.top - len / 2, w.z);
    w.axle.rotation.x = -w.wound * 40;
    w.crank.rotation.x = -w.wound * 40;
  }

  function win() {
    st.won = true;
    closeNote(); stopTyping();
    Sfx.win();
    ui.win({ time: st.time, searched: st.searched, total: drawers.length });
  }

  // ---------- cheat: type "key" — highlights everything you still need ----------
  function placeReveal() {
    const pts = [];
    if (reveal && !st.won) {
      for (const d of keyDrawers) if (d.key) pts.push(d.focus);
      for (const d of partDrawers) if (d.part) pts.push(d.focus);
      if (bench && !bench.done && st.parts >= PART_COUNT) pts.push(bench.focus);
      if (well && !well.done && st.crank) pts.push(well.focus);
      if (exitDoor.padlocks.length && st.keys + st.keysUsed >= KEY_COUNT) pts.push(exitDoor.focus);
      if (!st.codeOk && st.codeKnown) pts.push(keypad.focus);
    }
    beacons.forEach((b, i) => {
      const p = pts[i], on = !!p;
      b.sprite.visible = b.beam.visible = on;
      if (!on) return;
      b.sprite.position.set(p.x, p.y + 0.5, p.z);
      b.beam.position.set(p.x, p.y + 2.2, p.z);
    });
  }
  function toggleReveal() {
    if (!st.active || st.won) return;
    reveal = !reveal;
    placeReveal();
    toast(reveal ? '[test] Objectives highlighted' : '[test] Highlight off', 2);
  }

  // ---------- per frame ----------
  function update(dt, input) {
    if (!st.active) return;

    // animations: drawers, locker doors, front door, falling padlocks, the well
    for (const it of items) {
      if (it.type === 'drawer') {
        let want = it.searched ? 1 : 0, jitter = 0;
        if (!it.searched && it === target && hold > 0) jitter = Math.sin(performance.now() * 0.05) * 0.006;
        it.open += (want - it.open) * (1 - Math.exp(-5 * dt));
        const o = it.open * it.slide + jitter;
        it.group.position.set(it.base.x + it.normal.x * o, it.base.y, it.base.z + it.normal.z * o);
      } else if (it.type === 'locker') {
        if (it.animT > 0) it.animT -= dt;
        const want = it.broken ? 0.8 : it.animT > 0.25 ? 1 : 0;
        it.open += (want - it.open) * (1 - Math.exp(-14 * dt));
        it.pivot.rotation.y = it.swing * it.open * 1.4;
      } else if (it.type === 'exit') {
        const want = it.unlocked ? 1 : 0;
        it.open += (want - it.open) * (1 - Math.exp(-1.6 * dt));
        for (const { pivot, side } of it.leaves) pivot.rotation.y = side * it.open * 1.75;
      }
    }
    for (let i = dropping.length - 1; i >= 0; i--) {
      const d = dropping[i];
      d.vy -= 9.8 * dt; d.t += dt;
      d.obj.position.y = Math.max(-1.05, d.obj.position.y + d.vy * dt);
      if (d.obj.position.y <= -1.05 || d.t > 1.5) { if (d.t < 1.5) Sfx.thump(300, 0.05, 0.12); scene.remove(d.obj); dropping.splice(i, 1); }
    }
    for (const d of keyDrawers) if (d.key) d.key.children.forEach(m => m.material.emissive && m.material.emissive.setHex(d.open > 0.5 ? 0x5a3e0c : 0x2a1c05));
    updateFallen(dt);
    animateWell(dt);
    if (st.entryFlash > 0) {
      st.entryFlash -= dt;
      if (st.entryFlash <= 0) {
        if (st.codeOk) { stopTyping(); tryOpen(); }
        else { st.entry = ''; st.entryState = ''; if (st.typing) ui.keypad(true, '', st.codeKnown ? st.code : null); drawKeypad(); }
      }
    }

    if (reveal) {
      revealT += dt;
      const pulse = Math.sin(revealT * 4), s = 0.09 + pulse * 0.015;
      for (const b of beacons) {
        if (!b.sprite.visible) continue;
        b.sprite.scale.set(s, s, s);
        const dist = Math.hypot(camera.position.x - b.beam.position.x, camera.position.z - b.beam.position.z);
        const w = Math.max(1, dist * 0.09);
        b.beam.scale.set(w, 1, w);
        b.beam.material.opacity = 0.55 + pulse * 0.15;
      }
    }

    if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast(null); }
    if (st.won || st.dead) return;
    st.time += dt;

    // reading a note: E closes it, so does walking away
    if (reading) {
      ui.prompt('[E]  Close', 0);
      const dx = player.pos.x - reading.x, dz = player.pos.z - reading.z;
      if (input.ePressed || dx * dx + dz * dz > 4) closeNote();
      return;
    }
    // at the combination lock: number keys type, E or walking away stops
    if (st.typing) {
      ui.prompt('[E]  Step away', 0);
      const dx = player.pos.x - st.typing.x, dz = player.pos.z - st.typing.z;
      if ((input.ePressed && st.entryFlash <= 0) || dx * dx + dz * dz > 2.5) stopTyping();
      return;
    }

    // hidden in a locker
    if (st.hidden) {
      const l = st.hidden;
      let d = player.yaw - l.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.yaw = l.yaw + Math.max(-0.55, Math.min(0.55, d));
      player.pitch = Math.max(-0.35, Math.min(0.3, player.pitch));
      ui.prompt('[E]  Leave locker', 0);
      if (input.ePressed) leave();
      return;
    }

    // carrying something: props.js handles it; let go of E to throw
    if (typeof Props !== 'undefined' && Props.holding) {
      target = null; hold = 0;
      ui.prompt(Props.holding.type === 'vase' ? 'Let go of [E] to throw  (swing the mouse)' : 'Let go of [E] to throw  (swing the mouse)', 0);
      return;
    }

    const t = findTarget();
    if (t !== target) { hold = 0; target = t; }
    if (!target) ui.prompt(null);
    else if (target.type === 'drawer' && !target.searched) {
      if (input.eHeld) {
        hold += dt;
        rummageT -= dt;
        if (rummageT <= 0) { Sfx.rummage(); rummageT = 0.22; events.push({ type: 'noise', kind: 'rummage', x: target.focus.x, y: target.focus.y, z: target.focus.z }); }
        if (hold >= SEARCH_TIME) { finishSearch(target); hold = 0; }
      } else hold = Math.max(0, hold - dt * 2);
      ui.prompt(target.searched ? null : 'Hold [E]  Search', hold / SEARCH_TIME);
    } else if (target.type === 'drawer') {
      const { pick, count } = drawerChoice(target);
      const k = pick ? pick.kind : 'note';
      const label = k === 'key' ? '[E]  Take the key' : k === 'part' ? (st.know.crank ? '[E]  Take the crank piece' : '[E]  Take the iron piece') : k === 'medkit' ? '[E]  Use the medkit' : '[E]  Read the note';
      ui.prompt(count > 1 ? label + '      (look at the other things in the drawer for them)' : label, 0);
      if (input.ePressed) {
        if (k === 'key') takeKey(target);
        else if (k === 'part') takePart(target);
        else if (k === 'medkit') useMedkit(target);
        else {
          if (target.intro) target.introRead = true;
          readNote(target.note);
          if (target.noteTag) { st.know[target.noteTag] = true; if (target.noteTag === 'crank') st.know.parts = true; updateInventory(); }
        }
      }
    } else if (target.type === 'bench') {
      useBench(input, dt);
    } else if (target.type === 'prop') {
      ui.prompt(target.propType === 'vase' ? 'Hold [E]  Pick up the vase' : 'Hold [E]  Pick up the chair', 0);
      if (input.ePressed) Props.grab(target);
    } else if (target.type === 'well') {
      useWell(input, dt);
    } else if (target.type === 'locker') {
      ui.prompt('[E]  Hide', 0);
      if (input.ePressed) hide(target);
    } else if (target.type === 'exit') {
      const left = target.padlocks.length;
      ui.prompt(st.keys > 0 ? `[E]  Unlock a padlock  (${left} left)` : '[E]  Front door', 0);
      if (input.ePressed) useExit();
    } else if (target.type === 'keypad') {
      ui.prompt('[E]  Enter the code', 0);
      if (input.ePressed) startTyping();
    }

    if (exitDoor.unlocked && exitDoor.open > 0.35 && player.pos.z > exitDoor.planeZ + 0.35) win();
  }

  function onRespawn() { if (st.hidden) { st.hidden = null; ui.setHidden(false); } closeNote(); stopTyping(); }

  return {
    init, update, toggleReveal, onRespawn, knockLocker, toast, damage, keypadKey,
    events,
    get active() { return st.active; },
    get won() { return st.won; },
    get dead() { return st.dead; },
    get hp() { return st.hp; },
    get hidden() { return !!st.hidden; },
    get typing() { return !!st.typing; },
    get reading() { return !!reading; },
    get keys() { return st.keys; },
    get code() { return st.code; },
  };
})();
