// Things you can pick up and throw: chairs and vases.
// Hold E on one to grab it — it hangs in front of you and follows your aim. Let go of E to throw it:
// the faster you were swinging the mouse when you let go, the harder it flies (let go while still = drop it).
// Where it lands makes a noise the entity hears (a vase smashing carries furthest) — use it as a distraction.
const Props = (function () {
  const G = 19;                       // gravity (same as the player)
  const HOLD_DIST = { chair: 1.45, vase: 1.2 };
  const HALF = { chair: { x: 0.24, y: 0.45, z: 0.24 }, vase: { x: 0.15, y: 0.24, z: 0.15 } };
  const BOUNCE = { chair: 0.28, vase: 0.2 };
  const MAX_THROW = 17;               // m/s
  const SHATTER = 3.4;                // a vase breaks when it hits something faster than this (m/s)

  let world, scene, camera, player, game;
  const list = [];
  let holding = null;
  const hist = [];                    // recent positions of the thing you're holding: { t, x, y, z }
  let clock = 0;
  const camDir = new THREE.Vector3(), tgt = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), bb = new THREE.Box3();
  const M = {};

  function mats() {
    const lin = h => new THREE.Color(h).convertSRGBToLinear();
    M.wood = new THREE.MeshStandardMaterial({ color: lin(0x2a170c), roughness: 0.8 });
    M.seat = new THREE.MeshStandardMaterial({ color: lin(0x3a1c1a), roughness: 1 });
    M.vases = [0x6a7a8a, 0x8a4a2a, 0x3a5a4a, 0xb0a890].map(c => new THREE.MeshStandardMaterial({ color: lin(c), roughness: 0.35, metalness: 0.05 }));
    M.band = new THREE.MeshStandardMaterial({ color: lin(0x8a6a2a), roughness: 0.4, metalness: 0.6 });
  }
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

  // models are centred on their bounding box (so they spin about their middle)
  function makeChair() {
    const g = new THREE.Group(), o = -0.45;
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), M.wood, 0, 0.46 + o, 0));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.38), M.seat, 0, 0.495 + o, 0));
    for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), M.wood, lx, 0.23 + o, lz));
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.06, 0.04), M.wood, 0, 0.87 + o, -0.2));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), M.wood, s * 0.19, 0.67 + o, -0.2));
    for (const s of [-1, 0, 1]) g.add(mesh(new THREE.BoxGeometry(0.03, 0.36, 0.02), M.wood, s * 0.08, 0.67 + o, -0.2));
    return g;
  }
  function makeVase() {
    const pts = [[0.0, 0], [0.09, 0], [0.12, 0.05], [0.14, 0.16], [0.12, 0.28], [0.06, 0.38], [0.05, 0.44], [0.075, 0.48]].map(([x, y]) => new THREE.Vector2(x, y - 0.24));
    const g = new THREE.Group();
    const mat = M.vases[Math.floor(Math.random() * M.vases.length)];
    const v = mesh(new THREE.LatheGeometry(pts, 16), mat); v.material = mat; g.add(v);
    g.add(mesh(new THREE.TorusGeometry(0.135, 0.008, 4, 18), M.band, 0, -0.08, 0).rotateX(Math.PI / 2));
    g.userData.mat = mat;
    return g;
  }

  function init(opts) {
    ({ world, scene, camera, player, game } = opts);
    if (!world.props || !world.props.length) return;
    mats();
    for (const s of world.props) {
      const half = HALF[s.type];
      const m = s.type === 'chair' ? makeChair() : makeVase();
      m.rotation.y = s.yaw || 0;
      const p = {
        type: 'prop', propType: s.type, mesh: m, half,
        pos: new THREE.Vector3(s.x, s.y + half.y, s.z), vel: new THREE.Vector3(), spin: new THREE.Vector3(),
        focus: new THREE.Vector3(), normal: null, reach: 2.4,
        state: 'rest', alive: true, held: false, collider: null, lastNoise: -9, ground: s.y,
      };
      m.position.copy(p.pos);
      scene.add(m);
      p.focus.copy(p.pos);
      p.home = p.pos.clone(); p.homeYaw = s.yaw || 0;
      list.push(p);
      world.interactables.push(p);
      setRestCollider(p);
    }
  }

  // ---------- collision ----------
  function overlaps(p, x, y, z) {
    const h = p.half;
    for (const b of world.boxes) {
      if (b === p.collider) continue;
      if (x + h.x > b.min.x && x - h.x < b.max.x && y + h.y > b.min.y && y - h.y < b.max.y && z + h.z > b.min.z && z - h.z < b.max.z) return b;
    }
    return null;
  }
  // move one axis and push out of whatever it hit. Returns the impact speed (0 = no hit)
  function moveAxis(p, axis, d) {
    if (!d) return 0;
    p.pos[axis] += d;
    const b = overlaps(p, p.pos.x, p.pos.y, p.pos.z);
    if (!b) return 0;
    const h = p.half[axis];
    p.pos[axis] = d > 0 ? b.min[axis] - h - 1e-4 : b.max[axis] + h + 1e-4;
    const imp = Math.abs(p.vel[axis]);
    p.vel[axis] = -p.vel[axis] * BOUNCE[p.propType];
    if (axis === 'y' && d < 0) { p.vel.x *= 0.7; p.vel.z *= 0.7; p.grounded = true; p.spin.multiplyScalar(0.6); }
    else { p.spin.multiplyScalar(0.8); }
    return imp;
  }
  // if it's overlapping something, push it out the shortest way (never "up and over" a wall)
  function depenetrate(p) {
    const h = p.half;
    for (let it = 0; it < 6; it++) {
      const b = overlaps(p, p.pos.x, p.pos.y, p.pos.z);
      if (!b) return true;
      let best = null, bd = Infinity;
      for (const [a, v] of [['x', b.min.x - h.x - 2e-3], ['x', b.max.x + h.x + 2e-3], ['y', b.min.y - h.y - 2e-3], ['y', b.max.y + h.y + 2e-3], ['z', b.min.z - h.z - 2e-3], ['z', b.max.z + h.z + 2e-3]]) {
        const d = Math.abs(v - p.pos[a]);
        if (d < bd) { bd = d; best = [a, v]; }
      }
      p.pos[best[0]] = best[1];
    }
    return !overlaps(p, p.pos.x, p.pos.y, p.pos.z);
  }
  // safety net: out of the house, or fallen out of the world -> back where it last sat
  const HALF_W = world => (world.layout ? world.layout.W * world.layout.CELL / 2 : 1e9);
  function lost(p) {
    const L = world.layout, hw = HALF_W(world), hh = L ? L.H * L.CELL / 2 : 1e9;
    return p.pos.y < -8 || Math.abs(p.pos.x) > hw || Math.abs(p.pos.z) > hh;
  }
  function sendHome(p) {
    p.pos.copy(p.home); p.vel.set(0, 0, 0); p.spin.set(0, 0, 0);
    p.mesh.quaternion.setFromEuler(e.set(0, p.homeYaw, 0));
    p.state = 'rest'; p.restBox = null;
  }
  function setRestCollider(p) {
    if (p.propType !== 'chair' || p.collider) return;
    const h = p.half;
    // don't drop a solid box onto the player (they'd be stuck in it); try again next frame
    const pp = player.pos, r = P.radius;
    if (pp.x + r > p.pos.x - h.x && pp.x - r < p.pos.x + h.x && pp.z + r > p.pos.z - h.z && pp.z - r < p.pos.z + h.z &&
        pp.y < p.pos.y + h.y && pp.y + player.height > p.pos.y - h.y) return;
    const rb = p.restBox;
    p.collider = rb ? { min: { ...rb.min }, max: { ...rb.max }, noLedge: true }
      : { min: { x: p.pos.x - h.x, y: p.pos.y - h.y, z: p.pos.z - h.z }, max: { x: p.pos.x + h.x, y: p.pos.y + h.y, z: p.pos.z + h.z }, noLedge: true };
    world.boxes.push(p.collider);
  }
  function clearRestCollider(p) { if (p.collider) { world.removeCollider(p.collider); p.collider = null; } }

  // ---------- noise + breaking ----------
  function impact(p, imp) {
    if (imp < 1.6) return;
    const k = Math.min(1, imp / 12);
    if (p.propType === 'vase' && imp > SHATTER) { shatter(p, imp); return; }
    if (p.propType === 'chair') Sfx.clatter(k); else Sfx.clink(k);
    if (clock - p.lastNoise < 0.25) return;
    p.lastNoise = clock;
    // a wooden chair clattering over carries a long way; a vase knocking about, less so
    const radius = p.propType === 'chair' ? Math.min(17, 4 + imp * 1.6) : Math.min(10, (imp - 1.5) * 2.2);
    if (radius > 3) game.events.push({ type: 'noise', kind: 'throw', x: p.pos.x, y: p.pos.y, z: p.pos.z, radius });
  }
  const shards = [];
  function shatter(p, imp) {
    p.alive = false;
    p.state = 'gone';
    scene.remove(p.mesh);
    Sfx.shatter(Math.min(1, imp / 10));
    game.events.push({ type: 'noise', kind: 'throw', x: p.pos.x, y: p.pos.y, z: p.pos.z, radius: 19 });
    const mat = p.mesh.userData.mat;
    for (let i = 0; i < 14; i++) {
      const s = 0.04 + Math.random() * 0.07;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * (0.5 + Math.random())), mat);
      m.material.side = THREE.DoubleSide;
      m.position.copy(p.pos);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      shards.push({ m, vel: new THREE.Vector3(Math.cos(a) * sp + p.vel.x * 0.2, 1.5 + Math.random() * 2.5, Math.sin(a) * sp + p.vel.z * 0.2), floor: null, t: 0 });
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      scene.add(m);
    }
  }
  function updateShards(dt) {
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.t += dt;
      s.vel.y -= G * dt;
      s.m.position.addScaledVector(s.vel, dt);
      s.m.rotation.x += dt * 8; s.m.rotation.z += dt * 6;
      // land on whatever is under it
      let floor = -1;
      for (const b of world.boxes) {
        const pz = s.m.position;
        if (pz.x > b.min.x && pz.x < b.max.x && pz.z > b.min.z && pz.z < b.max.z && b.max.y <= pz.y + 0.3 && b.max.y > floor) floor = b.max.y;
      }
      if (floor < 0) floor = 0;
      if (s.m.position.y <= floor + 0.005) {
        s.m.position.y = floor + 0.005 + Math.random() * 0.003;
        s.m.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
        shards.splice(i, 1);
      } else if (s.t > 3) shards.splice(i, 1);
    }
  }

  // ---------- picking up / throwing ----------
  function grab(p) {
    if (!p.alive || holding) return;
    clearRestCollider(p);
    p.restBox = null;
    holding = p; p.held = true; p.state = 'held';
    p.vel.set(0, 0, 0); p.spin.set(0, 0, 0);
    hist.length = 0;
    Sfx.thump(p.propType === 'chair' ? 160 : 320, 0.06, 0.12);
  }
  function release(throwIt) {
    const p = holding;
    if (!p) return;
    holding = null; p.held = false; p.state = 'fly'; p.grounded = false;
    if (!depenetrate(p)) { p.pos.copy(camera.position).addScaledVector(camDir.set(0, -1, 0), 0.6); depenetrate(p); }
    // throw velocity = how fast it was moving over the last ~80 ms
    const now = hist[hist.length - 1], old = hist.find(h => now && now.t - h.t <= 0.09) || now;
    if (throwIt && now && old && now.t > old.t) {
      p.vel.set((now.x - old.x) / (now.t - old.t), (now.y - old.y) / (now.t - old.t), (now.z - old.z) / (now.t - old.t));
      camera.getWorldDirection(camDir);
      p.vel.addScaledVector(camDir, 1.2);                     // a little push the way you're facing
      const sp = p.vel.length();
      if (sp > MAX_THROW) p.vel.multiplyScalar(MAX_THROW / sp);
      p.vel.add(player.vel);
    } else p.vel.copy(player.vel).multiplyScalar(0.5);
    const sp = p.vel.length();
    p.spin.set((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp).multiplyScalar(0.8);
    if (sp > 4) Sfx.burst(900, 0.12, Math.min(0.2, sp * 0.012));          // whoosh
  }
  // first box a straight line from a to b goes through (0..1 along it, or 1 if clear)
  function rayHit(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let best = 1;
    for (const bx of world.boxes) {
      if (holding && bx === holding.collider) continue;
      let t0 = 0, t1 = best, ok = true;
      for (const [o, d, lo, hi] of [[a.x, dx, bx.min.x, bx.max.x], [a.y, dy, bx.min.y, bx.max.y], [a.z, dz, bx.min.z, bx.max.z]]) {
        if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) { ok = false; break; } continue; }
        let u0 = (lo - o) / d, u1 = (hi - o) / d;
        if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
        if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1;
        if (t0 >= t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }

  function updateHeld(p, dt) {
    camera.getWorldDirection(camDir);
    const dist = HOLD_DIST[p.propType];
    tgt.copy(camera.position).addScaledVector(camDir, dist);
    tgt.y -= p.propType === 'chair' ? 0.3 : 0.18;
    tgt.y = Math.max(tgt.y, player.pos.y + (p.propType === 'chair' ? 0.85 : 0.95));   // lifted up, not dragged along the floor
    // don't push it through a wall: pull it in to just short of whatever's in the way
    const hit = rayHit(camera.position, tgt);
    if (hit < 1) tgt.lerpVectors(camera.position, tgt, Math.max(0.25, hit - 0.35 / dist));
    // spring toward the hold point, colliding as it goes
    const k = Math.min(1, dt * 30);
    const vx = (tgt.x - p.pos.x) * k / dt, vy = (tgt.y - p.pos.y) * k / dt, vz = (tgt.z - p.pos.z) * k / dt;
    p.vel.set(vx, vy, vz);
    depenetrate(p);
    const n = Math.max(1, Math.ceil(Math.hypot(vx, vy, vz) * dt / 0.08));      // small steps: never skip through a thin wall
    for (let i = 0; i < n; i++) for (const a of ['x', 'y', 'z']) {
      const old = p.pos[a];
      p.pos[a] += p.vel[a] * dt / n;
      if (overlaps(p, p.pos.x, p.pos.y, p.pos.z)) p.pos[a] = old;               // blocked: stay on this side
    }
    // face away from you, upright
    e.set(0, player.yaw + Math.PI, 0); q.setFromEuler(e);
    p.mesh.quaternion.slerp(q, Math.min(1, dt * 10));
    hist.push({ t: clock, x: tgt.x, y: tgt.y, z: tgt.z });          // the throw follows your swing
    while (hist.length > 2 && clock - hist[0].t > 0.2) hist.shift();
    // drop it if you're too far from it (it snagged on something) or you're busy
    const far = p.pos.distanceTo(camera.position) > dist + 1.4;
    if (far || player.climb.active || player.vault.active || game.hidden || game.dead || game.won) release(false);
  }

  function step(p, dt) {
    depenetrate(p);
    p.vel.y -= G * dt;
    p.grounded = false;
    const ix = moveAxis(p, 'x', p.vel.x * dt);
    const iz = moveAxis(p, 'z', p.vel.z * dt);
    const iy = moveAxis(p, 'y', p.vel.y * dt);
    const imp = Math.max(ix, iz, iy);
    if (imp) impact(p, imp);
    if (!p.alive) return;
    // tumble
    const s = p.spin;
    if (s.lengthSq() > 1e-4) {
      q.setFromAxisAngle(tgt.copy(s).normalize(), s.length() * dt);
      p.mesh.quaternion.premultiply(q);
    }
    if (p.grounded && p.vel.lengthSq() < 0.06) settle(p);
    if (lost(p)) sendHome(p);
  }
  // came to rest: lie upright, or on its side if it landed that way
  function settle(p) {
    p.state = 'rest'; p.vel.set(0, 0, 0); p.spin.set(0, 0, 0);
    const u = up.set(0, 1, 0).applyQuaternion(p.mesh.quaternion);
    e.setFromQuaternion(p.mesh.quaternion, 'YXZ');
    const yaw = e.y;
    if (u.y > 0.45) p.mesh.quaternion.setFromEuler(e.set(0, yaw, 0, 'YXZ'));
    else p.mesh.quaternion.setFromEuler(e.set(Math.PI / 2 * (u.z * Math.cos(yaw) + u.x * Math.sin(yaw) > 0 ? 1 : -1), yaw, 0, 'YXZ'));
    p.mesh.position.copy(p.pos);
    p.mesh.updateMatrixWorld(true);
    bb.setFromObject(p.mesh);
    const lift = (p.pos.y - p.half.y) - bb.min.y;              // sit on the floor exactly
    p.pos.y += lift;
    p.home = p.pos.clone(); p.homeYaw = yaw;
    p.restBox = { min: { x: bb.min.x + 0.03, y: bb.min.y + lift, z: bb.min.z + 0.03 }, max: { x: bb.max.x - 0.03, y: bb.max.y + lift, z: bb.max.z - 0.03 } };
  }

  function update(dt, input) {
    clock += dt;
    if (holding && !input.eHeld) release(true);
    for (const p of list) {
      if (!p.alive) continue;
      if (p === holding) updateHeld(p, dt);
      else if (p.state === 'fly') {
        const n = Math.max(1, Math.ceil(p.vel.length() * dt / 0.1));    // substeps so fast throws don't tunnel through walls
        for (let i = 0; i < n && p.alive && p.state === 'fly'; i++) step(p, dt / n);
      } else if (p.state === 'rest') setRestCollider(p);
      if (!p.alive) continue;
      p.mesh.position.copy(p.pos);
      p.focus.copy(p.pos);
    }
    updateShards(dt);
  }

  return {
    init, update, grab, drop() { release(false); },
    get holding() { return holding ? { type: holding.propType } : null; },
  };
})();
