// First-person character controller.
// All tuning lives in P. Units: meters, seconds, radians.
const P = {
  // speeds (m/s)
  walkSpeed: 3.8,
  sprintSpeed: 9.2,
  crouchSpeed: 2.2,
  backMult: 0.85,         // walking backwards is a bit slower

  // acceleration (m/s^2) — lower = more momentum, more fluid
  groundAccel: 30,        // how fast you reach target speed
  groundDecel: 22,        // how fast you stop when no key is held
  turnAccel: 42,          // extra grip when changing direction, so turns don't feel icy
  overspeedDecel: 5,      // gentle bleed-off when faster than target (after slides / slide-jumps)
  airAccel: 22,           // air control

  // jumping / gravity
  gravity: 19,
  fallMult: 1.35,         // fall faster than you rise: snappier jumps
  jumpCutMult: 2.0,       // releasing Space early = shorter jump
  jumpVel: 6.6,           // ~1.15 m jump height
  coyoteTime: 0.1,        // can still jump briefly after walking off a ledge
  jumpBuffer: 0.12,       // Space pressed just before landing still counts

  // body
  standHeight: 1.8,
  crouchHeight: 1.0,
  eyeDrop: 0.12,          // eye distance below top of head
  radius: 0.35,
  stepHeight: 0.45,       // walk up anything this tall without jumping

  // slide
  slideMinSpeed: 6.5,     // must be going this fast (sprinting) to slide
  slideBoost: 3.0,        // speed added when the slide starts
  slideMaxSpeed: 14,
  slideFriction: 4,
  slideEndSpeed: 3.0,
  slideMaxTime: 1.4,
  slideSteer: 3.0,        // how much you can turn mid-slide
  slideCooldown: 0.35,
  slideJumpBoost: 2.2,    // extra speed when you jump out of a slide
  slideJumpMax: 16,       // hard cap for slide-jump speed

  // vault / climb
  vaultMinJump: 0.9,      // on the ground, Space only vaults things taller than this (lower = normal jump)
  vaultMaxGround: 1.6,    // tallest obstacle you can vault/climb from the ground
  vaultMaxAir: 0.75,      // in the air: ledge can be up to this far above your feet
  vaultReachGround: 0.7,  // how close to the obstacle you must be
  vaultReachAir: 0.45,
  vaultMaxDepth: 1.6,     // thinner than this = vault over it, thicker = climb on top
  vaultHeight: 1.2,       // body height while going over
  vaultSpeedKeep: 0.8,    // fraction of speed kept after vaulting over
  mantleSpeedKeep: 0.45,  // fraction of speed kept after climbing on top
  vaultCooldown: 0.25,
  stamVault: 6,
  // high climb (ledges between vaultMaxGround and highClimbMax): slower, pull-up animation
  highClimbMax: 2.2,      // tallest ledge you can pull yourself up from the ground
  highClimbAirMax: 1.05,  // in the air: ledge up to this far above your feet (jump 1.12 + 1.05 ≈ 2.2 max)
  highClimbTime: 1.05,    // base duration (s), taller = slower
  highSpeedKeep: 0.35,    // fraction of speed kept after a high climb
  stamHighClimb: 12,

  // ladders / vines
  ladderSpeed: 2.8,       // climb speed on ladders (m/s)
  vineSpeed: 2.0,         // vines are slower
  climbSlideSpeed: 5.5,   // hold Ctrl to slide down fast
  climbStrafe: 1.2,       // A/D sideways on the surface
  climbTopReach: 0.7,     // when feet are this close to the top, pull yourself over
  climbJumpOut: 4.5,      // Space pushes you off the wall...
  climbJumpUp: 4.5,       // ...and up
  climbCooldown: 0.35,
  stamClimb: 3,           // per second while moving on a climbable

  // stamina
  stamMax: 150,
  stamSprint: 10,         // per second  (~15 s of sprinting from full)
  stamJump: 4,
  stamSlide: 8,
  stamRegen: 28,          // per second
  stamDelay: 0.7,         // seconds before regen starts
  stamRecover: 45,        // when exhausted, can't sprint until back to this
};

