// The entity's movement + senses on the house's two floor grids (+ the garden).
// It is far too big for the vents, wall holes, floor holes and the garden ladder. It only fits through real
// doorways (crawling flat to get through them), and it can only change floor by the grand staircase —
// so dropping through a vent or the rotten floor, or climbing out of the bedroom window, loses it.
//
// Senses (nothing here is ever shown to the player):
//   sight  — a proximity radius around it. Inside it, it sees you if a straight line from its eyes to your
//            head or chest isn't blocked by anything solid — in 3D, so heights matter: it looks over low
//            furniture from 4 m up, crouching behind something tall enough hides you, floors and railings
//            block it, and when it's crawling its eyes are near the floor.
//   noise  — mostly drawers (rummaging, a drawer sliding open), things you throw landing or smashing, the
//            well winch, a wrong code on the door lock, hard landings — and, faintly, sliding.
//            Sprinting doesn't bother it. It hears through walls; a floor between you muffles it.
//
// States:
//   roam    patrol the halls
//   alert   heard something -> hurry to the sound
//   chase   sees you -> runs you down; loses sight of you for 3 s -> straight back to roaming
//   search  look around where it heard something, then back to roaming
//   smash   it SAW you get into a locker -> goes to it, knocks it over (the locker is ruined)
//   stagger short recovery after knocking a locker over — your head start
//   attack  close enough in a chase: rears up and swipes (25 damage), then recovers for a moment
//   (hide in a locker while it ISN'T looking, and it walks straight past)
//
// It also reports things to make sound for (ai.events): 'step' (its feet slamming down), 'screech' (it just
// spotted you), 'swipe' (an attack).
const EntityAI = (function () {
  // cells the entity can stand on. Everything else is wall, furniture, or a gap it can't fit through:
  //   V / v vents, H wall holes, O rotten floor, L ladder, W window, furniture, lockers, drawers
  const WALKABLE = ['.Dsy', '.D', '.Dz'];   // per floor: floor, doorways, the stairs (+ the garden on the ground floor)
  // feet can rest on low furniture tops (anything taller and they just stay on the floor)
  const FOOT_H = { k: 1.0, n: 1.07, S: 0.9, j: 0.8, l: 0.42, B: 0.66, f: 0.45, G: 0.95, C: 1.05, K: 0.95 };

  const T = {
    roamSpeed: 2.2,       // m/s
    alertSpeed: 6.0,      // hurrying toward a noise
    chaseSpeed: 8.4,      // a bit slower than your sprint (9.2): a straight sprint pulls away until your stamina runs out
    searchSpeed: 3.5,
    crawlMult: 0.8,       // speed while flattened out (~7.4 m/s in a chase: it scuttles through doorways)
    turnRate: 3.6,        // rad/s (standing)
    crawlTurnRate: 2.6,
    crawlBlend: 3.0,      // posture change speed (1/s)
    sightRadius: 11,      // its proximity: inside this (and not behind a wall) it sees you
    loseTime: 3,          // seconds out of sight before it gives up the chase
    searchTime: 5,        // looks around the last-seen / heard spot this long
    seenEnter: 0.5,       // saw you within this many seconds of you getting into a locker = it saw you hide
    repath: 0.4,
    stopDist: 1.6,        // never walks closer than this (it attacks instead)
    attackReach: 2.6,     // starts a swipe when you're this close
    attackWindup: 0.4,    // rears up before the swipe (s) — a moment to dodge
    attackHitRange: 3.2,  // you're still this close when the swipe lands -> hit
    attackRecover: 1.2,   // shakes itself off after a swipe (s): your chance to get away
    damage: 25,
    screechCooldown: 8,   // won't screech again this soon after the last one (s)
    roomCost: 6,          // while roaming, walking through a room costs this much more than a hall
    // how far each sound carries (m, straight line, through walls)
    // sprinting makes no noise it cares about; sliding only carries a little way. Drawers are what bring it.
    noise: { slide: 5, land: 10, rummage: 10, drawer: 26 },
    smashReach: 2.4,      // how close to a locker it gets before knocking it over
    windup: 0.55,         // rears back before the hit (s)
    stagger: 1.2,         // recovery after knocking it over (s)
    smashGiveUp: 15,      // can't get to the locker in this long -> gives up
    spawnDelay: 20,       // seconds into the game before it comes in through the garage
  };

  function create({ world, scene, player, game }) {
    const L = world.layout;
    if (!L || !L.floors) return null;
    const { W, H, CELL } = L;
    const STOREY = L.STOREY, NF = L.floors.length, N = W * H;
    const FY = L.floorY || [0, STOREY];
    const ch = (f, c, r) => (c < 0 || r < 0 || c >= W || r >= H ? '#' : L.floors[f][r][c]);
    const id = (f, c, r) => f * N + r * W + c;
    const fOf = i => (i / N) | 0, cOf = i => (i % N) % W, rOf = i => ((i % N) / W) | 0;
    const colOf = x => Math.floor(x / CELL + W / 2), rowOf = z => Math.floor(z / CELL + H / 2);
    const cx = c => (c + 0.5 - W / 2) * CELL, cz = r => (r + 0.5 - H / 2) * CELL, ez = r => (r - H / 2) * CELL;
    // staircases: cells on floor s.f; the low end at lowRow (left onto the same floor at lowExit), the high end at
    // highRow, which joins floor s.upper at highExit
    const SL = (L.stairsList || []).map(s0 => {
      const s = Object.assign({}, s0), sg = Math.sign(s.lowRow - s.highRow);
      s.sg = sg; s.lowExit = s.lowRow + sg; s.highExit = s.highRow - sg;
      s.run = (Math.abs(s.lowRow - s.highRow) + 1) * CELL;
      s.zLow = sg > 0 ? ez(s.lowRow + 1) : ez(s.lowRow);
      s.y0 = FY[s.f]; s.y1 = FY[s.f] + s.steps * s.rise;
      s.cm = (s.c0 + s.c1) / 2;
      return s;
    });
    const stairAt = (f, c, r) => { for (const s of SL) if (s.f === f && c >= s.c0 && c <= s.c1 && (r - s.lowRow) * (r - s.highRow) <= 0) return s; return null; };
    const isStair = (f, c, r) => !!stairAt(f, c, r);
    const stairH = (s, z) => s.y0 + Math.max(0, Math.min(1, (z - s.zLow) * -s.sg / s.run)) * (s.y1 - s.y0);
    // which floor the player (or a sound) is on, from its height
    const floorOfY = y => (y > STOREY - 1.2 ? 1 : NF > 2 && y < FY[2] + 1.8 ? 2 : 0);
    const lowCeiling = f => FY[f] < 0;             // the basement: it has to crawl the whole way

    // ---------- the grid as the entity sees it ----------
    const walk = new Uint8Array(NF * N), tight = new Uint8Array(NF * N), room = new Uint8Array(NF * N), cost = new Float32Array(NF * N);
    for (let f = 0; f < NF; f++) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) walk[id(f, c, r)] = WALKABLE[f].includes(ch(f, c, r)) ? 1 : 0;
    for (const z of L.zones || []) if (!z.hall) for (let r = z.r0; r <= z.r1; r++) for (let c = z.c0; c <= z.c1; c++) room[id(z.f, c, r)] = 1;
    const isWalk = (f, c, r) => c >= 0 && r >= 0 && c < W && r < H && walk[id(f, c, r)] === 1;
    for (let f = 0; f < NF; f++) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!isWalk(f, c, r)) continue;
      const k = ch(f, c, r), i = id(f, c, r);
      // has to crawl: doorways (2.8 m lintel), or squeezed between two walls
      tight[i] = (k === 'D' || lowCeiling(f) || (!isWalk(f, c - 1, r) && !isWalk(f, c + 1, r)) || (!isWalk(f, c, r - 1) && !isWalk(f, c, r + 1))) ? 1 : 0;
      let near = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (!isWalk(f, c + dc, r + dr)) near++;
      cost[i] = 1 + (near ? 1.5 : 0) + (tight[i] ? 1 : 0);
    }
    // can it step from one cell straight to the next? A staircase can only be entered / left at its ends:
    // the low end from the floor it stands on, and the high end from the floor it climbs to.
    function canStep(fa, ca, ra, fb, cb, rb) {
      if (fa !== fb) {
        if (ca !== cb) return false;
        for (const s of SL) {
          if (ca < s.c0 || ca > s.c1) continue;
          if ((fa === s.f && fb === s.upper && ra === s.highRow && rb === s.highExit) || (fa === s.upper && fb === s.f && ra === s.highExit && rb === s.highRow)) return true;
        }
        return false;
      }
      const a = stairAt(fa, ca, ra), b = stairAt(fb, cb, rb);
      if (a === b) return true;
      if ((a && b) || ca !== cb) return false;
      return (a && ra === a.lowRow && rb === a.lowExit) || (b && rb === b.lowRow && ra === b.lowExit);
    }
    // the other floor's cell joined to this one by a staircase (or -1)
    function linkOf(f, c, r) {
      for (const s of SL) {
        if (c < s.c0 || c > s.c1) continue;
        if (f === s.f && r === s.highRow) return id(s.upper, c, s.highExit);
        if (f === s.upper && r === s.highExit) return id(s.f, c, s.highRow);
      }
      return -1;
    }
    // patrol spots: open hall cells on each floor (not inside a room, not a doorway), the garden, the basement
    const hallCells = L.floors.map(() => []), gardenCells = [], basementCells = [];
    for (let i = 0; i < NF * N; i++) {
      if (!walk[i]) continue;
      const f = fOf(i), c = cOf(i), r = rOf(i), k = ch(f, c, r);
      if (isStair(f, c, r) || k === 'D') continue;
      if (lowCeiling(f)) basementCells.push(i);
      else if (tight[i]) continue;
      else if (k === 'y') gardenCells.push(i);
      else if (!room[i]) hallCells[f].push(i);
    }

    // nearest cell it can stand on, on floor f (for targets it can't reach: you in a vent, on furniture...)
    function nearestWalk(f, c, r) {
      if (isWalk(f, c, r)) return id(f, c, r);
      const seen = new Uint8Array(N), c0 = Math.max(0, Math.min(W - 1, c)), r0 = Math.max(0, Math.min(H - 1, r)), q = [r0 * W + c0];
      seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], qc = i % W, qr = (i / W) | 0;
        if (walk[f * N + i]) return f * N + i;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = qc + dc, nr = qr + dr;
          if (nc < 0 || nr < 0 || nc >= W || nr >= H || seen[nr * W + nc]) continue;
          seen[nr * W + nc] = 1; q.push(nr * W + nc);
        }
      }
      return -1;
    }

    // ---------- A* over both floors (8 directions, no cutting corners). roaming = keep to the halls ----------
    const g = new Float32Array(NF * N), came = new Int32Array(NF * N), closed = new Uint8Array(NF * N);
    function findPath(from, to, roaming) {
      if (from < 0 || to < 0) return null;
      g.fill(Infinity); came.fill(-1); closed.fill(0);
      const tf = fOf(to), tc = cOf(to), tr = rOf(to);
      // heuristic: grid distance, or (on another floor) the shortest detour via a staircase
      const d2 = (c1, r1, c2, r2) => { const dc = Math.abs(c1 - c2), dr = Math.abs(r1 - r2); return Math.max(dc, dr) + 0.414 * Math.min(dc, dr); };
      const hEst = i => {
        const f = fOf(i), c = cOf(i), r = rOf(i);
        if (f === tf) return d2(c, r, tc, tr);
        let best = Infinity;
        for (const s of SL) best = Math.min(best, d2(c, r, s.cm, s.highRow) + d2(s.cm, s.highRow, tc, tr));
        return best;
      };
      const open = [from]; g[from] = 0;
      const fs = new Map([[from, hEst(from)]]);
      const relax = (cur, n, step) => {
        if (closed[n]) return;
        const ng = g[cur] + step * (cost[n] + (roaming && room[n] ? T.roomCost : 0));
        if (ng < g[n]) { g[n] = ng; came[n] = cur; fs.set(n, ng + hEst(n)); open.push(n); }
      };
      while (open.length) {
        let bi = 0;
        for (let k = 1; k < open.length; k++) if (fs.get(open[k]) < fs.get(open[bi])) bi = k;
        const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (cur === to) break;
        if (closed[cur]) continue;
        closed[cur] = 1;
        const f = fOf(cur), c = cOf(cur), r = rOf(cur);
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc, nr = r + dr;
          if (!isWalk(f, nc, nr) || !canStep(f, c, r, f, nc, nr)) continue;
          if (dc && dr && (!isWalk(f, c + dc, r) || !isWalk(f, c, r + dr) || !canStep(f, c, r, f, c + dc, r) || !canStep(f, c, r, f, c, r + dr))) continue;
          relax(cur, id(f, nc, nr), dc && dr ? 1.414 : 1);
        }
        const ln = linkOf(f, c, r);
        if (ln >= 0 && walk[ln]) relax(cur, ln, 1);
      }
      if (came[to] < 0 && from !== to) return null;
      const cells = [];
      for (let i = to; i >= 0; i = came[i]) { cells.push(i); if (i === from) break; }
      cells.reverse();
      return smoothPath(cells, roaming);
    }
    // straight-line check through walkable cells of one floor, with some width so it doesn't hug corners.
    // It never crosses the edge of the staircase (cls = whether the line runs along the stairs or not).
    function clearLine(f, x0, z0, x1, z1, roaming, half = 0.45, cls = null) {
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), n = Math.ceil(len / (CELL * 0.25));
      const px = -dz / (len || 1) * half * CELL, pz = dx / (len || 1) * half * CELL;
      if (cls === null) cls = isStair(f, colOf(x0), rowOf(z0));
      for (let k = 0; k <= n; k++) {
        const x = x0 + dx * k / n, z = z0 + dz * k / n;
        for (const s of [-1, 0, 1]) {
          const c = colOf(x + px * s), r = rowOf(z + pz * s);
          if (!isWalk(f, c, r)) return false;
          if (isStair(f, c, r) !== cls) return false;
          if (roaming && room[id(f, c, r)] && s === 0) return false;
        }
      }
      return true;
    }
    function smoothPath(cells, roaming) {
      const pts = cells.map(i => ({ x: cx(cOf(i)), z: cz(rOf(i)), f: fOf(i) }));
      const out = [pts[0]];
      const cls = i => isStair(pts[i].f, cOf(cells[i]), rOf(cells[i]));
      let a = 0;
      while (a < pts.length - 1) {
        let b = pts.length - 1;
        const ok = b2 => {
          for (let k = a; k <= b2; k++) if (pts[k].f !== pts[a].f || cls(k) !== cls(a)) return false;
          return clearLine(pts[a].f, pts[a].x, pts[a].z, pts[b2].x, pts[b2].z, roaming && !room[cells[a]] && !room[cells[b2]], 0.45, cls(a));
        };
        while (b > a + 1 && !ok(b)) b--;
        pts[b].cls = cls(b);
        out.push(pts[b]); a = b;
      }
      // getting on / off the stairs (or changing floor): it has to actually reach these points, not cut the corner
      pts[0].cls = cls(0);
      for (let k = 1; k < out.length; k++) {
        const pr = out[k - 1], cu = out[k], nx = out[k + 1];
        if (pr.f !== cu.f || pr.cls !== cu.cls || (nx && (nx.f !== cu.f || nx.cls !== cu.cls))) cu.hard = true;
      }
      return out;
    }

    // ---------- senses ----------
    // 3D line of sight against every solid box in the level (walls, floors, furniture, railings...)
    function rayClear(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      for (const bx of world.boxes) {
        if (bx === col) continue;
        let t0 = 0.001, t1 = 0.999, ok = true;
        for (const [o, d, lo, hi] of [[a.x, dx, bx.min.x, bx.max.x], [a.y, dy, bx.min.y, bx.max.y], [a.z, dz, bx.min.z, bx.max.z]]) {
          if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) { ok = false; break; } continue; }
          let u0 = (lo - o) / d, u1 = (hi - o) / d;
          if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
          if (u0 > t0) t0 = u0;
          if (u1 < t1) t1 = u1;
          if (t0 >= t1) { ok = false; break; }
        }
        if (ok) return false;
      }
      return true;
    }
    const eyePos = new THREE.Vector3(), aimPos = new THREE.Vector3();
    function seesPlayer() {
      ent.eye(eyePos);
      const p = player.pos, h = player.height;
      for (const y of [p.y + h - 0.12, p.y + h * 0.55]) {
        aimPos.set(p.x, y, p.z);
        if (rayClear(eyePos, aimPos)) return true;
      }
      return false;
    }

    // ---------- body ----------
    const ent = Entity.create();
    scene.add(ent.root);
    const sp = L.entitySpawn || { c: 17.5, r: 20, f: 1 };
    const st = {
      x: cx(sp.c), z: cz(sp.r), f: sp.f, y: 0, yaw: sp.yaw || 0, dormant: T.spawnDelay, speed: 0, crawl: 0, lunge: 0,
      state: 'roam', path: null, wp: 0, wait: 2, repathT: 0, lastSeen: null, lostT: 0, seenT: 99, timer: 0,
      sees: false, locker: null, lastScreech: -99, clock: 0,
    };
    // how high the floor is under (x, z) on floor f
    const floorH = (f, x, z) => { const s = stairAt(f, colOf(x), rowOf(z)); return s ? stairH(s, z) : FY[f]; };
    st.y = floorH(st.f, st.x, st.z);
    const onStairs = () => stairAt(st.f, colOf(st.x), rowOf(st.z));
    const events = [];
    const onStep = (foot, crawl, speed) => events.push({ type: 'step', x: foot.x, y: foot.y, z: foot.z, crawl, speed });

    // the player bumps into it (an invisible box that follows its body)
    const col = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, noLedge: true };
    world.boxes.push(col);
    function updateCollider() {
      const r = 0.7 + st.crawl * 0.2, h = ent.HEIGHT * (1 - st.crawl) + 1.3 * st.crawl;
      const bx = st.x + Math.sin(st.yaw) * st.crawl * 0.6, bz = st.z + Math.cos(st.yaw) * st.crawl * 0.6;
      const p = player.pos, pr = 0.35;
      if (p.x + pr > bx - r && p.x - pr < bx + r && p.z + pr > bz - r && p.z - pr < bz + r && p.y < st.y + h && p.y + player.height > st.y) return;
      col.min.x = bx - r; col.max.x = bx + r; col.min.z = bz - r; col.max.z = bz + r;
      col.min.y = st.y; col.max.y = st.y + h;
    }

    const myNode = () => nearestWalk(st.f, colOf(st.x), rowOf(st.z));
    function goTo(node, roaming = false) {
      st.path = findPath(myNode(), node, roaming);
      st.wp = 1;
    }
    const goToPos = (x, z, y = 0) => goTo(nearestWalk(floorOfY(y), colOf(x), rowOf(z)));
    function pickRoam() {
      // a spot at least ~15 m away, so it really patrols: the halls of either floor, sometimes the garden
      for (let k = 0; k < 40; k++) {
        const roll = Math.random();
        const pool = roll < 0.38 ? hallCells[0] : roll < 0.76 ? hallCells[1] : roll < 0.9 ? gardenCells : basementCells;
        if (!pool.length) continue;
        const i = pool[(Math.random() * pool.length) | 0];
        const far = Math.hypot(cx(cOf(i)) - st.x, cz(rOf(i)) - st.z) + (fOf(i) !== st.f ? 12 : 0);
        if (far > 15 || k === 39) { goTo(i, true); return; }
      }
    }
    function setState(s) { st.state = s; st.timer = 0; }

    // a sound at (x, y, z) carrying `radius` metres. Floors muffle it: height counts extra.
    function noise(x, z, radius, y = 0) {
      if (Math.hypot(x - st.x, z - st.z, (y - st.y) * 1.6) > radius) return;
      if (['chase', 'smash', 'windup', 'stagger', 'attack', 'recover'].includes(st.state)) return;
      if (st.state === 'alert' && st.lastSeen && Math.hypot(x - st.lastSeen.x, z - st.lastSeen.z) < 3 && floorOfY(y) === st.lastSeen.f) return;
      st.lastSeen = { x, z, y, f: floorOfY(y) };
      setState('alert');
      goToPos(x, z, y);
    }

    // how flat it needs to be right here: look a few metres ahead and behind along its body
    function crawlNeed() {
      const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
      for (let d = -3.5; d <= 4.5; d += 0.5) {
        const c = colOf(st.x + fx * d), r = rowOf(st.z + fz * d);
        if (isWalk(st.f, c, r) && tight[id(st.f, c, r)]) return 1;
        if (ch(st.f, c, r) === 'D') return 1;
      }
      return 0;
    }

    const groundAt = (x, z) => {
      const c = colOf(x), r = rowOf(z), s = stairAt(st.f, c, r) || onStairs();
      if (s) return stairH(s, z);
      return FY[st.f] + (FOOT_H[ch(st.f, c, r)] || 0);
    };
    const fixFoot = (p, bx, bz) => {
      for (let k = 0; k < 8; k++) {
        const c = ch(st.f, colOf(p.x), rowOf(p.z));
        if (WALKABLE[st.f].includes(c) || FOOT_H[c] !== undefined) return;
        p.x += (bx - p.x) * 0.25; p.z += (bz - p.z) * 0.25;
      }
    };
    const turnToward = (x, z, rate) => {
      let da = Math.atan2(x - st.x, z - st.z) - st.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      st.yaw += Math.max(-rate, Math.min(rate, da));
      return da;
    };
    const atPathEnd = () => !st.path || st.wp >= st.path.length;
    // try to move to (nx, nz): stays on this floor, or crosses to the other at the top of the stairs
    function tryMove(nx, nz) {
      const c0 = colOf(st.x), r0 = rowOf(st.z), c1 = colOf(nx), r1 = rowOf(nz);
      if (c0 === c1 && r0 === r1) { st.x = nx; st.z = nz; return true; }
      if (isWalk(st.f, c1, r1) && canStep(st.f, c0, r0, st.f, c1, r1) &&
          (c0 === c1 || r0 === r1 || (isWalk(st.f, c1, r0) && isWalk(st.f, c0, r1)))) { st.x = nx; st.z = nz; return true; }
      const ln = linkOf(st.f, c0, r0);
      if (ln >= 0 && walk[ln] && cOf(ln) === c1 && rOf(ln) === r1) { st.f = fOf(ln); st.x = nx; st.z = nz; return true; }
      return false;
    }

    // ---------- test view: type "prox" to see its sight radius as a red aura ----------
    const aura = new THREE.Group();
    {
      const grad = document.createElement('canvas'); grad.width = 4; grad.height = 64;
      const gg = grad.getContext('2d'), lg = gg.createLinearGradient(0, 0, 0, 64);
      lg.addColorStop(0, '#000'); lg.addColorStop(1, '#fff');
      gg.fillStyle = lg; gg.fillRect(0, 0, 4, 64);
      const fade = new THREE.CanvasTexture(grad);
      const m = (o, extra = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: 0xff1a1a, transparent: true, opacity: o, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }, extra));
      // floor disc: faint in the middle, strong toward the edge
      const rad = document.createElement('canvas'); rad.width = rad.height = 128;
      const rg = rad.getContext('2d'), rgr = rg.createRadialGradient(64, 64, 0, 64, 64, 64);
      rgr.addColorStop(0, '#444'); rgr.addColorStop(0.8, '#999'); rgr.addColorStop(0.97, '#fff'); rgr.addColorStop(1, '#000');
      rg.fillStyle = rgr; rg.fillRect(0, 0, 128, 128);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 72), m(0.3, { alphaMap: new THREE.CanvasTexture(rad) }));
      // the edge ring + wall also show faintly through walls, so the full radius is always readable
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), m(0.85, { depthTest: false }));
      ring.renderOrder = 998;
      disc.rotation.x = ring.rotation.x = -Math.PI / 2;
      disc.position.y = 0.03; ring.position.y = 0.035;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 96, 1, true), m(0.4, { alphaMap: fade, depthTest: false }));
      wall.renderOrder = 997;
      wall.position.y = 1.1;
      aura.add(disc, ring, wall);
      aura.userData.mats = [disc.material, ring.material, wall.material];
      aura.scale.set(T.sightRadius, 1, T.sightRadius);
      aura.visible = false;
      scene.add(aura);
    }
    let auraT = 0;
    function updateAura(dt) {
      if (!aura.visible) return;
      auraT += dt;
      aura.position.set(st.x, st.y, st.z);
      aura.scale.set(T.sightRadius, 1, T.sightRadius);
      const hot = st.sees ? 1 : 0, pulse = 0.5 + 0.5 * Math.sin(auraT * (hot ? 10 : 3));
      const [disc, ring, wall] = aura.userData.mats;
      disc.opacity = 0.28 + hot * 0.25; ring.opacity = 0.5 + pulse * 0.4; wall.opacity = 0.12 + hot * 0.2 + pulse * 0.06;
    }

    function update(dt) {
      // not here yet: nothing hears, nothing sees, nothing moves. Then it comes in through the garage.
      if (st.dormant > 0) {
        st.dormant -= dt;
        game.events.length = 0;
        if (st.dormant > 0) return;
        ent.root.visible = true;
        updateCollider();
        events.push({ type: 'spawn', x: st.x, y: st.y, z: st.z });
      }
      const p = player.pos, hidden = game.hidden;
      const dx = p.x - st.x, dz = p.z - st.z, dist = Math.hypot(dx, dz);

      // --- sight: inside its proximity with no wall between ---
      st.sees = !hidden && dist < T.sightRadius && seesPlayer();
      st.seenT = st.sees ? 0 : st.seenT + dt;

      // --- events from the game (never shown to the player) ---
      for (const ev of game.events) {
        if (ev.type === 'noise') noise(ev.x, ev.z, T.noise[ev.kind] || ev.radius || 10, ev.y || 0);
        else if (ev.type === 'hide' && st.seenT < T.seenEnter) {
          // it watched you climb in
          st.locker = ev.locker; setState('smash');
          const l = ev.locker;
          goToPos(l.focus.x + l.normal.x * 1.5, l.focus.z + l.normal.z * 1.5, l.y || 0);
        }
      }
      game.events.length = 0;
      // loud movement carries through walls
      if (!hidden) {
        if (player.sliding) noise(p.x, p.z, T.noise.slide, p.y);
      }

      st.clock += dt;
      if (st.sees && !['chase', 'smash', 'windup', 'stagger', 'attack', 'recover'].includes(st.state)) {
        // spotted you: shriek, then run you down
        if (st.clock - st.lastScreech > T.screechCooldown) { events.push({ type: 'screech', x: st.x, z: st.z }); st.lastScreech = st.clock; }
        setState('chase'); st.repathT = 0;
      }
      if (st.sees) { st.lastSeen = { x: p.x, z: p.z, y: p.y, f: floorOfY(p.y) }; st.lostT = 0; }
      const level = Math.abs(p.y - st.y) < 2.2;          // you're at its height (not up on a gallery, or a floor away)
      st.timer += dt;

      // --- decide where to go ---
      let top = T.roamSpeed, hold = false, wantLunge = 0;
      switch (st.state) {
        case 'chase':
          top = T.chaseSpeed;
          if (!st.sees) st.lostT += dt;
          if (st.lostT > T.loseTime || hidden) {
            // lost you for 3 s (or you slipped into a locker while it wasn't looking): back to patrolling the halls
            setState('roam'); st.path = null; st.wait = 0.3;
          } else if (st.sees && dist < T.attackReach && level) {
            setState('attack');                                          // close enough: rear up and swipe
          } else if ((st.repathT -= dt) <= 0) {
            st.repathT = T.repath;
            const tgt = st.sees ? p : st.lastSeen;
            goToPos(tgt.x, tgt.z, tgt.y || 0);
          }
          break;
        case 'attack':
          hold = true;
          turnToward(p.x, p.z, T.turnRate * 1.5 * dt);
          wantLunge = Math.min(1, st.timer / T.attackWindup);
          if (st.timer >= T.attackWindup) {
            events.push({ type: 'swipe', x: st.x, z: st.z });
            // it lands if you're still close, in reach (not up on a gallery) and not tucked away in a locker
            if (!hidden && dist < T.attackHitRange && level && seesPlayer()) game.damage(T.damage, st.x, st.z);
            setState('recover');
          }
          break;
        case 'recover':
          hold = true;
          if (st.timer > T.attackRecover) { setState('chase'); st.lostT = 0; st.repathT = 0; }
          break;
        case 'alert':
          top = T.alertSpeed;
          if (atPathEnd()) setState('search');
          break;
        case 'search':
          top = T.searchSpeed;
          if (atPathEnd()) {
            st.yaw += Math.sin(st.timer * 1.7) * dt * 1.4;                 // looks around
            if (st.timer > T.searchTime) { setState('roam'); st.wait = 0.5; st.path = null; }
          }
          break;
        case 'smash': {
          top = T.chaseSpeed;
          const l = st.locker;
          if (!hidden) { if (st.sees) setState('chase'); else { setState('roam'); st.path = null; st.wait = 0.3; } break; }   // you got out first
          if (st.timer > T.smashGiveUp) { setState('roam'); st.path = null; break; }
          if (Math.hypot(l.focus.x - st.x, l.focus.z - st.z) < T.smashReach + st.crawl * 1.2) { setState('windup'); }
          else if (atPathEnd()) goToPos(l.focus.x + l.normal.x * 1.5, l.focus.z + l.normal.z * 1.5, l.y || 0);
          break;
        }
        case 'windup':
          hold = true;
          turnToward(st.locker.focus.x, st.locker.focus.z, T.turnRate * dt);
          wantLunge = Math.min(1, st.timer / T.windup);
          if (!game.hidden) { setState('chase'); break; }
          if (st.timer >= T.windup) {
            game.knockLocker(st.locker, st.x, st.z);
            st.locker = null; st.lastSeen = { x: p.x, z: p.z, y: p.y, f: floorOfY(p.y) };
            setState('stagger');
          }
          break;
        case 'stagger':
          hold = true;
          if (st.timer > T.stagger) { setState('chase'); st.lostT = 0; st.repathT = 0; }
          break;
        default:   // roam the halls
          if (atPathEnd() && (st.wait -= dt) <= 0) { pickRoam(); st.wait = 1 + Math.random() * 3; }
      }

      // --- posture: flatten out for doorways, galleries and narrow passages ---
      const need = crawlNeed();
      st.crawl += Math.max(-dt * T.crawlBlend, Math.min(dt * T.crawlBlend, need - st.crawl));
      st.lunge += (wantLunge - st.lunge) * Math.min(1, dt * (wantLunge > st.lunge ? 6 : 3));

      // --- move along the path ---
      let want = 0;
      // in a chase with a clear run at you, it goes straight for you (not where you were a moment ago)
      const direct = !hold && st.state === 'chase' && st.sees && level && floorOfY(p.y) === st.f && clearLine(st.f, st.x, st.z, p.x, p.z, false, 0.3);
      if (!hold && (direct || (st.path && st.wp < st.path.length))) {
        const w = direct ? p : st.path[st.wp];
        const td = Math.hypot(w.x - st.x, w.z - st.z);
        const lastWp = !direct && st.wp === st.path.length - 1;
        if (!direct && td < (lastWp || w.hard ? 0.4 : 0.9)) { st.wp++; }
        else {
          const tr = (T.turnRate + (T.crawlTurnRate - T.turnRate) * st.crawl) * dt;
          const da = turnToward(w.x, w.z, tr);
          // slow down to turn, and while squeezed flat (or still changing posture)
          const align = Math.max(0, Math.cos(da));
          want = top * align * align * (1 - (1 - T.crawlMult) * st.crawl) * (1 - Math.abs(need - st.crawl) * 0.3);
          if (lastWp) want = Math.min(want, td * 2);
        }
      }
      // in a chase it never walks right into you
      if (st.state === 'chase' && dist < T.stopDist && level) {
        want = 0;
        turnToward(p.x, p.z, T.turnRate * dt);
      }
      st.speed += (want - st.speed) * Math.min(1, dt * 3);
      const nx = st.x + Math.sin(st.yaw) * st.speed * dt, nz = st.z + Math.cos(st.yaw) * st.speed * dt;
      if (!tryMove(nx, nz)) {
        // sliding along a wall beats stopping dead
        if (!tryMove(nx, st.z) && !tryMove(st.x, nz)) { st.speed = 0; st.repathT = 0; if (st.state === 'roam') st.path = null; }
      }
      st.y = floorH(st.f, st.x, st.z);

      // --- pose the body ---
      ent.root.position.set(st.x, st.y, st.z);
      ent.root.rotation.y = st.yaw;
      ent.animate(dt, { speed: st.speed, crawl: smoothstep(st.crawl), lunge: st.lunge, groundAt, fixFoot, onStep });
      updateCollider();
      updateAura(dt);
    }

    // ---------- game over: its face lunges into yours ----------
    let js = null;
    function startJumpscare(camera) {
      const head = ent.head;
      ent.root.visible = false;
      aura.visible = false;
      head.parent.remove(head);
      camera.add(head);
      head.rotation.set(0, 0, 0);
      head.scale.setScalar(1.25);
      head.position.set(0, -0.2, -2.2);
      const light = new THREE.PointLight(0xffe2c8, 3, 5, 1.5);
      light.position.set(0.1, 0.25, -0.5);
      const red = new THREE.PointLight(0xff2010, 1.5, 4, 2);
      red.position.set(-0.3, -0.4, -1.2);
      camera.add(light, red);
      js = { t: 0, head };
    }
    function updateJumpscare(dt) {
      if (!js) return;
      js.t += dt;
      const t = js.t, k = 1 - Math.pow(1 - Math.min(1, t / 0.16), 3);     // slams in, fast
      const shake = 0.025 + 0.03 * Math.max(0, 1 - t);
      js.head.position.set((Math.random() - 0.5) * shake, -0.2 + 0.12 * k + (Math.random() - 0.5) * shake, -2.2 + 1.62 * k);
      js.head.rotation.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, Math.sin(t * 40) * 0.06 + (Math.random() - 0.5) * 0.1);
    }
    const smoothstep = t => t * t * (3 - 2 * t);

    // pose it once so it's standing there before the game starts
    ent.root.position.set(st.x, st.y, st.z); ent.root.rotation.y = st.yaw;
    ent.animate(0, { speed: 0, crawl: 0, groundAt, fixFoot });
    if (st.dormant > 0) ent.root.visible = false;        // hidden (and out of the way) until it arrives
    else updateCollider();

    return {
      update, noise, events, startJumpscare, updateJumpscare,
      // testing: put it somewhere (and pose it there)
      teleport(x, z, yaw = st.yaw, f = st.f) { st.x = x; st.z = z; st.f = f; st.y = floorH(f, x, z); st.yaw = yaw; st.path = null; ent.root.position.set(x, st.y, z); ent.root.rotation.y = yaw; ent.animate(0, { speed: 0, crawl: st.crawl, groundAt, fixFoot }); },
      toggleProx() { aura.visible = !aura.visible; updateAura(0); return aura.visible; },
      get state() { return st.state; },
      // chasing you (or about to hit you): for the heartbeat
      get arrived() { return st.dormant <= 0; },
      get hunting() { return ['chase', 'attack', 'recover', 'smash', 'windup', 'stagger'].includes(st.state); },
      get sees() { return st.sees; },
      get crawl() { return st.crawl; },
      get pos() { return { x: st.x, y: st.y, z: st.z }; },
      get floor() { return st.f; },
      get yaw() { return st.yaw; },
      tuning: T,
    };
  }

  return { create };
})();
