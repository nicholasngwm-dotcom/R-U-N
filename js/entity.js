// The entity — model + rig (bends to stand or crawl). Movement / AI lives in entity-ai.js.
// A tall black shroud with a long, pale, ink-drawn face: sunken staring eyes, a long nose,
// and a huge stretched-open mouth that is an actual hole into darkness.
const Entity = (function () {
  const lin = h => new THREE.Color(h).convertSRGBToLinear();

  // ---------- face drawing (canvas pixels, 512 x 768) ----------
  const FW = 512, FH = 768;
  const EYE_L = [170, 236], EYE_R = [342, 236];
  const MOUTH = { x: 256, y: 560, rx: 112, ry: 186, irx: 90, iry: 162 };

  // ---------- face mask shape: a long, curved shield (keeps the drawing's proportions) ----------
  const MASK = { halfAngle: 1.15, r: 0.22, depth: 0.17, height: 0.66, curl: 0.1 };
  // u: 0..1 left->right, t: 0..1 bottom->top  ->  head-local point
  function maskPoint(u, t, inset = 0) {
    const a = (u * 2 - 1) * MASK.halfAngle;
    const back = MASK.curl * ((t - 0.55) / 0.45) ** 2;        // forehead and chin curve back
    const k = 1 - inset;
    return new THREE.Vector3(MASK.r * Math.sin(a) * k, (t - 0.5) * MASK.height, (MASK.depth * Math.cos(a) - back) * k);
  }
  function maskNormal(u, t) {
    const e = 0.01;
    const p = maskPoint(u, t), pu = maskPoint(u + e, t), pt = maskPoint(u, t + e);
    return pu.sub(p).cross(pt.sub(p)).normalize();
  }
  const fromPx = (px, py) => [px / FW, 1 - py / FH];

  function canvas(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return t;
  }

  // ---------- the face, drawn like an ink stipple drawing ----------
  function faceTexture() {
    return canvas(FW, FH, (g, w, h) => {
      const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
      g.clearRect(0, 0, w, h);          // outside the face outline stays transparent (cut away)

      // long pale face: narrower forehead, wide cheekbones, jaw stretched around the mouth
      g.save();
      g.beginPath();
      g.moveTo(256, 22);
      g.bezierCurveTo(372, 26, 452, 150, 456, 290);
      g.bezierCurveTo(462, 440, 420, 640, 372, 766);
      g.lineTo(140, 766);
      g.bezierCurveTo(92, 640, 50, 440, 56, 290);
      g.bezierCurveTo(60, 150, 140, 26, 256, 22);
      g.closePath();
      g.clip();
      const skin = g.createRadialGradient(256, 300, 40, 256, 360, 360);
      skin.addColorStop(0, '#f3efe4'); skin.addColorStop(0.75, '#e2dbcc'); skin.addColorStop(1, '#9a9384');
      g.fillStyle = skin; g.fillRect(0, 0, w, h);

      // stippling: only in the shadows (edges, eye sockets, under the cheekbones, beside the nose, around the mouth)
      for (let i = 0; i < 52000; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const ex = (x - 256) / 205, ey = (y - 390) / 375;
        const edge = Math.max(0, Math.min(1, (ex * ex + ey * ey) ** 2.6));
        const d = edge
          + 0.9 * gauss(x, y, EYE_L[0], EYE_L[1] + 8, 62, 44) + 0.9 * gauss(x, y, EYE_R[0], EYE_R[1] + 8, 62, 44)
          + 0.45 * gauss(x, y, 128, 400, 34, 85) + 0.45 * gauss(x, y, 384, 400, 34, 85)
          + 0.4 * gauss(x, y, 226, 350, 10, 60) + 0.18 * gauss(x, y, 288, 350, 10, 60)
          + 0.12 * gauss(x, y, 256, 150, 120, 26)
          + 0.55 * gauss(x, y, MOUTH.x, MOUTH.y + 40, MOUTH.rx * 1.3, MOUTH.ry * 1.05) * (Math.abs(x - MOUTH.x) > MOUTH.rx * 0.9 ? 1 : 0.4);
        if (Math.random() < d * 0.6) {
          g.fillStyle = `rgba(6,5,4,${0.5 + Math.random() * 0.5})`;
          const s = 0.8 + Math.random() * 1.5;
          g.fillRect(x, y, s, s);
        }
      }

      // eyes: deep sockets, staring irises with white showing around them, heavy lids
      for (const [cx, cy, side] of [[...EYE_L, -1], [...EYE_R, 1]]) {
        const sock = g.createRadialGradient(cx, cy + 6, 6, cx, cy + 6, 64);
        sock.addColorStop(0, 'rgba(0,0,0,0.9)'); sock.addColorStop(0.6, 'rgba(0,0,0,0.45)'); sock.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sock; g.beginPath(); g.ellipse(cx, cy + 6, 64, 46, 0, 0, Math.PI * 2); g.fill();
        const droop = side < 0 ? [7, 0] : [0, 7];
        g.fillStyle = '#c9c2b2';
        g.beginPath();
        g.moveTo(cx - 38, cy + droop[0]);
        g.quadraticCurveTo(cx, cy - 24, cx + 38, cy + droop[1]);
        g.quadraticCurveTo(cx, cy + 20, cx - 38, cy + droop[0]);
        g.fill();
        g.fillStyle = '#0a0807'; g.beginPath(); g.arc(cx, cy - 1, 12, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#030202'; g.lineCap = 'round';
        g.lineWidth = 8; g.beginPath(); g.moveTo(cx - 42, cy + droop[0] + 2); g.quadraticCurveTo(cx, cy - 30, cx + 42, cy + droop[1] + 2); g.stroke();
        g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - 34, cy + 11); g.quadraticCurveTo(cx, cy + 24, cx + 34, cy + 11); g.stroke();
        g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - 30, cy + 30); g.quadraticCurveTo(cx, cy + 42, cx + 30, cy + 30); g.stroke();   // bag under the eye
        g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - side * 26, cy - 50); g.quadraticCurveTo(cx + side * 8, cy - 47, cx + side * 40, cy - 32); g.stroke();
      }

      // long, thin nose
      g.strokeStyle = '#080605'; g.lineWidth = 2.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(240, 268); g.bezierCurveTo(236, 320, 229, 370, 228, 412); g.stroke();
      g.beginPath(); g.moveTo(273, 282); g.bezierCurveTo(279, 335, 286, 380, 285, 412); g.stroke();
      g.lineWidth = 2.2; g.beginPath(); g.moveTo(224, 416); g.quadraticCurveTo(256, 434, 289, 416); g.stroke();
      g.fillStyle = '#050403';
      g.beginPath(); g.ellipse(242, 424, 8, 4.5, 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(272, 424, 8, 4.5, -0.3, 0, Math.PI * 2); g.fill();

      // the mouth: pale stretched lips around a huge vertical hole
      g.fillStyle = '#efe9dc';
      g.beginPath(); g.ellipse(MOUTH.x, MOUTH.y, MOUTH.rx, MOUTH.ry, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#050403'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(MOUTH.x, MOUTH.y, MOUTH.rx, MOUTH.ry, 0, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1.1; g.strokeStyle = 'rgba(8,6,5,0.45)';
      for (let k = 0; k < 30; k++) {
        const a = (k / 30) * Math.PI * 2;
        g.beginPath();
        g.moveTo(MOUTH.x + Math.cos(a) * MOUTH.irx * 1.03, MOUTH.y + Math.sin(a) * MOUTH.iry * 1.03);
        g.lineTo(MOUTH.x + Math.cos(a) * MOUTH.rx * 0.94, MOUTH.y + Math.sin(a) * MOUTH.ry * 0.94);
        g.stroke();
      }
      g.restore();

      // cut the inside of the mouth out (transparent = a real hole in the face)
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(MOUTH.x, MOUTH.y, MOUTH.irx, MOUTH.iry, 0, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    });
  }

  // a pale curved ridge on transparent background — layered inside the mouth for depth
  function ridgeTexture(bend) {
    return canvas(256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(220,212,196,0.95)'; g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath(); g.moveTo(18, h / 2 - bend); g.quadraticCurveTo(w / 2, h / 2 + bend * 1.4, w - 18, h / 2 - bend); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(26, h / 2 - bend + 7); g.quadraticCurveTo(w / 2, h / 2 + bend * 1.4 + 7, w - 26, h / 2 - bend + 7); g.stroke();
    });
  }

  // black cloth with ink streaks running down it
  function shroudTexture() {
    return canvas(256, 512, (g, w, h) => {
      g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * w, len = 40 + Math.random() * 300, y = Math.random() * h;
        const v = 40 + Math.random() * 30;
        g.strokeStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.25})`;
        g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (Math.random() - 0.5) * 12, y + len / 2, x + (Math.random() - 0.5) * 8, y + len); g.stroke();
      }
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    });
  }

  // pale skin in the same ink-stipple style as the face. ribs: draw a gaunt ribcage on it
  function skinTexture(ribs) {
    return canvas(256, 512, (g, w, h) => {
      g.fillStyle = '#dad8d0'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 50; i++) {                                         // blotchy, bloodless shading
        const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 70;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(70,64,56,0.12)'); grd.addColorStop(1, 'rgba(70,64,56,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const dots = (n, fx) => { for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h; if (Math.random() < fx(x, y)) { g.fillStyle = `rgba(8,6,5,${0.4 + Math.random() * 0.5})`; g.fillRect(x, y, 1.3, 1.3); } } };
      if (ribs) {
        // lathe UV: u = 0 at the back, 0.5 at the front. Ribs curve down and around from the breastbone.
        const cx = w / 2;
        dots(26000, (x, y) => {
          const side = Math.abs(x - cx) / (w / 2);                            // 0 front .. 1 back
          let d = 0.12 + side * 0.5;
          for (let k = 0; k < 8; k++) {
            const ry = 70 + k * 30 + side * side * 40;                        // each rib droops toward the sides
            const gap = Math.abs(y - (ry + 14));                              // shadow under each rib
            if (gap < 9 && Math.abs(x - cx) > 10) d += 0.55 * (1 - gap / 9);
          }
          if (y > 330) d += (y - 330) / 300;                                  // sunken belly
          if (Math.abs(x - cx) < 6 && y < 300) d += 0.4;                      // breastbone
          return d * 0.55;
        });
      } else {
        dots(9000, () => 0.35);
      }
    });
  }

  // tattered black cloth: torn strips along the bottom edge and moth-eaten holes (transparent)
  function clothTexture() {
    return canvas(512, 512, (g, w, h) => {
      g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) {
        const x = Math.random() * w, y = Math.random() * h, len = 40 + Math.random() * 260, v = 30 + Math.random() * 30;
        g.strokeStyle = `rgba(${v},${v},${v},${0.12 + Math.random() * 0.2})`; g.lineWidth = 0.6 + Math.random() * 1.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 10, y + len); g.stroke();
      }
      g.globalCompositeOperation = 'destination-out';
      // torn strips: each column of cloth ends at a different length (canvas bottom = hem)
      let x = 0;
      while (x < w) {
        const sw = 6 + Math.random() * 26, len = Math.random() < 0.3 ? 0 : 20 + Math.random() * 200;
        g.beginPath();
        g.moveTo(x, h); g.lineTo(x, h - len); g.lineTo(x + sw * 0.5, h - len - 10 - Math.random() * 30); g.lineTo(x + sw, h - len); g.lineTo(x + sw, h);
        g.fill();
        x += sw + (Math.random() < 0.4 ? 3 + Math.random() * 8 : 0);
      }
      for (let i = 0; i < 26; i++) {                                         // holes
        g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h * 0.8, 3 + Math.random() * 14, 4 + Math.random() * 24, Math.random(), 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    });
  }

  // ---------- the body: almost human, wrong in every proportion ----------
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const SCALE = 1.5;                       // model units -> metres (about 4.5 m tall standing, fills a 6 m hall)

  // One continuous, smooth bone through a chain of joint points.
  // Segments stay straight; each joint is rounded off with a small fillet and swells slightly
  // (like a knuckle or knee) instead of being a separate ball stuck on. Both ends are capped round.
  //   pts: joint positions, radii: radius at each joint, opt.bulge: extra swelling per joint (x radius)
  // Returns { mesh, set(pts) } — set() reshapes the same mesh (same topology) so limbs can bend every frame.
  function makeBone(mat, pts, radii, opt = {}) {
    const bulge = opt.bulge || [], radial = opt.radial || 14, fillet = opt.fillet ?? 2.5;
    const maxR = Math.max(...radii), step = opt.step ?? Math.max(0.006, maxR * 0.7);
    const nJ = pts.length, jointK = [];
    let nP = 0;
    for (let i = 0; i < nJ; i++) {
      if (i === 0 || i === nJ - 1) { jointK.push(nP); nP += 1; } else { jointK.push(nP + 0.5); nP += 2; }
    }
    const P = Array.from({ length: nP }, () => new THREE.Vector3()), R = new Float32Array(nP), S = new Float32Array(nP);
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');

    // control points: interior joints are replaced by two fillet points either side of them
    function control(pts) {
      let k = 0;
      for (let i = 0; i < nJ; i++) {
        const p = pts[i];
        if (i === 0 || i === nJ - 1) { P[k].copy(p); R[k++] = radii[i]; continue; }
        const a = pts[i - 1], b = pts[i + 1];
        const dA = Math.max(1e-5, a.distanceTo(p)), dB = Math.max(1e-5, b.distanceTo(p));
        const f = Math.min(radii[i] * fillet, dA * 0.3, dB * 0.3);
        P[k].copy(p).lerp(a, f / dA); R[k++] = radii[i] + (radii[i - 1] - radii[i]) * f / dA;
        P[k].copy(p).lerp(b, f / dB); R[k++] = radii[i] + (radii[i + 1] - radii[i]) * f / dB;
      }
      S[0] = 0;
      for (let i = 1; i < nP; i++) S[i] = S[i - 1] + Math.max(1e-5, P[i].distanceTo(P[i - 1]));
    }
    const sAtK = k => (k % 1 ? (S[k - 0.5] + S[k + 0.5]) / 2 : S[k]);

    control(pts);
    const counts = [];
    for (let i = 0; i < nP - 1; i++) counts.push(Math.max(3, Math.ceil((S[i + 1] - S[i]) / step)));
    const CAP = 6, nBody = counts.reduce((a, b) => a + b, 0) + 1, nR = nBody + 2 * CAP, W = radial + 1;
    const rings = Array.from({ length: nR }, () => ({ c: new THREE.Vector3(), T: new THREE.Vector3(), s: 0, r: 0, tip: 0 }));
    const pos = new Float32Array(nR * W * 3), nor = new Float32Array(nR * W * 3), uv = new Float32Array(nR * W * 2), idx = [];
    for (let i = 0; i < nR - 1; i++) for (let j = 0; j < radial; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const cosA = [], sinA = [];
    for (let j = 0; j <= radial; j++) { const a = (j / radial) * Math.PI * 2; cosA.push(Math.cos(a)); sinA.push(Math.sin(a)); }
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3), norAttr = new THREE.BufferAttribute(nor, 3);
    geo.setAttribute('position', posAttr); geo.setAttribute('normal', norAttr); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const N = new THREE.Vector3(), B = new THREE.Vector3(), dir = new THREE.Vector3(), nv = new THREE.Vector3(), q = new THREE.Quaternion();
    const swells = [];

    function set(pts) {
      control(pts);
      swells.length = 0;
      for (let i = 0; i < nJ; i++) {
        const amt = (bulge[i] || 0) * radii[i];
        if (amt) swells.push(sAtK(jointK[i]), amt, radii[i] * 2.2);
      }
      const swell = s => { let v = 0; for (let k = 0; k < swells.length; k += 3) v += swells[k + 1] * Math.exp(-(((s - swells[k]) / swells[k + 2]) ** 2)); return v; };

      // rings along the length
      let ri = CAP;
      for (let i = 0; i < nP - 1; i++) {
        const len = S[i + 1] - S[i], cnt = counts[i];
        for (let k = 0; k < cnt; k++) {
          const f = k / cnt, t = (i + f) / (nP - 1), ring = rings[ri++];
          curve.getPoint(t, ring.c); curve.getTangent(t, ring.T);
          ring.s = S[i] + f * len; ring.r = R[i] + (R[i + 1] - R[i]) * f + swell(ring.s); ring.tip = 0;
        }
      }
      const last = rings[ri];
      last.c.copy(P[nP - 1]); curve.getTangent(1, last.T); last.s = S[nP - 1]; last.r = R[nP - 1] + swell(last.s); last.tip = 0;

      // rounded caps on both ends
      const first = rings[CAP];
      for (let m = 0; m < CAP; m++) {
        const th = (m / CAP) * Math.PI / 2;
        const a = rings[m], o0 = first.r * Math.cos(th);
        a.c.copy(first.c).addScaledVector(first.T, -o0); a.T.copy(first.T); a.s = -o0; a.r = first.r * Math.sin(th); a.tip = m === 0 ? -1 : 0;
        const b = rings[nR - 1 - m], o1 = last.r * Math.cos(th);
        b.c.copy(last.c).addScaledVector(last.T, o1); b.T.copy(last.T); b.s = last.s + o1; b.r = last.r * Math.sin(th); b.tip = m === 0 ? 1 : 0;
      }

      // parallel-transport frames (no twisting) + vertices with smooth analytic normals
      const T0 = rings[0].T;
      N.copy(Math.abs(T0.y) < 0.9 ? UP : V(1, 0, 0)).cross(T0).normalize();
      const s0 = rings[0].s, total = rings[nR - 1].s - s0;
      for (let i = 0; i < nR; i++) {
        const ring = rings[i];
        if (i > 0) { q.setFromUnitVectors(rings[i - 1].T, ring.T); N.applyQuaternion(q).normalize(); }
        B.copy(ring.T).cross(N);
        const a = rings[Math.max(0, i - 1)], b = rings[Math.min(nR - 1, i + 1)];
        const drds = (b.r - a.r) / Math.max(1e-6, b.s - a.s);
        for (let j = 0; j <= radial; j++) {
          dir.copy(N).multiplyScalar(cosA[j]).addScaledVector(B, sinA[j]);
          const k = (i * W + j) * 3;
          pos[k] = ring.c.x + dir.x * ring.r; pos[k + 1] = ring.c.y + dir.y * ring.r; pos[k + 2] = ring.c.z + dir.z * ring.r;
          if (ring.tip) nv.copy(ring.T).multiplyScalar(ring.tip);
          else nv.copy(dir).addScaledVector(ring.T, -drds).normalize();
          nor[k] = nv.x; nor[k + 1] = nv.y; nor[k + 2] = nv.z;
          const u = (i * W + j) * 2;
          uv[u] = j / radial; uv[u + 1] = (ring.s - s0) / total;
        }
      }
      posAttr.needsUpdate = true; norAttr.needsUpdate = true;
    }
    set(pts);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    if (opt.dynamic) mesh.frustumCulled = false;
    return { mesh, set };
  }
  const boneMesh = (group, pts, radii, mat, opt) => { const b = makeBone(mat, pts, radii, opt); group.add(b.mesh); return b.mesh; };

  // An oversized hand in its own frame: wrist at the origin, fingers hang down -Y and spread along Z.
  // Orient it with handBasis(). Fingers far too long, curling as they go.
  function hand(curl, mat) {
    const group = new THREE.Group();
    const down = V(0, -1, 0), lat = V(0, 0, 1), curlAxis = V(0, 0, 1);
    const palmEnd = down.clone().multiplyScalar(0.1);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);
    palm.position.copy(palmEnd).multiplyScalar(0.55);
    palm.scale.set(0.014, 0.068, 0.042);          // flat pad, wide across the knuckles (Z)
    group.add(palm);
    const fingers = [[-0.03, 0.19], [-0.01, 0.23], [0.01, 0.24], [0.03, 0.2]];
    fingers.forEach(([off, len], i) => {
      let p = palmEnd.clone().addScaledVector(lat, off * 0.95), d = down.clone();
      const chain = [p.clone().addScaledVector(down, -0.03), p.clone()];
      [0.45, 0.33, 0.22].forEach((f, s) => {
        d = d.clone().applyAxisAngle(curlAxis, curl * (0.6 + s * 0.4) + (i - 1.5) * 0.03);
        p = p.clone().addScaledVector(d, len * f);
        chain.push(p);
      });
      boneMesh(group, chain, [0.0095, 0.0088, 0.007, 0.0053, 0.0026], mat, { bulge: [0, 0.3, 0.32, 0.28, 0], radial: 10 });
    });
    // thumb, long and splayed out to the side
    let p = V(0, -0.04, -0.035), d = down.clone().addScaledVector(lat, -0.6).normalize();
    const chain = [p.clone().addScaledVector(lat, 0.02), p.clone()];
    for (let s = 0; s < 2; s++) {
      d = d.clone().applyAxisAngle(curlAxis, curl * 0.5);
      p = p.clone().addScaledVector(d, 0.07);
      chain.push(p);
    }
    boneMesh(group, chain, [0.011, 0.0095, 0.0075, 0.003], mat, { bulge: [0, 0.25, 0.3, 0], radial: 10 });
    return group;
  }
  const _m4 = new THREE.Matrix4(), _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3();
  function handBasis(handGroup, wrist, down, lateral) {
    _hy.copy(down).negate().normalize();
    _hz.copy(lateral).addScaledVector(_hy, -lateral.dot(_hy)).normalize();
    _hx.copy(_hy).cross(_hz);
    handGroup.position.copy(wrist);
    handGroup.quaternion.setFromRotationMatrix(_m4.makeBasis(_hx, _hy, _hz));
  }

  // two-bone IK: elbow/knee position for a chain a -> (joint) -> c with bone lengths l1, l2, bending toward pole
  const _ax = new THREE.Vector3(), _pp = new THREE.Vector3();
  function ik(a, c, l1, l2, pole, outJoint, outEnd) {
    _ax.copy(c).sub(a);
    let d = _ax.length();
    _ax.divideScalar(d || 1);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
    outEnd.copy(a).addScaledVector(_ax, d);                       // can't reach further than the bones allow
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    _pp.copy(pole).addScaledVector(_ax, -pole.dot(_ax));
    if (_pp.lengthSq() < 1e-8) _pp.set(0, 1, 0);
    _pp.normalize();
    outJoint.copy(a).addScaledVector(_ax, along).addScaledVector(_pp, h);
  }

  // ---------- rest pose (model units, standing) ----------
  const PELVIS = V(0, 1.5, -0.03);
  const LEG_REST = [
    // hip,                     knee,                     ankle,                    tip
    [V(-0.11, 1.52, 0.04), V(-0.78, 2.42, 0.58), V(-1.12, 0.62, 0.92), V(-1.2, 0.0, 1.0)],
    [V(0.11, 1.52, 0.03), V(0.8, 2.36, 0.5), V(1.18, 0.58, 0.82), V(1.27, 0.0, 0.9)],
    [V(-0.1, 1.48, -0.12), V(-0.72, 2.26, -0.72), V(-1.05, 0.66, -1.12), V(-1.12, 0.0, -1.22)],
    [V(0.1, 1.48, -0.13), V(0.66, 2.3, -0.78), V(0.98, 0.6, -1.18), V(1.04, 0.0, -1.3)],
  ];
  // crawling: legs pulled in narrow and stretched far forward / back, so the knees fold down low
  const LEG_CRAWL_FOOT = [V(-0.42, 0, 2.95), V(0.42, 0, 2.8), V(-0.42, 0, -2.8), V(0.42, 0, -2.95)];
  const SH = [V(-0.2, 2.18, 0.03), V(0.19, 2.15, 0.04)];
  const EL = [V(-0.82, 2.3, 0.16), V(0.8, 2.12, 0.3)];
  const WR = [V(-1.32, 1.9, 0.4), V(1.16, 1.58, 0.56)];
  const HAND_DOWN = [V(-0.35, -1, 0.15).normalize(), V(0.15, -1, 0.25).normalize()];
  const HAND_CURL = [-0.35, 0.45];
  // perpendicular offset of the rest knee/elbow from the hip-ankle / shoulder-wrist line: the "pole" it bends toward
  const poleOf = (a, j, c) => { const ax = c.clone().sub(a).normalize(); const v = j.clone().sub(a); return v.addScaledVector(ax, -v.dot(ax)).normalize(); };

  function buildBody(root, inner) {
    // charcoal bone for the limbs, ash-grey bone for the ribs and spine
    const bone = new THREE.MeshStandardMaterial({ map: skinTexture(false), color: lin(0x4a4741), roughness: 0.5, metalness: 0.2 });
    const ash = new THREE.MeshStandardMaterial({ map: skinTexture(false), color: lin(0xa29d93), roughness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ map: clothTexture(), color: lin(0x1a1a1a), roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.4 });

    // smooth curved bone (ribs, breastbone): tapers from r0 to r1 with rounded ends
    const tube = (pts, r0, r1, mat) => {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const len = curve.getLength(), rings = Math.max(24, Math.ceil(len / 0.008)), radial = 12;
      const geo = new THREE.TubeGeometry(curve, rings, 1, radial, false);
      const p = geo.attributes.position;
      for (let i = 0; i <= rings; i++) {
        const t = i / rings, c = curve.getPointAt(t);
        const end = Math.min(t * len, (1 - t) * len) / (r0 * 1.2);
        const r = (r0 + (r1 - r0) * t) * (end < 1 ? Math.sqrt(Math.max(0.04, 1 - (1 - end) ** 2)) : 1);
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
        }
      }
      geo.computeVertexNormals();
      inner.add(new THREE.Mesh(geo, mat));
      return curve;
    };
    // vertebra: a squashed rounded knob lying along the spine
    const knob = (p, r, mat, along) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
      s.position.copy(p);
      if (along) { s.quaternion.setFromUnitVectors(UP, along); s.scale.set(1.1, 0.7, 1); }
      inner.add(s);
    };

    // --- spine: hunched, from the pelvis up to a long neck that pushes the head forward ---
    const spinePts = [V(0, 1.5, -0.06), V(0, 1.72, -0.12), V(0, 1.96, -0.1), V(0.01, 2.16, -0.02), V(0.02, 2.3, 0.08), V(0.03, 2.42, 0.22)];
    const spine = tube(spinePts, 0.024, 0.019, ash);
    for (let t = 0; t <= 1.0001; t += 0.055) knob(spine.getPoint(t), 0.034 - t * 0.012, ash, spine.getTangent(t));    // vertebrae

    // --- ribcage: curved ribs around a hollow chest, some broken short ---
    for (let k = 0; k < 7; k++) {
      const y = 2.12 - k * 0.07, w = 0.15 + Math.sin((k / 6) * Math.PI) * 0.05;
      const sp = spine.getPoint(0.42 + (6 - k) * 0.045);
      for (const s of [-1, 1]) {
        const broken = (k + (s > 0 ? 1 : 0)) % 3 === 0;
        const pts = [sp.clone(), V(s * w * 0.8, y - 0.02, sp.z + 0.02), V(s * w, y - 0.07, sp.z + 0.12), V(s * w * 0.7, y - 0.11, sp.z + 0.22)];
        if (!broken) pts.push(V(s * 0.03, y - 0.13, sp.z + 0.26));
        tube(pts, 0.014, broken ? 0.007 : 0.009, ash);
      }
    }
    tube([V(0, 2.06, 0.2), V(0, 1.9, 0.22), V(0, 1.74, 0.17)], 0.016, 0.01, ash);                 // breastbone

    // --- pelvis ---
    const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.024, 14, 48, Math.PI * 1.3), ash);
    pelvis.position.set(0, 1.47, -0.03); pelvis.rotation.set(Math.PI / 2 - 0.3, 0, Math.PI * 1.35);
    inner.add(pelvis);

    // --- two withered human legs, dangling uselessly under it (they trail behind when it crawls) ---
    for (const [s, kz, swing] of [[-1, 0.12, 0.05], [1, 0.05, -0.04]]) {
      const hip = V(s * 0.08, 1.44, 0), knee = V(s * 0.1, 1.02, kz), ankle = V(s * 0.09 + swing, 0.64, kz - 0.12);
      const toe = ankle.clone().add(V(0, -0.1, 0.07));                                       // pointed foot
      boneMesh(inner, [hip, knee, ankle, toe], [0.03, 0.021, 0.014, 0.004], ash, { bulge: [0.15, 0.35, 0.3, 0] });
    }

    // --- shoulders + collarbones ---
    for (const sh of SH) {
      boneMesh(inner, [spine.getPoint(0.74), sh], [0.015, 0.022], ash, { radial: 10 });
      knob(sh, 0.042, bone);
    }

    // --- tattered cloak hanging off its back ---
    const CH = 1.25, CTOP = 2.32;
    const cloakGeo = new THREE.CylinderGeometry(0.16, 0.36, CH, 36, 18, true, Math.PI - 1.8, 3.6);
    const cp = cloakGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      let x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
      const a = Math.atan2(z, x), low = 0.5 - y / CH;
      const f = 1 + (0.05 + 0.14 * low) * Math.sin(a * 6 + y * 3) + 0.05 * low * Math.sin(a * 15);
      x *= f * 1.15; z = z * f - 0.04;
      cp.setXYZ(i, x, y, z);
    }
    cloakGeo.computeVertexNormals();
    const cloak = new THREE.Mesh(cloakGeo, cloth);
    cloak.position.set(0.01, CTOP - CH / 2, -0.06);
    inner.add(cloak);

    // --- the moving limbs: four spider legs and two long arms (reshaped every frame) ---
    const legs = LEG_REST.map(([hip, knee, ankle, tip]) => {
      const b = makeBone(bone, [hip, knee, ankle, tip], [0.04, 0.03, 0.017, 0.003], { bulge: [0.2, 0.45, 0.4, 0], dynamic: true, radial: 12 });
      root.add(b.mesh);
      return {
        bone: b, hip, l1: hip.distanceTo(knee), l2: knee.distanceTo(ankle), l3: ankle.distanceTo(tip),
        homeStand: tip.clone(), homeCrawl: null, pole: poleOf(hip, knee, ankle),
        foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, stepping: false, ready: false,
        jKnee: new THREE.Vector3(), jAnkle: new THREE.Vector3(), jTip: new THREE.Vector3(), jHip: new THREE.Vector3(),
      };
    });
    legs.forEach((L, i) => { L.homeCrawl = LEG_CRAWL_FOOT[i]; L.side = Math.sign(L.hip.x); });
    const arms = [0, 1].map(i => {
      const b = makeBone(bone, [SH[i], EL[i], WR[i]], [0.033, 0.024, 0.016], { bulge: [0.15, 0.4, 0.35], dynamic: true, radial: 12 });
      root.add(b.mesh);
      const h = hand(HAND_CURL[i], bone);
      root.add(h);
      return {
        bone: b, hand: h, side: i === 0 ? -1 : 1, l1: SH[i].distanceTo(EL[i]), l2: EL[i].distanceTo(WR[i]), pole: poleOf(SH[i], EL[i], WR[i]),
        jSh: new THREE.Vector3(), jEl: new THREE.Vector3(), jWr: new THREE.Vector3(),
      };
    });
    return { legs, arms };
  }

  // ---------- head ----------
  function buildHead() {
    const shroud = new THREE.MeshStandardMaterial({ color: lin(0x111111), map: shroudTexture(), roughness: 0.95, side: THREE.DoubleSide });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.85, alphaTest: 0.5 });
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.08, metalness: 0.4 });

    const head = new THREE.Group();

    // the face mask
    const faceGeo = new THREE.PlaneGeometry(1, 1, 40, 60);
    const fp = faceGeo.attributes.position, fuv = faceGeo.attributes.uv;
    for (let i = 0; i < fp.count; i++) { const p = maskPoint(fuv.getX(i), fuv.getY(i)); fp.setXYZ(i, p.x, p.y, p.z); }
    faceGeo.computeVertexNormals();
    head.add(new THREE.Mesh(faceGeo, faceMat));

    // black void behind the face — what you see down the throat
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), voidMat);
    skull.scale.set(0.18, 0.3, 0.1);
    skull.position.z = -0.02;
    head.add(skull);

    // ridges down the throat: pale curved lines at different depths behind the mouth hole
    const [mu, mt] = fromPx(MOUTH.x, MOUTH.y + 20);
    const mp = maskPoint(mu, mt), mn = maskNormal(mu, mt);
    const holeW = (MOUTH.irx * 2 / FW) * MASK.r * 2 * MASK.halfAngle, holeH = (MOUTH.iry * 2 / FH) * MASK.height;
    [[0.012, 0.32, 18], [0.026, 0.12, 14], [0.04, -0.1, 10], [0.052, -0.3, 8]].forEach(([depth, dy, bend], k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(holeW * (0.95 - k * 0.12), holeH * 0.28),
        new THREE.MeshStandardMaterial({ map: ridgeTexture(bend), transparent: true, alphaTest: 0.3, roughness: 0.9, side: THREE.DoubleSide }));
      m.position.copy(mp).addScaledVector(mn, -depth);
      m.position.y += dy * holeH * 0.5;
      m.lookAt(m.position.clone().add(mn));
      head.add(m);
    });

    // dark glossy eyes that catch the flashlight
    for (const e of [EYE_L, EYE_R]) {
      const [u, t] = fromPx(e[0], e[1] - 1);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), eyeMat);
      eye.position.copy(maskPoint(u, t, 0.03));
      head.add(eye);
    }

    // hood: a ragged black cowl framing the face, open at the front
    const open = 1.95;
    const hoodGeo = new THREE.SphereGeometry(1, 40, 28, Math.PI / 2 + open / 2, Math.PI * 2 - open, 0, Math.PI * 0.8);
    const hp = hoodGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      const a = Math.atan2(z, x);
      const fold = 1 + 0.07 * Math.sin(a * 5 + y * 4) + 0.04 * Math.sin(a * 11 - y * 9) + (y < -0.45 ? (Math.random() - 0.5) * 0.08 : 0);
      hp.setXYZ(i, x * fold, y, z * fold);
    }
    hoodGeo.computeVertexNormals();
    const hood = new THREE.Mesh(hoodGeo, shroud);
    hood.scale.set(0.31, 0.45, 0.3);
    hood.position.set(0, 0.06, -0.06);
    head.add(hood);
    return head;
  }

  // ---------- build + animate ----------
  // Rig: root (world position / yaw, scaled to metres)
  //        torso  (pivots at the pelvis: lowers and pitches forward to crawl)
  //          inner  (spine, ribs, pelvis, cloak, dangling legs, head — rest-pose model coordinates)
  //        spider legs, arms, hands (model coordinates, solved with IK every frame)
  function create() {
    const root = new THREE.Group();
    root.name = 'entity';
    root.scale.setScalar(SCALE);
    const torso = new THREE.Group(), inner = new THREE.Group();
    torso.position.copy(PELVIS);
    inner.position.copy(PELVIS).negate();
    torso.add(inner);
    root.add(torso);

    const head = buildHead();
    head.position.set(0.04, 2.68, 0.3);
    head.scale.setScalar(0.86);
    inner.add(head);
    const { legs, arms } = buildBody(root, inner);

    // ---- animation state ----
    let phase = 0, twitchT = 2, twitch = 0, twitchTarget = 0;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwdW = new THREE.Vector3(), M = new THREE.Matrix4(), rootInv = new THREE.Matrix4();
    const home = new THREE.Vector3(), pole = new THREE.Vector3(), footDir = new THREE.Vector3(), toHip = new THREE.Vector3();
    const outward = new THREE.Vector3(), wrTarget = new THREE.Vector3(), down = new THREE.Vector3(), lat = new THREE.Vector3();
    const smooth = t => t * t * (3 - 2 * t);
    const GROUPS = [[0, 3], [1, 2]];          // diagonal pairs step together

    // opts: { speed (m/s), crawl (0 stand .. 1 flat crawl), groundAt(x,z), fixFoot(vec3 world, bodyX, bodyZ) }
    function animate(dt, opts) {
      const c = opts.crawl || 0, speed = opts.speed || 0, lunge = opts.lunge || 0;   // lunge: rears up, arms raised (then slams down as it falls back to 0)
      phase += dt * (1.2 + speed * 1.1);

      // --- torso: lower the pelvis and tip the whole upper body forward to crawl ---
      const bob = Math.sin(phase * 2) * (0.03 + speed * 0.006) * (1 - c * 0.6);
      torso.position.set(0, PELVIS.y + (0.5 - PELVIS.y) * c + bob, PELVIS.z);
      torso.rotation.set(0.1 + 1.32 * c - 0.3 * lunge + Math.sin(phase) * 0.02, Math.sin(phase * 0.5) * 0.04, Math.sin(phase) * 0.03 * (1 - c));
      // head stays looking ahead while the body tips over; now and then it jerks to one side
      if ((twitchT -= dt) <= 0) { twitchTarget = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 0.9; twitchT = 0.4 + Math.random() * 2.5; }
      twitch += (twitchTarget - twitch) * Math.min(1, dt * 18);
      head.rotation.set(0.14 - torso.rotation.x * 0.85, 0.06 + twitch * 0.4, -0.21 + twitch);

      root.updateMatrixWorld(true);
      M.multiplyMatrices(torso.matrix, inner.matrix);       // inner -> model space
      rootInv.copy(root.matrixWorld).invert();
      fwdW.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));

      // --- spider legs: feet stay planted in the world, diagonal pairs step when they lag too far behind ---
      const thresh = (speed > 0.15 ? 0.85 : 0.25) * (1 - c * 0.35);
      const dur = Math.min(0.5, Math.max(0.11, 0.55 - speed * 0.048)) * (1 + c * 0.2);
      const lift = (0.45 - 0.3 * c) * SCALE;
      const desire = L => {
        home.copy(L.homeStand).lerp(L.homeCrawl, c);
        tmp.copy(home).applyMatrix4(root.matrixWorld).addScaledVector(fwdW, speed * dur * 0.9);
        if (opts.fixFoot) opts.fixFoot(tmp, root.position.x, root.position.z);
        tmp.y = opts.groundAt ? opts.groundAt(tmp.x, tmp.z) : 0;
        return tmp;
      };
      let err = [0, 0], landed = null;
      legs.forEach((L, i) => {
        const d = desire(L);
        if (!L.ready) { L.foot.copy(d); L.ready = true; }
        if (L.stepping) {
          L.t += dt / dur;
          if (L.t >= 1) { L.stepping = false; L.foot.copy(L.to); landed = L; }
          else { const e = smooth(L.t); L.foot.copy(L.from).lerp(L.to, e); L.foot.y += Math.sin(L.t * Math.PI) * lift; }
        } else {
          const g = GROUPS[0].includes(i) ? 0 : 1;
          err[g] = Math.max(err[g], Math.hypot(L.foot.x - d.x, L.foot.z - d.z) / SCALE);
        }
      });
      if (landed && opts.onStep) opts.onStep(landed.foot, c, speed);       // a pair of feet slammed down
      if (!legs.some(L => L.stepping)) {
        const g = err[0] >= err[1] ? 0 : 1;
        if (err[g] > thresh) for (const i of GROUPS[g]) { const L = legs[i]; L.from.copy(L.foot); L.to.copy(desire(L)); L.t = 0; L.stepping = true; }
      }

      // --- leg IK (model space) ---
      for (const L of legs) {
        L.jHip.copy(L.hip).applyMatrix4(M);
        L.jTip.copy(L.foot).applyMatrix4(rootInv);
        // the last segment stands almost upright, and leans in toward the body as it crawls
        toHip.copy(L.jHip).sub(L.jTip); toHip.y = 0; toHip.normalize();
        footDir.set(0, 0.985 - 0.33 * c, 0).addScaledVector(toHip, 0.17 + 0.6 * c).normalize();
        L.jAnkle.copy(L.jTip).addScaledVector(footDir, L.l3);
        // knees: up and outward when standing; straight up (inside the doorway) when crawling
        outward.set(L.jTip.x, 0, 0).normalize();
        pole.copy(L.pole).multiplyScalar(1 - c).addScaledVector(UP, c).addScaledVector(outward, 0.25 * c);
        ik(L.jHip, L.jAnkle, L.l1, L.l2, pole, L.jKnee, tmp2);
        L.jAnkle.copy(tmp2);
        L.jTip.copy(L.jAnkle).addScaledVector(footDir, -L.l3);
        L.bone.set([L.jHip, L.jKnee, L.jAnkle, L.jTip]);
      }

      // --- arms: spread wide and swaying when standing; reaching ahead and clawing along the floor when crawling ---
      arms.forEach((A, i) => {
        A.jSh.copy(SH[i]).applyMatrix4(M);
        const sw = Math.sin(phase + i * Math.PI);
        tmp.copy(WR[i]).add(tmp2.set(0, sw * 0.04, sw * 0.12 * Math.min(1, speed))).applyMatrix4(M);       // standing: follows the torso
        const reach = Math.sin(phase * 0.9 + i * Math.PI);
        wrTarget.set(A.side * 0.32, 0.1 + Math.max(0, reach) * 0.14, 1.75 + reach * 0.25);              // crawling: hands on the floor ahead
        wrTarget.lerpVectors(tmp, wrTarget, c);
        if (lunge > 0) wrTarget.lerp(tmp.set(A.side * 0.55, 3.15, 0.85 + i * 0.1), lunge);         // arms raised over the head
        pole.copy(A.pole).transformDirection(M).multiplyScalar(1 - c).add(tmp.set(A.side * 0.4, 1, -0.3).multiplyScalar(c));
        ik(A.jSh, wrTarget, A.l1, A.l2, pole, A.jEl, A.jWr);
        A.bone.set([A.jSh, A.jEl, A.jWr]);
        // hand: hangs off the wrist; flat on the floor, fingers forward, when crawling
        down.copy(HAND_DOWN[i]).lerp(tmp.copy(A.jWr).sub(A.jEl).normalize(), 0.4).lerp(tmp2.set(0, -0.22, 0.97), c);
        lat.set(0, 0, 1).lerp(tmp.set(-A.side, 0, 0), c);
        handBasis(A.hand, A.jWr, down, lat);
      });
    }

    // where its eyes are right now (world space): ~4.3 m up standing, close to the floor crawling
    const eye = (out = new THREE.Vector3()) => head.getWorldPosition(out);
    return { root, head, animate, eye, HEIGHT: 3.0 * SCALE, crawlHeight: 1.4 * SCALE };
  }

  // model only (old API): a standing entity
  function build() {
    const e = create();
    e.animate(0, { speed: 0, crawl: 0 });
    return e.root;
  }

  return { build, create, SCALE, HEIGHT: 3.0 * SCALE, RADIUS: 0.45 * SCALE, SPAN: 1.3 * SCALE };
})();