const SPAWN = { x: 0, y: 0, z: 34 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();     // feet position
    this.prevPos = new THREE.Vector3(); // for render interpolation
    this.vel = new THREE.Vector3();
    this.events = [];
    this.reset();
  }

  reset() {
    const sp = this.world.spawn || SPAWN;
    this.pos.set(sp.x, sp.y, sp.z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = sp.yaw || 0;
    this.pitch = 0;
    this.height = this.prevHeight = P.standHeight;
    this.grounded = false;
    this.groundY = this.pos.y;          // height of the floor you last stood on
    this.justLanded = false;
    this.crouching = false;
    this.sprinting = false;
    this.sliding = false;
    this.slideTime = 0;
    this.slideCooldownT = 0;
    this.coyoteT = 0;
    this.jumpBufT = 0;
    this.stamina = P.stamMax;
    this.exhausted = false;
    this.stamDelayT = 0;
    this.vault = { active: false, t: 0, kind: 'vault', side: 1, hands: [] };
    this.vaultCooldownT = 0;
    this.climb = { active: false, vol: null };
    this.climbCooldownT = 0;
    this.climbPhase = 0;
    // camera feel
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.stepOffset = 0;
    this.landOffset = 0;
    this.landVel = 0;
    this.roll = 0;
  }

  get hSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  get state() {
    if (this.vault.active) return this.vault.high ? 'CLIMB-UP' : this.vault.kind === 'vault' ? 'VAULT' : 'CLIMB';
    if (this.climb.active) return this.climb.vol.kind === 'ladder' ? 'LADDER' : 'VINES';
    if (this.sliding) return 'SLIDE';
    if (!this.grounded) return 'AIR';
    if (this.crouching) return 'CROUCH';
    if (this.hSpeed < 0.2) return 'IDLE';
    return this.sprinting ? 'SPRINT' : 'WALK';
  }

  // ---------- collision ----------
  overlapAt(x, y, z, h) {
    const r = P.radius, e = 1e-4;
    let hit = null;
    for (const b of this.world.boxes) {
      if (x + r > b.min.x + e && x - r < b.max.x - e &&
          y + h > b.min.y + e && y < b.max.y - e &&
          z + r > b.min.z + e && z - r < b.max.z - e) {
        if (!hit || b.max.y > hit.max.y) hit = b; // prefer the tallest (for ground)
      }
    }
    return hit;
  }

  overlap() { return this.overlapAt(this.pos.x, this.pos.y, this.pos.z, this.height); }

  moveHorizontal(axis, delta) {
    if (delta === 0) return;
    this.pos[axis] += delta;
    for (let guard = 0; guard < 4; guard++) {
      const b = this.overlap();
      if (!b) return;
      // step up onto low obstacles / stairs
      const up = b.max.y - this.pos.y;
      if (this.grounded && up > 0 && up <= P.stepHeight &&
          !this.overlapAt(this.pos.x, b.max.y, this.pos.z, this.height)) {
        this.pos.y = b.max.y;
        this.stepOffset -= up; // camera eases up instead of snapping
        continue;
      }
      // push out against the face we ran into
      this.pos[axis] = delta > 0
        ? b.min[axis] - P.radius - 1e-4
        : b.max[axis] + P.radius + 1e-4;
      this.vel[axis] = 0;
    }
  }

  moveVertical(delta) {
    this.pos.y += delta;
    const b = this.overlap();
    if (!b) return;
    if (delta < 0) {
      this.pos.y = b.max.y;
      this.grounded = true;
      this.vel.y = 0;
    } else {
      this.pos.y = b.min.y - this.height - 1e-4; // bonk head
      this.vel.y = 0;
    }
  }

  // keeps you glued to the ground when walking down stairs / off small ledges
  snapDown() {
    const y0 = this.pos.y;
    this.pos.y -= P.stepHeight;
    const b = this.overlap();
    if (b && b.max.y <= y0) {
      this.stepOffset += y0 - b.max.y;
      this.pos.y = b.max.y;
      this.grounded = true;
      this.vel.y = 0;
    } else {
      this.pos.y = y0;
    }
  }

  // ---------- slide ----------
  startSlide(hs) {
    const boost = this.exhausted ? 0 : P.slideBoost;
    const ns = Math.max(Math.min(hs + boost, P.slideMaxSpeed), hs);
    const k = ns / hs;
    this.vel.x *= k; this.vel.z *= k;
    this.sliding = true;
    this.slideTime = 0;
    this.stamina = Math.max(0, this.stamina - P.stamSlide);
    this.stamDelayT = P.stamDelay;
    this.events.push({ type: 'slideStart' });
  }

  endSlide() {
    if (!this.sliding) return;
    this.sliding = false;
    this.slideCooldownT = P.slideCooldown;
    this.events.push({ type: 'slideEnd' });
  }

  // ---------- vault / climb ----------
  // 2D ray (x/z) vs box: distances where the ray enters / exits the box
  static rayBox(ox, oz, dx, dz, b) {
    let tmin = -Infinity, tmax = Infinity;
    for (const [o, d, mn, mx] of [[ox, dx, b.min.x, b.max.x], [oz, dz, b.min.z, b.max.z]]) {
      if (Math.abs(d) < 1e-6) {
        if (o < mn || o > mx) return null;
      } else {
        const t1 = (mn - o) / d, t2 = (mx - o) / d;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
    }
    return tmax >= Math.max(tmin, 0) ? { tEnter: tmin, tExit: tmax } : null;
  }

  // nearest obstacle straight ahead that rises from around our feet
  findObstacle(fx, fz, maxGap = 0.8) {
    let best = null;
    for (const b of this.world.boxes) {
      if (b.noLedge) continue;                                     // lockers, doors, shelves against walls
      if (b.max.y <= this.pos.y + 0.02) continue;                 // below our feet
      if (b.min.y > this.pos.y + P.stepHeight + 0.05) continue;   // floating above (bars, roofs)
      // thin tall slivers (posts, the wall edges beside vents / holes) aren't ledges
      if (Math.min(b.max.x - b.min.x, b.max.z - b.min.z) < 0.25 && b.max.y - b.min.y > 1.0) continue;
      const r = Player.rayBox(this.pos.x, this.pos.z, fx, fz, b);
      if (!r || r.tEnter < 0 || r.tEnter - P.radius > maxGap) continue;
      if (!best || r.tEnter < best.tEnter) best = { tEnter: r.tEnter, tExit: r.tExit, top: b.max.y, box: b };
    }
    return best;
  }

  // Work out how we'd get over an obstacle: vault over it, climb on top, or null if there's no room.
  // preferTop: for tall (climb-up) ledges, stand on top if it fits, so tall furniture works as a step up.
  planVault(ob, fx, fz, preferTop = false) {
    const px = this.pos.x, pz = this.pos.z, vh = P.vaultHeight;
    // room to rise straight up from where we are?
    if (this.overlapAt(px, this.pos.y, pz, ob.top - this.pos.y + vh)) return null;
    const onT = ob.tEnter + P.radius + 0.15;
    const top = { x: px + fx * onT, y: ob.top, z: pz + fz * onT };
    const topFits = onT + P.radius <= ob.tExit && !this.overlapAt(top.x, top.y, top.z, vh);
    if (preferTop && topFits) return { kind: 'mantle', end: top, mid: null };
    // thin obstacle -> vault over it
    if (ob.tExit - ob.tEnter <= P.vaultMaxDepth) {
      const midT = (ob.tEnter + ob.tExit) / 2;
      const endT = ob.tExit + P.radius + 0.25;
      const end = { x: px + fx * endT, y: this.pos.y, z: pz + fz * endT };
      if (!this.overlapAt(px + fx * midT, ob.top + 0.01, pz + fz * midT, vh) &&
          !this.overlapAt(end.x, end.y, end.z, vh)) {
        return { kind: 'vault', end, mid: { x: px + fx * midT, z: pz + fz * midT } };
      }
    }
    // otherwise climb on top
    if (!this.overlapAt(top.x, top.y, top.z, vh)) return { kind: 'mantle', end: top, mid: null };
    return null;
  }

  // For the HUD: what's the ledge in front of us, and can we get over it?
  ledgeInfo() {
    if (this.vault.active || this.climb.active) return null;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ob = this.findObstacle(fx, fz, 1.6);
    if (!ob) return null;
    // measure from the floor you're standing on (or jumped from) — not from your feet mid-jump, or a ledge
    // that's too tall looks reachable at the top of the jump when it isn't
    const base = this.grounded ? this.pos.y : Math.min(this.groundY, this.pos.y);
    const h = ob.top - base;
    if (h > 3.5) return null;                          // clearly a wall
    if (h <= P.vaultMinJump) return null;               // low enough to just jump
    let cls = h <= P.vaultMaxGround ? 'vault' : h <= P.highClimbMax ? 'high' : 'no';
    let kind = null;
    if (cls !== 'no') {
      const plan = this.planVault(ob, fx, fz, cls === 'high');
      if (plan) kind = plan.kind; else cls = 'blocked';
    }
    return { cls, kind, ob, fx, fz, inReach: ob.tEnter - P.radius <= P.vaultReachGround };
  }

  tryVault() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ob = this.findObstacle(fx, fz);
    if (!ob) return false;
    const h = ob.top - this.pos.y;
    const gap = ob.tEnter - P.radius;
    const along = this.vel.x * fx + this.vel.z * fz;

    let high;
    if (this.grounded || this.coyoteT > 0) {
      // on the ground: only when Space is pressed at something too tall to simply jump
      if (!(this.jumpBufT > 0 && gap <= P.vaultReachGround)) return false;
      if (h > P.vaultMinJump && h <= P.vaultMaxGround) high = false;
      else if (h > P.vaultMaxGround && h <= P.highClimbMax) high = true;
      else return false;
    } else {
      // in the air: only if we're about to clip the ledge
      if (!(gap <= P.vaultReachAir && h > 0.02)) return false;
      if (h <= P.vaultMaxAir) high = false;
      else if (h <= P.highClimbAirMax) high = true;   // grabbed a ledge we were falling short of
      else return false;
      const tt = Math.max(gap, 0) / Math.max(along, 0.5);
      const g = P.gravity * (this.vel.y < 0 ? P.fallMult : 1);
      const feetY = this.pos.y + this.vel.y * tt - 0.5 * g * tt * tt;
      if (along > 0.5 && feetY >= ob.top + 0.02) return false; // we'll clear it, let the jump play out
    }

    const plan = this.planVault(ob, fx, fz, high);
    if (!plan) return false;
    this.startVault(plan.kind, ob, fx, fz, plan.end, h, plan.mid, high);
    return true;
  }

  startVault(kind, ob, fx, fz, end, h, mid, high = false) {
    const v = this.vault;
    const hs0 = Math.max(this.hSpeed, 0);
    v.active = true;
    v.kind = kind;
    v.high = high;
    v.overEvent = false;
    v.t = 0;
    v.dir = { x: fx, z: fz };
    v.side = Math.random() < 0.5 ? -1 : 1;
    v.p0 = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    v.p2 = end;
    if (high) {
      // stage 1-2: hang against the wall and pull up until the chest is over the ledge
      const hangT = Math.max(0, ob.tEnter - P.radius - 0.02);
      v.hang = { x: this.pos.x + fx * hangT, y: ob.top - 0.45, z: this.pos.z + fz * hangT };
      // stage 3: roll over the edge (onto the top, or over and down the far side)
      if (kind === 'vault') {
        const peak = ob.top + 0.15;
        v.p1 = {
          x: 2 * mid.x - (v.hang.x + end.x) / 2,
          y: 2 * peak - (v.hang.y + end.y) / 2,
          z: 2 * mid.z - (v.hang.z + end.z) / 2,
        };
      } else {
        v.p1 = { x: v.hang.x + fx * 0.15, y: ob.top + 0.3, z: v.hang.z + fz * 0.15 };
      }
      v.dur = P.highClimbTime + Math.max(0, h - P.vaultMaxGround) * 0.6;
      v.exitSpeed = Math.max(hs0 * P.highSpeedKeep, kind === 'vault' ? P.walkSpeed * 0.8 : P.crouchSpeed);
    } else if (kind === 'vault') {
      v.dur = clamp(0.34 + 0.12 * h - hs0 * 0.006, 0.3, 0.55);
      // control point chosen so the curve passes over the middle of the obstacle
      const peak = ob.top + 0.12;
      v.p1 = {
        x: 2 * mid.x - (v.p0.x + end.x) / 2,
        y: 2 * peak - (v.p0.y + end.y) / 2,
        z: 2 * mid.z - (v.p0.z + end.z) / 2,
      };
      v.exitSpeed = Math.max(hs0 * P.vaultSpeedKeep, P.walkSpeed);
    } else {
      v.dur = clamp(0.42 + 0.2 * h, 0.45, 0.75);
      v.p1 = { x: v.p0.x, y: ob.top + 0.35, z: v.p0.z }; // up first, then forward
      v.exitSpeed = Math.max(hs0 * P.mantleSpeedKeep, P.crouchSpeed);
    }
    // where the hands plant: on the near edge of the ledge
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const ex = this.pos.x + fx * (ob.tEnter + 0.1), ez = this.pos.z + fz * (ob.tEnter + 0.1);
    v.hands = [
      { x: ex - rx * 0.24, y: ob.top, z: ez - rz * 0.24 },
      { x: ex + rx * 0.24, y: ob.top, z: ez + rz * 0.24 },
    ];
    if (this.sliding) this.endSlide();
    this.jumpBufT = 0;
    this.coyoteT = 0;
    this.grounded = false;
    this.vel.set(0, 0, 0);
    this.stamina = Math.max(0, this.stamina - (high ? P.stamHighClimb : P.stamVault));
    this.stamDelayT = P.stamDelay;
    this.events.push({ type: 'vault', kind, high });
  }

  updateVault(dt) {
    const v = this.vault;
    v.t += dt / v.dur;
    const t = Math.min(v.t, 1);
    if (v.high) {
      const R = 0.14, PULL = 0.68; // reach for the ledge -> pull up -> roll over
      if (t < R) {
        const s = t / R;
        this.pos.set(v.p0.x, v.p0.y + Math.sin(s * Math.PI) * 0.04, v.p0.z); // little hop to grab
      } else if (t < PULL) {
        let u = (t - R) / (PULL - R);
        u = u * u * (3 - 2 * u);
        u += 0.04 * Math.sin(u * Math.PI * 2); // uneven, effortful pull
        this.pos.set(lerp(v.p0.x, v.hang.x, u), lerp(v.p0.y, v.hang.y, u), lerp(v.p0.z, v.hang.z, u));
      } else {
        if (!v.overEvent) { v.overEvent = true; this.events.push({ type: 'vaultOver' }); }
        const u = (t - PULL) / (1 - PULL);
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        this.pos.set(
          a * v.hang.x + b * v.p1.x + c * v.p2.x,
          a * v.hang.y + b * v.p1.y + c * v.p2.y,
          a * v.hang.z + b * v.p1.z + c * v.p2.z
        );
      }
    } else {
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; // quadratic bezier
      this.pos.set(
        a * v.p0.x + b * v.p1.x + c * v.p2.x,
        a * v.p0.y + b * v.p1.y + c * v.p2.y,
        a * v.p0.z + b * v.p1.z + c * v.p2.z
      );
    }
    if (this.height > P.vaultHeight) {
      this.height = Math.max(P.vaultHeight, this.height - (this.height - P.vaultHeight) * (1 - Math.exp(-20 * dt)) - 0.002);
    }
    if (v.t >= 1) {
      v.active = false;
      this.vel.set(v.dir.x * v.exitSpeed, v.kind === 'vault' ? -0.5 : 0, v.dir.z * v.exitSpeed);
      this.vaultCooldownT = P.vaultCooldown;
      const hit = this.overlap();
      if (hit) this.pos.y = hit.max.y; // safety: never end inside geometry
      this.events.push({ type: 'vaultEnd' });
    }
  }

  // ---------- ladders / vines ----------
  // a climbable is a vertical surface: axis ('x'|'z') is its normal axis, sign is which way it faces
  findClimbable() {
    for (const c of this.world.climbables) {
      const n = c.axis, tAx = n === 'x' ? 'z' : 'x';
      const d = (this.pos[n] - c.surface) * c.sign;      // distance out from the surface
      if (d < -0.05 || d > P.radius + 0.45) continue;
      if (this.pos[tAx] < c.t0 || this.pos[tAx] > c.t1) continue;
      if (this.pos.y > c.top - 0.05 || this.pos.y + this.height < c.bottom + 0.3) continue;
      // must be looking at it
      const f = n === 'x' ? -Math.sin(this.yaw) : -Math.cos(this.yaw);
      if (f * -c.sign < 0.3) continue;
      return c;
    }
    return null;
  }

  startClimb(c) {
    if (this.sliding) this.endSlide();
    this.climb.active = true;
    this.climb.vol = c;
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.jumpBufT = 0;
    this.events.push({ type: 'climbStart', kind: c.kind });
  }

  stopClimb() {
    this.climb.active = false;
    this.climbCooldownT = P.climbCooldown;
  }

  updateClimb(dt, input) {
    const c = this.climb.vol, n = c.axis, tAx = n === 'x' ? 'z' : 'x';

    // jump off: push away from the wall
    if (input.jumpPressed) {
      this.stopClimb();
      this.vel.set(0, P.climbJumpUp, 0);
      this.vel[n] = c.sign * P.climbJumpOut;
      this.events.push({ type: 'jump' });
      return;
    }

    let vy = input.fwd * (c.kind === 'ladder' ? P.ladderSpeed : P.vineSpeed);
    if (input.crouch) vy = -P.climbSlideSpeed;
    const right = tAx === 'x' ? Math.cos(this.yaw) : -Math.sin(this.yaw);
    const vt = input.side * P.climbStrafe * (right >= 0 ? 1 : -1);

    // hug the surface
    const want = c.surface + c.sign * (P.radius + 0.08);
    this.pos[n] += (want - this.pos[n]) * Math.min(1, 15 * dt);

    this.vel.set(0, vy, 0);
    this.vel[tAx] = vt;
    this.grounded = false;
    this.moveHorizontal(tAx, vt * dt);
    this.pos[tAx] = clamp(this.pos[tAx], c.t0 + 0.1, c.t1 - 0.1);
    this.moveVertical(vy * dt);

    // hand-over-hand rhythm (drives camera sway, arms and sounds)
    const prev = this.climbPhase;
    this.climbPhase += Math.abs(vy) * dt * Math.PI / 0.55;
    if (Math.floor(this.climbPhase / Math.PI) !== Math.floor(prev / Math.PI)) {
      this.events.push({ type: 'climbStep', kind: c.kind });
    }

    if (vy !== 0) {
      this.stamina = Math.max(0, this.stamina - P.stamClimb * dt);
      this.stamDelayT = P.stamDelay;
    }

    // reached the bottom
    if (this.grounded && vy <= 0) { this.stopClimb(); return; }

    // reached the top: pull yourself over the edge
    if (this.pos.y >= c.top - P.climbTopReach) {
      if (input.fwd > 0) {
        const dx = n === 'x' ? -c.sign : 0, dz = n === 'z' ? -c.sign : 0;
        const dist = Math.abs(this.pos[n] - c.surface);
        const endT = dist + P.radius + 0.25;
        const end = { x: this.pos.x + dx * endT, y: c.top, z: this.pos.z + dz * endT };
        if (!this.overlapAt(end.x, end.y, end.z, P.vaultHeight) &&
            !this.overlapAt(this.pos.x, this.pos.y, this.pos.z, c.top - this.pos.y + P.vaultHeight)) {
          this.climb.active = false;
          this.startVault('mantle', { top: c.top, tEnter: dist, tExit: dist + 5 }, dx, dz, end, c.top - this.pos.y, null);
          return;
        }
      }
      this.pos.y = Math.min(this.pos.y, c.top - P.climbTopReach);
    }
  }

  // where the arms should reach to this frame (null = arms down)
  handTargets() {
    const v = this.vault;
    if (v.active) {
      const t = v.t;
      const t0 = v.high ? 0.02 : 0.03, t1 = v.high ? 0.86 : 0.62;
      return {
        mode: 'vault',
        list: v.hands.map((h, i) => (t > t0 + i * 0.05 && t < t1) ? { x: h.x, y: h.y + 0.02, z: h.z } : null),
      };
    }
    if (this.climb.active) {
      const c = this.climb.vol, n = c.axis, tAx = n === 'x' ? 'z' : 'x';
      const eyeY = this.pos.y + this.height - P.eyeDrop;
      const right = tAx === 'x' ? Math.cos(this.yaw) : -Math.sin(this.yaw);
      return {
        mode: 'climb',
        list: [-1, 1].map((side, i) => {
          const p = { x: 0, y: 0, z: 0 };
          p[n] = c.surface + c.sign * 0.07;
          p[tAx] = this.pos[tAx] + side * 0.2 * (right >= 0 ? 1 : -1);
          p.y = Math.min(c.top + 0.05, eyeY + 0.12 + 0.17 * Math.sin(this.climbPhase + i * Math.PI));
          return p;
        }),
      };
    }
    return null;
  }

  // Slide/crouch assist: when heading into a vent, ease sideways onto its centre line
  // so you don't clip the edge. Only acts close to the opening and while moving toward it.
  funnelIntoPassages(dt) {
    const list = this.world.passages;
    if (!list || !list.length) return;
    for (const p of list) {
      if (p.y !== undefined && Math.abs(this.pos.y - p.y) > 1) continue;   // a vent on another floor
      const ax = p.axis, ac = ax === 'x' ? 'z' : 'x';
      const dAlong = p[ax] - this.pos[ax];
      const inside = Math.abs(dAlong) < p.depth / 2 + 0.1;
      if (Math.abs(dAlong) > p.depth / 2 + 2.0) continue;
      if (!inside && (this.vel[ax] * dAlong <= 0 || Math.abs(this.vel[ax]) < 0.8)) continue;  // not heading in
      const off = this.pos[ac] - p[ac];
      if (Math.abs(off) > 1.0 || Math.abs(off) < 0.005) continue;
      this.moveHorizontal(ac, -off * Math.min(1, 9 * dt));
    }
  }

  // move horizontal velocity toward (tx, tz) by at most maxStep
  approach(tx, tz, maxStep) {
    const dx = tx - this.vel.x, dz = tz - this.vel.z;
    const dl = Math.hypot(dx, dz);
    if (dl <= maxStep) { this.vel.x = tx; this.vel.z = tz; }
    else { this.vel.x += dx / dl * maxStep; this.vel.z += dz / dl * maxStep; }
  }

  // ---------- physics step ----------
  update(dt, input) {
    this.prevPos.copy(this.pos);
    this.prevHeight = this.height;

    this.vaultCooldownT = Math.max(0, this.vaultCooldownT - dt);
    this.climbCooldownT = Math.max(0, this.climbCooldownT - dt);
    if (this.vault.active) { this.updateVault(dt); return; }
    if (this.climb.active) { this.updateClimb(dt, input); return; }

    // wish direction from WASD, relative to where we're looking
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * input.fwd + cy * input.side;
    let wz = -cy * input.fwd - sy * input.side;
    const wl = Math.hypot(wx, wz);
    const hasWish = wl > 0;
    if (hasWish) { wx /= wl; wz /= wl; }

    // timers
    this.jumpBufT = input.jumpPressed ? P.jumpBuffer : Math.max(0, this.jumpBufT - dt);
    this.coyoteT = this.grounded ? P.coyoteTime : Math.max(0, this.coyoteT - dt);
    this.slideCooldownT = Math.max(0, this.slideCooldownT - dt);

    let hs = this.hSpeed;

    // start slide: press crouch while sprinting, or land while holding crouch at speed
    if (this.grounded && !this.sliding && this.slideCooldownT <= 0 && hs >= P.slideMinSpeed &&
        (input.crouchPressed || (input.crouch && this.justLanded))) {
      this.startSlide(hs);
    }

    // crouch / stand (blocked if something is above your head)
    const wantCrouch = input.crouch || this.sliding;
    let targetH = wantCrouch ? P.crouchHeight : P.standHeight;
    if (!wantCrouch && this.height < P.standHeight - 1e-3 &&
        this.overlapAt(this.pos.x, this.pos.y, this.pos.z, P.standHeight)) {
      targetH = this.height; // stay low until there's room
    }
    const rate = this.sliding ? 18 : 12;
    let newH = this.height + (targetH - this.height) * (1 - Math.exp(-rate * dt));
    if (Math.abs(newH - targetH) < 0.002) newH = targetH;
    if (newH > this.height && this.overlapAt(this.pos.x, this.pos.y, this.pos.z, newH)) newH = this.height;
    this.height = newH;
    this.crouching = wantCrouch || this.height < P.standHeight - 0.05;

    // sprint
    this.sprinting = input.sprint && input.fwd > 0 && hasWish &&
                     !this.crouching && !this.sliding && !this.exhausted;

    // vault / climb takes priority over a normal jump
    if (input.fwd > 0 && this.vaultCooldownT <= 0 && this.tryVault()) {
      this.updateVault(dt);
      return;
    }

    // grab a ladder / vines: walk into it, or catch it while falling past
    if (this.climbCooldownT <= 0 && (input.fwd > 0 || (!this.grounded && this.vel.y < 0))) {
      const c = this.findClimbable();
      if (c) { this.startClimb(c); this.updateClimb(dt, input); return; }
    }

    // jump
    let jumped = false;
    if (this.jumpBufT > 0 && this.coyoteT > 0) {
      this.vel.y = P.jumpVel;
      this.grounded = false;
      this.coyoteT = 0;
      this.jumpBufT = 0;
      jumped = true;
      if (this.sliding) {
        // slide-jump: keep momentum and add a boost along the slide direction
        const sh = this.hSpeed;
        if (sh > 1e-4) {
          const ns = Math.max(Math.min(sh + P.slideJumpBoost, P.slideJumpMax), sh);
          this.vel.x *= ns / sh; this.vel.z *= ns / sh;
        }
        this.endSlide();
        this.events.push({ type: 'slideJump' });
      }
      this.stamina = Math.max(0, this.stamina - P.stamJump);
      this.stamDelayT = P.stamDelay;
      this.events.push({ type: 'jump' });
    }

    // horizontal velocity
    hs = this.hSpeed;
    if (this.sliding) {
      this.slideTime += dt;
      const ns = Math.max(0, hs - P.slideFriction * dt);
      if (hs > 1e-4) {
        let dx = this.vel.x / hs, dz = this.vel.z / hs;
        if (hasWish) {
          dx += wx * P.slideSteer * dt; dz += wz * P.slideSteer * dt;
          const l = Math.hypot(dx, dz); dx /= l; dz /= l;
        }
        this.vel.x = dx * ns; this.vel.z = dz * ns;
      }
      if (!input.crouch || ns < P.slideEndSpeed || this.slideTime > P.slideMaxTime) this.endSlide();
    } else if (this.grounded) {
      let target = this.crouching ? P.crouchSpeed : this.sprinting ? P.sprintSpeed : P.walkSpeed;
      if (input.fwd < 0) target *= P.backMult;
      const tx = wx * target, tz = wz * target;
      const dot = hs > 0.1 ? (this.vel.x * wx + this.vel.z * wz) / hs : 1;
      if (!hasWish) {
        this.approach(tx, tz, P.groundDecel * dt);
      } else if (hs > target + 0.1 && dot > 0.3) {
        // faster than normal (after a slide / slide-jump): turn freely,
        // but only bleed speed off slowly so momentum carries
        const ns = Math.max(target, hs - P.overspeedDecel * dt);
        let dx = this.vel.x / hs, dz = this.vel.z / hs;
        const t = Math.min(1, 6 * dt);
        dx += (wx - dx) * t; dz += (wz - dz) * t;
        const l = Math.hypot(dx, dz) || 1;
        this.vel.x = dx / l * ns; this.vel.z = dz / l * ns;
      } else {
        // more grip the harder you change direction, so turns are crisp but starts are smooth
        const accel = lerp(P.turnAccel, P.groundAccel, clamp(dot, 0, 1));
        this.approach(tx, tz, accel * dt);
      }
    } else if (hasWish) {
      // air: you can steer, but not gain speed beyond what you had
      const cap = Math.max(hs, P.walkSpeed);
      let nx = this.vel.x + wx * P.airAccel * dt;
      let nz = this.vel.z + wz * P.airAccel * dt;
      const nl = Math.hypot(nx, nz);
      if (nl > cap) { nx *= cap / nl; nz *= cap / nl; }
      this.vel.x = nx; this.vel.z = nz;
    }

    // gravity
    let g = P.gravity;
    if (this.vel.y < 0) g *= P.fallMult;
    else if (this.vel.y > 0 && !input.jumpHeld) g *= P.jumpCutMult;
    this.vel.y = Math.max(this.vel.y - g * dt, -40);

    if ((this.sliding || this.crouching) && this.grounded) this.funnelIntoPassages(dt);

    // move + collide, one axis at a time
    const wasGrounded = this.grounded;
    this.moveHorizontal('x', this.vel.x * dt);
    this.moveHorizontal('z', this.vel.z * dt);
    const vyBefore = this.vel.y;
    this.grounded = false;
    this.moveVertical(this.vel.y * dt);
    if (!this.grounded && wasGrounded && !jumped && this.vel.y <= 0) this.snapDown();

    if (this.grounded) this.groundY = this.pos.y;
    this.justLanded = this.grounded && !wasGrounded;
    if (this.justLanded) {
      const impact = -vyBefore;
      this.events.push({ type: 'land', impact });
      this.landVel -= Math.min(impact, 20) * 0.022;
    }
    if (this.sliding && !this.grounded && !jumped) this.endSlide(); // slid off a ledge

    // stamina
    const moving = this.hSpeed > 1;
    if (this.sprinting && this.grounded && moving) {
      this.stamina -= P.stamSprint * dt;
      this.stamDelayT = P.stamDelay;
    } else {
      this.stamDelayT = Math.max(0, this.stamDelayT - dt);
      if (this.stamDelayT <= 0) {
        this.stamina = Math.min(P.stamMax, this.stamina + P.stamRegen * (moving ? 1 : 1.4) * dt);
      }
    }
    if (this.stamina <= 0) {
      this.stamina = 0;
      if (!this.exhausted) { this.exhausted = true; this.events.push({ type: 'exhausted' }); }
    }
    if (this.exhausted && this.stamina >= P.stamRecover) this.exhausted = false;

    if (this.pos.y < -20) this.reset();
  }

  // ---------- camera (runs every rendered frame) ----------
  updateCamera(camera, dt, alpha, input, baseFov) {
    const x = lerp(this.prevPos.x, this.pos.x, alpha);
    const y = lerp(this.prevPos.y, this.pos.y, alpha);
    const z = lerp(this.prevPos.z, this.pos.z, alpha);
    const h = lerp(this.prevHeight, this.height, alpha);
    const hs = this.hSpeed;

    // smooth out step-ups and stair descents
    this.stepOffset *= Math.exp(-16 * dt);

    // landing dip: a spring that pulls the camera back to 0
    const k = 170, c = 2 * Math.sqrt(k) * 0.85;
    this.landVel += (-k * this.landOffset - c * this.landVel) * dt;
    this.landOffset += this.landVel * dt;

    // head bob
    let targetAmp = 0, stride = 1.5;
    const onFeet = this.grounded && !this.sliding;
    if (onFeet && hs > 0.3) {
      const t = clamp((hs - P.walkSpeed) / (P.sprintSpeed - P.walkSpeed), 0, 1);
      targetAmp = this.crouching ? 0.45 : 1 + t * 0.6;
      stride = this.crouching ? 0.9 : lerp(1.5, 2.7, t);
    }
    this.bobAmp += (targetAmp - this.bobAmp) * (1 - Math.exp(-10 * dt));
    if (onFeet) {
      const prev = this.bobPhase;
      this.bobPhase += hs * dt * Math.PI / stride;
      const H = Math.PI / 2;
      if (hs > 0.5 && Math.floor((this.bobPhase + H) / Math.PI) !== Math.floor((prev + H) / Math.PI)) {
        this.events.push({ type: 'step', kind: this.crouching ? 'crouch' : this.sprinting ? 'sprint' : 'walk' });
      }
    }
    const s = Math.sin(this.bobPhase);
    const bobY = (0.5 - s * s) * 0.05 * this.bobAmp;
    const bobX = s * 0.03 * this.bobAmp;
    const bobRoll = s * 0.004 * this.bobAmp;

    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    camera.position.set(
      x + rx * bobX,
      y + h - P.eyeDrop + bobY + this.stepOffset + this.landOffset,
      z + rz * bobX
    );

    // vault animation: look down at your hands and tilt to one side as you go over
    let vPitch = 0, vRoll = 0;
    if (this.vault.active && this.vault.high) {
      // look up at the ledge while straining, then tip forward over the edge
      const t = Math.min(this.vault.t, 1), PULL = 0.68;
      if (t < PULL) {
        const k = Math.sin(Math.PI * t / PULL);
        const strain = t > 0.14 ? 1 : 0;
        vPitch = 0.16 * k + strain * (Math.sin(t * 95) * 0.004 + Math.sin(t * 57) * 0.003);
        vRoll = this.vault.side * 0.04 * k + strain * Math.sin(t * 71) * 0.004;
      } else {
        const k = Math.sin(Math.PI * (t - PULL) / (1 - PULL));
        vPitch = -0.3 * k;
        vRoll = this.vault.side * 0.08 * k;
      }
    } else if (this.vault.active) {
      const t = Math.min(this.vault.t, 1);
      const k = Math.sin(Math.PI * t);
      vPitch = -0.2 * k * (this.vault.kind === 'mantle' ? 1.3 : 1);
      vRoll = this.vault.side * 0.075 * k;
    } else if (this.climb.active) {
      vRoll = Math.sin(this.climbPhase) * 0.02;
    }

    // lean into slides and strafes
    const targetRoll = (this.sliding ? 0.06 : 0) - input.side * 0.012;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-8 * dt));
    camera.rotation.set(this.pitch + this.landOffset * 0.35 + vPitch, this.yaw, this.roll + bobRoll + vRoll);

    // FOV widens with speed
    const sf = clamp((hs - P.walkSpeed) / (P.slideJumpMax - P.walkSpeed), 0, 1);
    const targetFov = baseFov + sf * 18 + (this.sliding ? 4 : 0);
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-5 * dt));
    camera.updateProjectionMatrix();
  }
}
