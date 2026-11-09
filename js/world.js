// World: shared building blocks + map registry.
// Every solid object is an axis-aligned box, stored in World.boxes for collision.
// Maps are functions in World.maps that build the level using the `api` helpers.
const World = (function () {
  const boxes = [];
  const climbables = [];
  const passages = [];      // crawl openings (vents) the player gets funnelled into when sliding/crouching
  const interactables = []; // drawers, lockers, doors — game logic lives in game.js
  const flickers = [];
  const trimCandidates = [];
  const maps = {};
  let trimEnabled = true;   // turned off around things that shouldn't get painted edges (stairs, tunnel)
  let scene;
  let metalMat, vineMat;

  // ---------- procedural textures ----------
  function canvasTex(draw, w = 256, h = w) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function gridTex(base, line, divisions, border) {
    return canvasTex((g, s) => {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 2500; i++) {          // grime
        const a = Math.random() * 0.08;
        g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.5})`;
        g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
      g.strokeStyle = line; g.lineWidth = 2;
      const step = s / divisions;
      for (let i = 0; i <= divisions; i++) {
        g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, s); g.stroke();
        g.beginPath(); g.moveTo(0, i * step); g.lineTo(s, i * step); g.stroke();
      }
      if (border) { g.strokeStyle = border; g.lineWidth = 3; g.strokeRect(1.5, 1.5, s - 3, s - 3); }
    });
  }

  function hazardTex() {
    return canvasTex((g, s) => {
      g.fillStyle = '#1a1a14'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#8a6d1c';
      for (let i = -s; i < s * 2; i += 64) {
        g.beginPath();
        g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - s, s); g.lineTo(i - s, s);
        g.closePath(); g.fill();
      }
    });
  }

  function vineTex() {
    return canvasTex((g, w, h) => {
      for (let s = 0; s < 5; s++) {
        let x = 30 + s * 48 + Math.random() * 20;
        g.strokeStyle = '#2b3a1c'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 16) {
          x += Math.sin(y * 0.03 + s) * 4;
          g.lineTo(x, y);
          if (Math.random() < 0.55) {   // leaves
            const side = Math.random() < 0.5 ? -1 : 1;
            g.save();
            g.fillStyle = ['#2f4a1e', '#3a5a24', '#253b17'][Math.floor(Math.random() * 3)];
            g.translate(x + side * 9, y);
            g.rotate(side * 0.7 + Math.random() * 0.4);
            g.beginPath(); g.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2); g.fill();
            g.restore();
          }
        }
        g.stroke();
      }
    }, 256, 512);
  }

  // material with UV settings. uv modes:
  //   'local' (default): texture repeats every `tile` metres, starting at each face's corner
  //   'world': texture locked to world position (walls line up across boxes); tileV = vertical repeat
  //   'unit' : each face shows the texture exactly once (furniture fronts)
  function mat(map, tile = 2, extra = {}) {
    const { uv = 'local', tileV, ...opts } = extra;
    const m = new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.92, metalness: 0.05 }, opts));
    m.userData.tile = tile;
    m.userData.tileV = tileV || tile;
    m.userData.uv = uv;
    return m;
  }

  // ---------- builders ----------
  // x/z = center, y = bottom. material can be an array (one per face), or null for an invisible collider.
  function box(x, y, z, w, h, d, material, collide = true) {
    let mesh = null;
    if (material) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m0 = Array.isArray(material) ? material[0] : material;
      const ud = m0.userData || {};
      const mode = ud.uv || 'local', tu = ud.tile || 2, tv = ud.tileV || tu;
      const uv = geo.attributes.uv;
      if (mode === 'world') {
        const p = geo.attributes.position, n = geo.attributes.normal, cy = y + h / 2;
        for (let i = 0; i < uv.count; i++) {
          const px = p.getX(i) + x, py = p.getY(i) + cy, pz = p.getZ(i) + z;
          if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, pz / tu, py / tv);
          else if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, px / tu, pz / tu);
          else uv.setXY(i, px / tu, py / tv);
        }
      } else if (mode === 'local') {
        const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
        for (let f = 0; f < 6; f++) {
          const vt = (f === 2 || f === 3) ? tu : tv;
          for (let i = 0; i < 4; i++) {
            const k = f * 4 + i;
            uv.setXY(k, uv.getX(k) * dims[f][0] / tu, uv.getY(k) * dims[f][1] / vt);
          }
        }
      }
      mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, y + h / 2, z);
      mesh.userData.static = true;
      scene.add(mesh);
    }
    if (collide) {
      const rec = {
        min: { x: x - w / 2, y: y, z: z - d / 2 },
        max: { x: x + w / 2, y: y + h, z: z + d / 2 },
      };
      boxes.push(rec);
      if (trimEnabled) trimCandidates.push(rec);
      W.lastCollider = rec;
    }
    return mesh;
  }

  // Ladder or vines on a wall face. axis = the wall's normal axis ('x' or 'z'),
  // sign = which way the face points (+1 / -1), surface = coordinate of the face,
  // center = position along the wall, bottom/top = heights.
  function climbable(kind, axis, sign, surface, center, width, bottom, top) {
    const h = top - bottom;
    const at = (n, t) => (axis === 'x' ? { x: n, z: t } : { x: t, z: n });
    if (kind === 'ladder') {
      const off = surface + sign * 0.09;
      for (const e of [-1, 1]) {
        const p = at(off, center + e * width / 2);
        box(p.x, bottom, p.z, 0.06, h, 0.06, metalMat, false);
      }
      for (let y = bottom + 0.3; y < top - 0.05; y += 0.3) {
        const p = at(off, center);
        box(p.x, y, p.z, axis === 'x' ? 0.04 : width, 0.04, axis === 'x' ? width : 0.04, metalMat, false);
      }
    } else {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h + 0.3), vineMat);
      const geoUv = m.geometry.attributes.uv;
      for (let i = 0; i < geoUv.count; i++) geoUv.setY(i, geoUv.getY(i) * (h + 0.3) / 2.5);
      const p = at(surface + sign * 0.03, center);
      m.position.set(p.x, bottom + (h + 0.3) / 2, p.z);
      m.rotation.y = axis === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
      addStatic(m);
    }
    climbables.push({ kind, axis, sign, surface, t0: center - width / 2 - 0.15, t1: center + width / 2 + 0.15, bottom, top });
  }

  function wornTex() {
    return canvasTex((g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 90; i++) {   // chipped, scuffed paint
        g.fillStyle = `rgba(30,25,20,${0.25 + Math.random() * 0.5})`;
        g.beginPath();
        g.ellipse(Math.random() * s, Math.random() * s, 2 + Math.random() * 14, 1 + Math.random() * 4, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    });
  }

  // Paint a worn band around the top edge of every ledge the player can climb:
  // pale = vault / climb (up to vaultMaxGround), orange = slow climb-up (up to highClimbMax)
  function paintLedges() {
    const tex = wornTex();
    const paleMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xcfc6a4, emissive: 0x2c2820, roughness: 0.8 });
    const orangeMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xc0741f, emissive: 0x2e1a06, roughness: 0.8 });
    paleMat.userData.tile = orangeMat.userData.tile = 0.6;
    const prevTrim = trimEnabled;
    trimEnabled = false;
    for (const b of trimCandidates) {
      const top = b.max.y, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      if (b.min.y > 0.05) continue;                         // must stand on the floor
      if (Math.max(w, d) < 1.0) continue;                   // skip posts / poles
      if (top <= P.vaultMinJump || top > P.highClimbMax) continue;
      const m = top <= P.vaultMaxGround ? paleMat : orangeMat;
      const H = 0.06, E = 0.006, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      box(cx, top - H, b.min.z - E / 2, w + 2 * E, H + 0.004, E, m, false);
      box(cx, top - H, b.max.z + E / 2, w + 2 * E, H + 0.004, E, m, false);
      box(b.min.x - E / 2, top - H, cz, E, H + 0.004, d, m, false);
      box(b.max.x + E / 2, top - H, cz, E, H + 0.004, d, m, false);
    }
    trimEnabled = prevTrim;
  }

  function sign(text, x, y, z, w = 4, h = 0.8, color = '#d9c26a') {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * h / w);
    const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = 6;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = color;
    g.font = `bold ${Math.floor(c.height * 0.5)}px Consolas, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 4);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: t, transparent: true })
    );
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  // flat line painted on the floor (no collision)
  let decalMat;
  function decal(x, z, w, d) {
    decalMat = decalMat || new THREE.MeshBasicMaterial({
      color: 0x5c4c22, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), decalMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.002, z);
    addStatic(m);
  }

  function lamp(x, y, z, flicker = false) {
    const light = new THREE.PointLight(0xffc48a, 1.25, 24, 2);
    light.position.set(x, y - 0.3, z);
    scene.add(light);
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.08, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffe2b8 })
    );
    fixture.position.set(x, y, z);
    scene.add(fixture);
    if (flicker) addFlicker(light, [fixture.material]);
  }

  function addStatic(mesh) {
    mesh.userData.static = true;
    scene.add(mesh);
    return mesh;
  }

  // a light (and the materials of its bulbs) that flickers and sometimes cuts out
  function addFlicker(light, mats = []) {
    flickers.push({ light, base: light.intensity, mats: mats.map(m => ({ m, c: m.color.clone() })), timer: Math.random() });
  }

  // Merge every static mesh that shares a material into one mesh: thousands of boxes -> a few dozen draw calls.
  // Multi-material boxes (one material per face) are split by face group and merged the same way.
  function mergeStatic() {
    scene.updateMatrixWorld(true);
    const groups = new Map();            // material -> [{ pos, nor, uv } slices in world space]
    const merged = [];
    const push = (material, slice) => {
      if (!groups.has(material)) groups.set(material, []);
      groups.get(material).push(slice);
    };
    for (const o of scene.children) {
      if (!o.isMesh || !o.userData.static) continue;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv ? g.attributes.uv.array : null;
      const cut = (start, count) => ({
        pos: P.subarray(start * 3, (start + count) * 3),
        nor: N.subarray(start * 3, (start + count) * 3),
        uv: U ? U.subarray(start * 2, (start + count) * 2) : new Float32Array(count * 2),
      });
      if (Array.isArray(o.material)) {
        if (!g.groups.length) continue;
        for (const grp of g.groups) push(o.material[grp.materialIndex], cut(grp.start, grp.count));
      } else {
        push(o.material, cut(0, g.attributes.position.count));
      }
      merged.push(o);
    }
    for (const [material, slices] of groups) {
      let n = 0;
      for (const s of slices) n += s.pos.length / 3;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o3 = 0, o2 = 0;
      for (const s of slices) { pos.set(s.pos, o3); nor.set(s.nor, o3); uv.set(s.uv, o2); o3 += s.pos.length; o2 += s.uv.length; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      scene.add(new THREE.Mesh(geo, material));
    }
    for (const o of merged) { scene.remove(o); o.geometry.dispose(); }
  }

  // ---------- map: movement test warehouse ----------
  maps.warehouse = function () {
    const floorMat = mat(gridTex('#33363b', '#2a2c30', 4, '#474b52'), 2);
    const wallMat = mat(gridTex('#292c30', '#222427', 2, '#31343a'), 4);
    const crateMat = mat(gridTex('#56432e', '#3c2f20', 2, '#6b5338'), 1);
    const platMat = mat(gridTex('#343f49', '#29323a', 2, '#475664'), 2);
    const pillarMat = mat(gridTex('#383838', '#2d2d2d', 1, '#434343'), 2);
    const hazMat = mat(hazardTex(), 1);

    // shell: floor, ceiling, 4 walls (80 x 80 m room, 7 m tall)
    box(0, -1, 0, 80, 1, 80, floorMat);
    box(0, 7, 0, 80, 1, 80, wallMat);
    box(0, 0, -40.5, 82, 7, 1, wallMat);
    box(0, 0, 40.5, 82, 7, 1, wallMat);
    box(-40.5, 0, 0, 1, 7, 80, wallMat);
    box(40.5, 0, 0, 1, 7, 80, wallMat);

    // --- SPRINT LANE (center, ~75 m straight run) ---
    decal(-1.6, 0, 0.12, 76);
    decal(1.6, 0, 0.12, 76);
    for (let z = 30; z >= -30; z -= 10) decal(0, z, 3.2, 0.12);
    sign('SPRINT LANE  ↑', 0, 3.2, -39.95, 6, 1.0);

    // --- SLIDE TUNNEL (roof at 1.25 m: too low to walk, crouch/slide only) ---
    trimEnabled = false;
    box(-9.25, 0, 12, 0.5, 1.6, 16, wallMat);
    box(-6.75, 0, 12, 0.5, 1.6, 16, wallMat);
    box(-8, 1.25, 12, 3, 0.35, 16, hazMat);
    trimEnabled = true;
    decal(-8, 25, 0.12, 9);
    sign('SLIDE TUNNEL', -8, 2.3, 20.05, 3.2, 0.6);

    // --- SLIDE-UNDER BARS (bar bottom at 1.15 m) ---
    for (const z of [20, 14, 8, 2, -4]) {
      box(-16, 1.15, z, 3, 0.3, 0.3, hazMat);
      box(-17.6, 0, z, 0.2, 1.45, 0.3, wallMat);
      box(-14.4, 0, z, 0.2, 1.45, 0.3, wallMat);
    }
    sign('SLIDE UNDER', -16, 2.3, 22, 3.2, 0.6);

    // --- MIXED: hurdles (jump) + bars (slide) ---
    [['h', 20], ['b', 13], ['h', 6], ['b', -1], ['h', -8], ['b', -15]].forEach(([type, z]) => {
      if (type === 'h') {
        box(-26, 0, z, 3, 0.55, 0.3, crateMat);
      } else {
        box(-26, 1.15, z, 3, 0.3, 0.3, hazMat);
        box(-27.6, 0, z, 0.2, 1.45, 0.3, wallMat);
        box(-24.4, 0, z, 0.2, 1.45, 0.3, wallMat);
      }
    });
    sign('JUMP + SLIDE', -26, 2.3, 22, 3.2, 0.6);

    // --- CLIMB: boxes getting taller (first one is a step, no jump needed) ---
    const heights = [0.4, 0.8, 1.2, 1.7, 2.2, 2.7];
    heights.forEach((h, i) => box(8, 0, 24 - i * 4, 2, h, 2, crateMat));
    sign('CLIMB', 8, 2.2, 26.5, 2.4, 0.6);
    climbable('vine', 'x', -1, 7, 4, 1.4, 0, 2.7);   // vines up the side of the tallest box

    // --- VAULT LANE: thin walls = vault over, the deep box = climb on top ---
    box(-34, 0, 20, 3, 0.95, 0.3, crateMat);
    box(-34, 0, 14, 3, 1.2, 0.4, wallMat);
    box(-34, 0, 8, 3, 1.45, 0.5, wallMat);
    box(-34, 0, 0, 3, 1.3, 3, crateMat);
    box(-34, 0, -7, 3, 1.0, 0.3, crateMat);
    box(-34, 0, -12, 3, 1.8, 0.4, wallMat);     // high climb over
    box(-34, 0, -17.5, 3, 2.1, 3, wallMat);     // high climb on top
    sign('HIGH CLIMB', -34, 2.9, -11.75, 2.6, 0.5);
    sign('VAULT', -34, 2.4, 22.5, 2.4, 0.6);

    // --- LADDER / VINE TOWER (5 m) ---
    box(-34, 0, 32, 4, 5, 4, wallMat);
    climbable('ladder', 'x', 1, -32, 32, 0.6, 0, 5);   // east face
    climbable('vine', 'z', -1, 30, -34, 1.8, 0, 5);    // south face (toward the vault lane)
    sign('LADDER  /  VINES', -34, 5.7, 29.95, 3.6, 0.6);

    // --- STAIRS + GAP JUMPS (platforms 2 m high) ---
    trimEnabled = false;
    for (let i = 0; i < 8; i++) {
      box(18, 0, 26 - i * 0.5 - 0.25, 3, (i + 1) * 0.25, 0.5, platMat);
    }
    trimEnabled = true;
    box(18, 0, 19, 3, 2, 6, platMat);  // z 16..22
    climbable('ladder', 'x', -1, 16.5, 19, 0.6, 0, 2); // get back up after falling
    sign('STAIRS → GAP JUMPS', 18, 3.0, 27.5, 4, 0.6);
    let edge = 16;
    for (const gap of [3, 4, 5, 6.5, 8]) {
      const start = edge - gap;
      const len = gap === 8 ? 6 : 4;
      box(18, 0, start - len / 2, 3, 2, len, platMat);
      climbable(gap === 5 ? 'vine' : 'ladder', 'x', -1, 16.5, start - len / 2, 0.6, 0, 2);
      const label = gap >= 6.5 ? `${gap}m  SLIDE-JUMP` : `${gap}m`;
      sign(label, 18, 3.4, edge - gap / 2, gap >= 6.5 ? 3.4 : 1.2, 0.5);
      edge = start - len;
    }

    // --- PILLAR FIELD (weave at sprint speed) ---
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let px = 27; px <= 37; px += 4) {
      for (let pz = -30; pz <= 30; pz += 5) {
        box(px + (rnd() - 0.5) * 2, 0, pz + (rnd() - 0.5) * 2, 1, 7, 1, pillarMat);
      }
    }
    sign('WEAVE', 32, 2.5, 34, 2.4, 0.6);

    // --- back-left clutter: crates + low tables to slide under ---
    for (let i = 0; i < 14; i++) {
      const w = 1 + rnd() * 1.5, h = 0.6 + rnd() * 1.6;
      box(-34 + rnd() * 26, 0, -20 - rnd() * 17, w, h, w, crateMat);
    }
    for (const [tx, tz] of [[-6, -18], [-12, -26]]) {
      box(tx, 1.1, tz, 3, 0.2, 3, platMat);
      for (const [lx, lz] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) {
        box(tx + lx, 0, tz + lz, 0.2, 1.1, 0.2, pillarMat);
      }
    }

    sign('PALE EDGE = VAULT     ORANGE EDGE = CLIMB UP     NO PAINT = TOO HIGH', 0, 3.4, 26, 9, 0.5);

    // --- lighting ---
    scene.add(new THREE.HemisphereLight(0x8d98ab, 0x141414, 0.4));
    scene.add(new THREE.AmbientLight(0xffffff, 0.06));
    lamp(0, 6.4, 26);
    lamp(-12, 6.4, 12);
    lamp(-25, 6.4, 6);
    lamp(9, 6.4, 14);
    lamp(19, 6.4, 0);
    lamp(32, 6.4, 12);
    lamp(0, 6.4, -12, true);
    lamp(-20, 6.4, -26);
    lamp(28, 6.4, -24, true);
  };

  // ---------- public ----------
  const W = {
    boxes, climbables, passages, interactables, maps,
    lastCollider: null,
    spawn: null,     // { x, y, z, yaw } — set by the map
    layout: null,    // grid layout, if the map has one (used by the debug minimap)
    mapName: null,
  };

  const api = {
    get scene() { return scene; },
    box, sign, decal, lamp, climbable, canvasTex, gridTex, mat, addStatic, addFlicker,
    get metalMat() { return metalMat; },
    get vineMat() { return vineMat; },
    setTrim(v) { const p = trimEnabled; trimEnabled = v; return p; },
    setSpawn(x, y, z, yaw = 0) { W.spawn = { x, y, z, yaw }; },
    setLayout(l) { W.layout = l; },
    addPassage(p) { passages.push(p); },   // { x, z, axis: 'x'|'z' (direction you crawl), depth, half (opening half-width) }
    addInteractable(it) { interactables.push(it); return it; },
    get lastCollider() { return W.lastCollider; },
    set(key, value) { W[key] = value; },   // extra map data for the game (props, crank spots, ...)
  };

  W.build = function (s, mapName) {
    scene = s;
    metalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5a5d61).convertSRGBToLinear(), roughness: 0.55, metalness: 0.6 });
    vineMat = new THREE.MeshStandardMaterial({
      map: vineTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9,
    });
    W.mapName = maps[mapName] ? mapName : 'warehouse';
    maps[W.mapName](api);
    paintLedges();
    mergeStatic();
  };

  W.removeCollider = function (rec) {
    const i = boxes.indexOf(rec);
    if (i >= 0) boxes.splice(i, 1);
  };

  W.update = function (dt) {
    for (const f of flickers) {
      f.timer -= dt;
      if (f.timer <= 0) {
        const r = Math.random();
        const level = r < 0.12 ? 0 : r < 0.25 ? 0.35 : 1;
        f.light.intensity = f.base * level;
        for (const { m, c } of f.mats) m.color.copy(c).multiplyScalar(0.15 + level * 0.85);
        f.timer = level === 1 ? 0.3 + Math.random() * 2.5 : 0.03 + Math.random() * 0.12;
      }
    }
  };

  return W;
})();
