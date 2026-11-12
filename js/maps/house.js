// The house: a dark old two-storey family house with a walled back garden, built from HouseLayout.
// Every room has its own wallpaper + floor so you can learn the layout.
//
// Coordinates: box() and add() below take heights relative to the floor being built (set with onFloor);
// everything else (lights, interactables, climbables, scene.add) is in absolute world space.
World.maps.house = function (api) {
  const L = HouseLayout;
  const { W, H, CELL, STOREY } = L;
  const scene = api.scene;
  const CE = 5.1;                                   // ceiling height above each floor (the slab above is 0.3 thick)
  const HALF = CELL / 2;
  const FL = L.floorY;                              // floor heights: ground, upstairs, basement
  const LEVELS = L.floors.map((_, i) => i);
  const BH = -0.5 - L.BASEMENT;                     // basement headroom (the ground floor slab is above it)

  const cx = c => (c + 0.5 - W / 2) * CELL;   // centre of column c (fractions allowed)
  const cz = r => (r + 0.5 - H / 2) * CELL;   // centre of row r
  const ex = c => (c - W / 2) * CELL;         // west edge of column c
  const ez = r => (r - H / 2) * CELL;         // north edge of row r

  let F = 0, Y0 = 0;                          // the floor being built
  const onFloor = f => { F = f; Y0 = FL[f]; };
  const get = (c, r, f = F) => (c < 0 || r < 0 || c >= W || r >= H) ? (f ? ' ' : '#') : L.floors[f][r][c];
  const isWallish = ch => '#VHWZQ'.includes(ch);
  const isOpen = ch => !isWallish(ch) && ch !== ' ';
  const OUTSIDE = { name: 'outside', wall: 'outside' };
  // how lit the house is (difficulty.js): 'full', 'dim' (rooms dark, halls dim) or 'dark' (every lamp dead)
  const LIT = typeof Difficulty !== 'undefined' && Difficulty.cur.lighting || 'full';
  const lit = (full, dim, dark) => (LIT === 'dark' ? dark : LIT === 'dim' ? dim : full);
  const zoneAt = (c, r, f = F) => {
    if (f === 1 && get(c, r, 1) === ' ') return OUTSIDE;
    return L.zones.find(z => z.f === f && c >= z.c0 && c <= z.c1 && r >= z.r0 && r <= z.r1) || L.hall;
  };
  const WH = () => [STOREY, CE, BH][F];       // wall height on this floor (relative)
  let seed = 1337;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const add = mesh => { mesh.position.y += Y0; return api.addStatic(mesh); };
  const box = (x, y, z, w, h, d, material, collide = true) => api.box(x, y + Y0, z, w, h, d, material, collide);

  // =====================================================================
  // textures (all drawn in code)
  // =====================================================================
  function brickTex() {
    return api.canvasTex((g, w, h) => {
      g.fillStyle = '#1c1612'; g.fillRect(0, 0, w, h);
      const bw = 64, bh = 22;
      for (let y = 0, row = 0; y < h; y += bh, row++) {
        for (let x = (row % 2) * -bw / 2; x < w; x += bw) {
          const v = Math.random() * 18;
          g.fillStyle = `rgb(${58 + v},${34 + v / 2},${26 + v / 3})`;
          g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        }
      }
      for (let i = 0; i < 40; i++) {                        // damp + moss
        const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 80;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(20,30,14,${0.3 * Math.random()})`); grd.addColorStop(1, 'rgba(20,30,14,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, 512, 1024);
  }
  function concreteTex(wall) {
    return api.canvasTex((g, w, h) => {
      g.fillStyle = wall ? '#3a3834' : '#2e2c29'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v < 0.5 ? '0,0,0' : '200,195,180'},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      for (let i = 0; i < 30; i++) {                           // damp patches + oil stains
        const x = Math.random() * w, y = wall ? h * (0.6 + Math.random() * 0.4) : Math.random() * h, r = 20 + Math.random() * 90;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(12,10,8,${0.25 + Math.random() * 0.3})`); grd.addColorStop(1, 'rgba(12,10,8,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      if (wall) for (let y = 0; y < h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }     // block courses
      else for (let k = 0; k < 4; k++) { g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (Math.random() - 0.5) * 30; y += 20; g.lineTo(x, y); } g.stroke(); }   // cracks
    }, 512, 512);
  }
  function tileTex() {
    return api.canvasTex((g, w, h) => {
      const s = 32;
      g.fillStyle = '#3a3832'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) {
        const dark = (x * 7 + y * 3) % 11 === 0;
        const v = dark ? 40 : 150 + Math.random() * 20;
        g.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
        g.fillRect(x * s + 2, y * s + 2, s - 3, s - 3);
      }
      for (let i = 0; i < 25; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 50;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(50,35,10,${0.3 * Math.random()})`); grd.addColorStop(1, 'rgba(50,35,10,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, 512, 512);
  }
  function grassTex() {
    return api.canvasTex((g, w, h) => {
      g.fillStyle = '#121a0d'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const v = Math.random();
        g.strokeStyle = v < 0.5 ? 'rgba(34,48,20,0.8)' : v < 0.8 ? 'rgba(48,58,26,0.7)' : 'rgba(70,64,36,0.6)';
        g.lineWidth = 1 + Math.random();
        const x = Math.random() * w, y = Math.random() * h;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y - 4 - Math.random() * 8); g.stroke();
      }
      for (let i = 0; i < 30; i++) {                         // bare mud patches
        const x = Math.random() * w, y = Math.random() * h, r = 15 + Math.random() * 50;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(28,20,12,0.6)'); grd.addColorStop(1, 'rgba(28,20,12,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }, 512, 512);
  }
  function hedgeTex() {
    return api.canvasTex((g, w, h) => {
      g.fillStyle = '#0c140a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = ['#16240f', '#1d2e13', '#0f1a0b', '#24331a'][Math.floor(Math.random() * 4)];
        g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill();
      }
      for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(40,30,18,0.6)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 6); }   // dead twigs
    }, 256, 256);
  }
  function stoneTex() {
    return api.canvasTex((g, w, h) => {
      g.fillStyle = '#1a1a18'; g.fillRect(0, 0, w, h);
      let y = 0;
      while (y < h) {
        const rh = 24 + Math.random() * 30; let x = -Math.random() * 40;
        while (x < w) {
          const bw = 40 + Math.random() * 60, v = 40 + Math.random() * 25;
          g.fillStyle = `rgb(${v},${v},${v - 4})`;
          g.fillRect(x + 2, y + 2, bw - 4, rh - 4);
          x += bw;
        }
        y += rh;
      }
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * w, yy = Math.random() * h, r = 10 + Math.random() * 50;
        const grd = g.createRadialGradient(x, yy, 0, x, yy, r);
        grd.addColorStop(0, `rgba(22,34,16,${0.4 * Math.random()})`); grd.addColorStop(1, 'rgba(22,34,16,0)');
        g.fillStyle = grd; g.fillRect(x - r, yy - r, r * 2, r * 2);
      }
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, 256, 256);
  }
  function barkTex() {
    return api.canvasTex((g, w, h) => {
      g.fillStyle = '#1a1410'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) {
        g.strokeStyle = `rgba(${Math.random() < 0.5 ? '8,6,4' : '44,36,28'},0.7)`; g.lineWidth = 1 + Math.random() * 3;
        const x = Math.random() * w; g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y < h; y += 16) g.lineTo(x + (Math.random() - 0.5) * 6, y);
        g.stroke();
      }
    }, 128, 256);
  }
  function sheetTex(base) {
    return api.canvasTex((g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {                         // folds + stains
        g.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`; g.lineWidth = 2 + Math.random() * 4;
        g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
        g.quadraticCurveTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 60, x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 80); g.stroke();
      }
      for (let i = 0; i < 10; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(60,40,15,${0.35 * Math.random()})`); grd.addColorStop(1, 'rgba(60,40,15,0)');
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, 256, 256);
  }
  // =====================================================================
  // textures (all drawn in code)
  // =====================================================================
  const T = (draw, w, h) => api.canvasTex(draw, w, h);
  const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
  function grime(g, w, h, n = 400, a = 0.08) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.75 ? rgba(0, 0, 0, Math.random() * a) : rgba(255, 240, 220, Math.random() * a * 0.4);
      const s = 1 + Math.random() * 3;
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
  }
  function stains(g, w, h, n, color = [20, 14, 8]) {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba(...color, 0.18 * Math.random()));
      grd.addColorStop(1, rgba(...color, 0));
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // ornamental damask flourish
  function motif(g, x, y, s, color) {
    g.fillStyle = color;
    g.save(); g.translate(x, y);
    g.beginPath();
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 0.6, -s * 0.5, s * 0.6, s * 0.3, 0, s);
    g.bezierCurveTo(-s * 0.6, s * 0.3, -s * 0.6, -s * 0.5, 0, -s);
    g.fill();
    for (const side of [-1, 1]) {
      g.beginPath(); g.ellipse(side * s * 0.75, s * 0.15, s * 0.2, s * 0.45, side * 0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(side * s * 0.45, -s * 0.85, s * 0.12, s * 0.28, -side * 0.7, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.arc(0, -s * 1.25, s * 0.14, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, s * 1.25, s * 0.1, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // a full wall from floor to ceiling: baseboard, wainscoting, chair rail, wallpaper, crown moulding.
  // 512 x 1024 px = 2 m wide x 6 m tall (texture is locked to world height so it lines up everywhere)
  function wallpaperTex(st) {
    if (st.kind === 'brick') return brickTex();
    if (st.kind === 'concrete') return concreteTex(true);
    return T((g, w, h) => {
      const PX = h / STOREY, PXU = w / 2;
      const Y = m => h - m * PX;
      g.fillStyle = st.base; g.fillRect(0, 0, w, h);
      if (st.kind === 'damask') {
        let row = 0;
        for (let m = 1.55; m < 4.7; m += 0.62, row++) {
          for (let x = (row % 2) * 64; x < w + 64; x += 128) motif(g, x, Y(m), 34, st.motif);
        }
      } else if (st.kind === 'stripe') {
        for (let x = 0; x < w; x += 64) {
          g.fillStyle = st.motif; g.fillRect(x, 0, 30, h);
          g.fillStyle = st.accent; g.fillRect(x + 42, 0, 3, h);
        }
      } else if (st.kind === 'lattice') {
        g.strokeStyle = st.motif; g.lineWidth = 7;
        for (let i = -h; i < w + h; i += 96) {
          g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h * 0.5, h); g.stroke();
          g.beginPath(); g.moveTo(i, h); g.lineTo(i + h * 0.5, 0); g.stroke();
        }
      }
      // age: water stains running down from the ceiling, blotches, peeling
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * w, len = 60 + Math.random() * 500;
        const grd = g.createLinearGradient(0, Y(4.8), 0, Y(4.8) + len);
        grd.addColorStop(0, rgba(18, 12, 6, 0.4)); grd.addColorStop(1, rgba(18, 12, 6, 0));
        g.fillStyle = grd; g.fillRect(x, Y(4.8), 4 + Math.random() * 16, len);
      }
      stains(g, w, h, 40);
      const top = g.createLinearGradient(0, Y(4.8), 0, Y(3.8));
      top.addColorStop(0, rgba(0, 0, 0, 0.45)); top.addColorStop(1, rgba(0, 0, 0, 0));
      g.fillStyle = top; g.fillRect(0, Y(4.8), w, Y(3.8) - Y(4.8));
      grime(g, w, h, 2500, 0.08);
      // crown moulding
      g.fillStyle = st.wood; g.fillRect(0, 0, w, Y(4.8));
      g.fillStyle = rgba(255, 230, 190, 0.08); g.fillRect(0, Y(4.9), w, 4); g.fillRect(0, Y(5.02), w, 3);
      g.fillStyle = rgba(0, 0, 0, 0.4); g.fillRect(0, Y(4.8), w, 5);

      if (st.tiles) {
        // kitchen: grimy ceramic tiles up to 1.6 m
        const tw = 0.15 * PXU, th = 0.15 * PX;
        const TH = st.tileH || 1.6;
        g.fillStyle = '#4a463c'; g.fillRect(0, Y(TH), w, Y(0) - Y(TH));
        for (let y = Y(0.15); y > Y(TH) + 1; y -= th) {
          for (let x = 0; x < w; x += tw) {
            const v = (st.tileV || 140) + Math.floor(Math.random() * 20);
            g.fillStyle = `rgb(${v},${v - 4},${v - 18})`;
            g.fillRect(x + 2, y - th + 2, tw - 3, th - 3);
          }
        }
        g.fillStyle = '#2c3a38'; g.fillRect(0, Y(TH + 0.1), w, Y(TH) - Y(TH + 0.1));   // dark tile border
        stains(g, w, h, 30, [40, 30, 10]);
      } else {
        // wainscoting
        g.fillStyle = st.wood; g.fillRect(0, Y(1.15), w, Y(0) - Y(1.15));
        for (const x0 of [14, w / 2 + 14]) {
          const pw = w / 2 - 28, y0 = Y(1.0), ph = Y(0.28) - Y(1.0);
          g.fillStyle = rgba(0, 0, 0, 0.35); g.fillRect(x0, y0, pw, ph);
          g.fillStyle = st.wood; g.fillRect(x0 + 6, y0 + 6, pw - 12, ph - 12);
          g.fillStyle = rgba(255, 220, 170, 0.06); g.fillRect(x0, y0 + ph - 3, pw, 3);
        }
        for (let i = 0; i < 160; i++) {
          g.fillStyle = rgba(0, 0, 0, 0.12);
          g.fillRect(Math.random() * w, Y(1.15) + Math.random() * (Y(0) - Y(1.15)), 20 + Math.random() * 80, 1);
        }
        g.fillStyle = st.rail; g.fillRect(0, Y(1.22), w, Y(1.12) - Y(1.22));        // chair rail
        g.fillStyle = rgba(0, 0, 0, 0.45); g.fillRect(0, Y(1.12), w, 3);
      }
      g.fillStyle = '#120a05'; g.fillRect(0, Y(0.15), w, h - Y(0.15));               // baseboard
      g.fillStyle = rgba(255, 220, 170, 0.06); g.fillRect(0, Y(0.15), w, 2);
    }, 512, 1024);
  }

  function planksTex(colors, rows, gap = '#120a05') {
    return T((g, w, h) => {
      const rh = h / rows;
      g.fillStyle = gap; g.fillRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) {
        let x = -Math.random() * 200;
        while (x < w) {
          const len = 140 + Math.random() * 220;
          g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
          g.fillRect(x + 1, r * rh + 1, len - 2, rh - 2);
          for (let k = 0; k < 7; k++) {
            g.fillStyle = rgba(0, 0, 0, 0.05 + Math.random() * 0.1);
            g.fillRect(x + 1, r * rh + 2 + Math.random() * (rh - 4), len - 2, 1);
          }
          x += len;
        }
      }
      stains(g, w, h, 12);
      grime(g, w, h, 1500, 0.12);
    }, 512, 512);
  }

  function parquetTex() {
    return T((g, w, h) => {
      const b = 64;
      g.fillStyle = '#140b06'; g.fillRect(0, 0, w, h);
      for (let by = 0; by < h / b; by++) for (let bx = 0; bx < w / b; bx++) {
        const vert = (bx + by) % 2 === 0;
        for (let k = 0; k < 4; k++) {
          g.fillStyle = pick(['#4a2e18', '#553520', '#3f2614', '#5c3b22']);
          if (vert) g.fillRect(bx * b + k * 16 + 1, by * b + 1, 14, b - 2);
          else g.fillRect(bx * b + 1, by * b + k * 16 + 1, b - 2, 14);
        }
      }
      stains(g, w, h, 10);
      grime(g, w, h, 1500, 0.12);
    }, 512, 512);
  }

  function checkerTex() {
    return T((g, w, h) => {
      const s = 64;
      for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) {
        g.fillStyle = (x + y) % 2 ? '#1c1b19' : '#aaa391';
        g.fillRect(x * s, y * s, s, s);
      }
      g.strokeStyle = '#3a372f'; g.lineWidth = 2;
      for (let i = 0; i <= w; i += s) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      stains(g, w, h, 25, [40, 30, 15]);
      grime(g, w, h, 2500, 0.15);
    }, 512, 512);
  }

  function marbleTex(light, dark) {
    return T((g, w, h) => {
      const s = w / 2;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const isLight = (x + y) % 2 === 0;
        g.fillStyle = isLight ? light : dark;
        g.fillRect(x * s, y * s, s, s);
        g.strokeStyle = isLight ? rgba(80, 70, 60, 0.25) : rgba(200, 190, 170, 0.12);
        for (let v = 0; v < 6; v++) {
          g.lineWidth = 1 + Math.random() * 2;
          g.beginPath();
          g.moveTo(x * s + Math.random() * s, y * s);
          g.bezierCurveTo(x * s + Math.random() * s, y * s + s * 0.3, x * s + Math.random() * s, y * s + s * 0.7, x * s + Math.random() * s, y * s + s);
          g.stroke();
        }
      }
      g.strokeStyle = '#151210'; g.lineWidth = 3;
      g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(s, 0); g.lineTo(s, h); g.moveTo(0, s); g.lineTo(w, s); g.stroke();
      stains(g, w, h, 12);
      grime(g, w, h, 1500, 0.1);
    }, 512, 512);
  }

  function terracottaTex() {
    return T((g, w, h) => {
      const s = 128;
      g.fillStyle = '#24170e'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = Math.floor(Math.random() * 25);
        g.fillStyle = `rgb(${92 + v},${52 + v / 2},${34})`;
        g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
      }
      for (let i = 0; i < 50; i++) {   // moss in the grout
        g.fillStyle = rgba(40, 70, 30, 0.25 + Math.random() * 0.3);
        const gx = Math.floor(Math.random() * 5) * s, gy = Math.random() * h;
        g.fillRect(gx - 3, gy, 6, 6 + Math.random() * 30);
      }
      stains(g, w, h, 20);
      grime(g, w, h, 2000, 0.12);
    }, 512, 512);
  }

  function ceilingTex() {
    return T((g, w, h) => {
      g.fillStyle = '#25211c'; g.fillRect(0, 0, w, h);
      const n = 2, s = w / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        g.fillStyle = '#1b1814'; g.fillRect(x * s + 30, y * s + 30, s - 60, s - 60);
        g.strokeStyle = '#2f2a23'; g.lineWidth = 6; g.strokeRect(x * s + 22, y * s + 22, s - 44, s - 44);
      }
      stains(g, w, h, 30, [30, 20, 8]);
      grime(g, w, h, 1500, 0.1);
    }, 512, 512);
  }

  function carpetTex(base, border, gold) {
    return T((g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = border; g.fillRect(0, 0, 26, h); g.fillRect(w - 26, 0, 26, h);
      g.fillStyle = gold; g.fillRect(30, 0, 3, h); g.fillRect(w - 33, 0, 3, h);
      g.strokeStyle = gold; g.lineWidth = 3;
      for (let y = 0; y < h; y += 128) {
        g.beginPath(); g.moveTo(w / 2, y + 14); g.lineTo(w - 56, y + 64); g.lineTo(w / 2, y + 114); g.lineTo(56, y + 64); g.closePath(); g.stroke();
        g.beginPath(); g.arc(w / 2, y + 64, 16, 0, Math.PI * 2); g.stroke();
      }
      for (let i = 0; i < 30; i++) {     // worn patches down the middle
        g.fillStyle = rgba(150, 120, 100, 0.06);
        g.beginPath(); g.ellipse(w / 2 + (Math.random() - 0.5) * 80, Math.random() * h, 20 + Math.random() * 40, 30 + Math.random() * 60, 0, 0, Math.PI * 2); g.fill();
      }
      stains(g, w, h, 10);
      grime(g, w, h, 1500, 0.15);
    }, 256, 512);
  }

  function woodTex(base) {
    return T((g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        g.fillStyle = rgba(0, 0, 0, 0.06 + Math.random() * 0.1);
        g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2);
      }
      grime(g, w, h, 600, 0.1);
    }, 256, 256);
  }

  function shelfTex(gapChance = 0.06) {
    return T((g, w, h) => {
      g.fillStyle = '#1c1109'; g.fillRect(0, 0, w, h);
      const rows = 5, rh = (h - 20) / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = 10 + r * rh;
        g.fillStyle = '#0a0604'; g.fillRect(10, y0, w - 20, rh - 10);
        let x = 14;
        while (x < w - 20) {
          const bw = 8 + Math.random() * 16, bh = (rh - 14) * (0.62 + Math.random() * 0.36);
          if (Math.random() < gapChance) { x += 20 + Math.random() * 60; continue; }   // gap
          g.fillStyle = pick(['#4a1e1e', '#1e2e4a', '#3a3a1e', '#2a1e10', '#5a4a30', '#2c1c2c', '#1f3324', '#5b2c1a']);
          g.fillRect(x, y0 + rh - 10 - bh, bw - 1, bh);
          g.fillStyle = rgba(220, 190, 120, 0.25); g.fillRect(x + 1, y0 + rh - 10 - bh + 6, bw - 3, 2);
          x += bw;
        }
        g.fillStyle = '#2e1d10'; g.fillRect(6, y0 + rh - 10, w - 12, 10);    // shelf board
      }
      g.fillStyle = '#2e1d10'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); g.fillRect(0, 0, w, 10);
      grime(g, w, h, 1200, 0.15);
    }, 512, 512);
  }

  function drawerTex() {
    return T((g, w, h) => {
      g.fillStyle = '#2a190d'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        const y = 18 + i * 78;
        g.fillStyle = '#1a0f07'; g.fillRect(14, y, w - 28, 66);
        g.fillStyle = '#331f10'; g.fillRect(18, y + 4, w - 36, 58);
        for (const kx of [w * 0.3, w * 0.7]) { g.fillStyle = '#8a6a30'; g.beginPath(); g.arc(kx, y + 33, 6, 0, Math.PI * 2); g.fill(); }
      }
      grime(g, w, h, 600, 0.12);
    }, 256, 256);
  }

  function doorsTex(knobs = true) {
    return T((g, w, h) => {
      g.fillStyle = '#24150b'; g.fillRect(0, 0, w, h);
      for (const x0 of [10, w / 2 + 4]) {
        const pw = w / 2 - 14;
        for (const [y0, ph] of [[20, h * 0.45], [h * 0.52, h * 0.42]]) {
          g.fillStyle = '#160c05'; g.fillRect(x0 + 8, y0, pw - 16, ph);
          g.fillStyle = '#2d1a0c'; g.fillRect(x0 + 13, y0 + 5, pw - 26, ph - 10);
        }
      }
      if (knobs) { g.fillStyle = '#8a6a30'; g.beginPath(); g.arc(w / 2 - 12, h * 0.5, 6, 0, 7); g.arc(w / 2 + 12, h * 0.5, 6, 0, 7); g.fill(); }
      grime(g, w, h, 900, 0.12);
    }, 256, 512);
  }

  function balusterTex() {
    return T((g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#2a190e';
      g.fillRect(0, 0, w, 26); g.fillRect(0, h - 22, w, 22);
      for (let x = 32; x < w; x += 64) {
        g.fillRect(x - 6, 26, 12, h - 48);
        g.beginPath(); g.ellipse(x, h * 0.42, 15, 34, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x, h * 0.75, 11, 14, 0, 0, Math.PI * 2); g.fill();
      }
    }, 512, 256);
  }

  function clockTex() {
    return T((g, w, h) => {
      g.fillStyle = '#16100a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9bc9a'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.45, 0, 7); g.fill();
      g.strokeStyle = '#2a2016'; g.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.36, h / 2 + Math.sin(a) * w * 0.36);
        g.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * w * 0.42); g.stroke();
      }
      g.lineWidth = 4;   // stopped at 3:07
      g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + w * 0.25, h / 2 + 2); g.stroke();
      g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + 8, h / 2 - w * 0.36); g.stroke();
      grime(g, w, h, 400, 0.2);
    }, 128, 128);
  }

  // eerie oil portraits and landscapes
  function portraitTex(variant) {
    return T((g, w, h) => {
      const bg = g.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.5, h * 0.7);
      bg.addColorStop(0, pick(['#3a2a1a', '#2a2a22', '#322018', '#1e2622']));
      bg.addColorStop(1, '#0a0705');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = pick(['#120c08', '#1a1210', '#0e0e10']);
      g.beginPath(); g.ellipse(w / 2, h * 0.98, w * 0.42, h * 0.32, 0, 0, Math.PI * 2); g.fill();  // shoulders
      g.fillStyle = pick(['#5a4636', '#4e3e30', '#605040']);
      g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.17, h * 0.17, 0, 0, Math.PI * 2); g.fill();  // face
      g.fillStyle = '#1a120c';
      g.beginPath(); g.ellipse(w / 2, h * 0.3, w * 0.2, h * 0.09, 0, Math.PI, 0); g.fill();          // hair
      if (variant === 'scratched') {
        g.strokeStyle = '#050302'; g.lineWidth = 3;
        for (let i = 0; i < 40; i++) {
          g.beginPath();
          g.moveTo(w / 2 + (Math.random() - 0.5) * w * 0.35, h * 0.42 + (Math.random() - 0.5) * h * 0.3);
          g.lineTo(w / 2 + (Math.random() - 0.5) * w * 0.35, h * 0.42 + (Math.random() - 0.5) * h * 0.3);
          g.stroke();
        }
      } else {
        g.fillStyle = variant === 'eyes' ? '#d8d2b8' : '#140c08';
        g.beginPath(); g.ellipse(w / 2 - 14, h * 0.41, 5, 3, 0, 0, 7); g.ellipse(w / 2 + 14, h * 0.41, 5, 3, 0, 0, 7); g.fill();
        if (variant === 'eyes') { g.fillStyle = '#000'; g.beginPath(); g.arc(w / 2 - 14, h * 0.41, 2, 0, 7); g.arc(w / 2 + 14, h * 0.41, 2, 0, 7); g.fill(); }
      }
      // craquelure + varnish darkening
      g.strokeStyle = rgba(0, 0, 0, 0.25); g.lineWidth = 1;
      for (let i = 0; i < 70; i++) {
        let x = Math.random() * w, y = Math.random() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); }
        g.stroke();
      }
      grime(g, w, h, 800, 0.2);
    }, 256, 320);
  }

  function landscapeTex() {
    return T((g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#12161c'); sky.addColorStop(1, '#3a3226');
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b8b090'; g.beginPath(); g.arc(w * 0.72, h * 0.25, 16, 0, 7); g.fill();
      g.fillStyle = '#0c0a08';
      g.beginPath(); g.moveTo(0, h * 0.7);
      for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.62 + Math.sin(x * 0.03) * 14 + Math.random() * 6);
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
      // a lone house on the hill
      g.fillRect(w * 0.3, h * 0.48, 40, 30); g.beginPath(); g.moveTo(w * 0.3 - 4, h * 0.48); g.lineTo(w * 0.3 + 20, h * 0.4); g.lineTo(w * 0.3 + 44, h * 0.48); g.fill();
      g.fillStyle = '#a08840'; g.fillRect(w * 0.3 + 8, h * 0.52, 5, 6);
      grime(g, w, h, 800, 0.2);
    }, 320, 240);
  }

  // =====================================================================
  // materials
  // =====================================================================
  const WALLS = {
    hall:         { kind: 'damask',  base: '#1f2b25', motif: '#2a3a31', wood: '#24160c', rail: '#3a2616' },
    foyer:        { kind: 'damask',  base: '#3b2e1b', motif: '#504025', wood: '#22150b', rail: '#3a2414' },
    library:      { kind: 'damask',  base: '#33171a', motif: '#432124', wood: '#1e120a', rail: '#33200f' },
    dining:       { kind: 'stripe',  base: '#33121b', motif: '#3e1722', accent: '#5a4026', wood: '#22140b', rail: '#3a2414' },
    ballroom:     { kind: 'damask',  base: '#202938', motif: '#2e394b', wood: '#1f1a16', rail: '#4a3c22' },
    kitchen:      { kind: 'plain',   base: '#6a6452', tiles: true, wood: '#3a352c' },
    servant:      { kind: 'plain',   base: '#4a4232', wood: '#2a2016', rail: '#33281b' },
    living:       { kind: 'damask',  base: '#2c2a18', motif: '#3c3a22', wood: '#22150b', rail: '#3a2a14' },
    bedroom:      { kind: 'damask',  base: '#3a2228', motif: '#4a2c33', wood: '#24160c', rail: '#3d2618' },
    guest:        { kind: 'stripe',  base: '#2a2e22', motif: '#33382a', accent: '#4a4430', wood: '#22160c', rail: '#3a2a16' },
    kids:         { kind: 'stripe',  base: '#2c3440', motif: '#36404e', accent: '#5a4a36', wood: '#2a2016', rail: '#3d3020' },
    lounge:       { kind: 'lattice', base: '#2e2618', motif: '#3d3322', wood: '#22160c', rail: '#3a2c18' },
    bath:         { kind: 'plain',   base: '#5c5a52', tiles: true, tileH: 2.2, tileV: 175, wood: '#3a352c' },
    outside:      { kind: 'brick' },
    concrete:     { kind: 'concrete' },
    conservatory: { kind: 'lattice', base: '#252e1d', motif: '#36432e', wood: '#2a2418', rail: '#3c3322' },
  };
  const wallMats = {};
  const wallMat = name => wallMats[name] || (wallMats[name] = api.mat(wallpaperTex(WALLS[name]), 2, { uv: 'world', tileV: STOREY, roughness: 0.95 }));

  const FLOORS = {
    wood:       () => planksTex(['#3b2516', '#432a19', '#35210f', '#4a2f1c'], 10),
    darkwood:   () => planksTex(['#2a170c', '#301b0e', '#24130a'], 10),
    boards:     () => planksTex(['#3e352a', '#463c30', '#352d24'], 7),
    parquet:    parquetTex,
    checker:    checkerTex,
    marble:     () => marbleTex('#bdb6a6', '#221e1a'),
    terracotta: terracottaTex,
    tile:       tileTex,
    concrete:   () => concreteTex(false),
    grass:      grassTex,
  };
  const floorMats = {};
  const floorMat = name => floorMats[name] || (floorMats[name] = api.mat(FLOORS[name](), 2, { uv: 'world', roughness: name === 'marble' ? 0.5 : 0.85 }));

  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();   // r128 treats hex colours as linear; convert so they match textures
  const coreMat = api.mat(T((g, w, h) => {      // raw broken plaster / brick inside the walls
    g.fillStyle = '#2e2720'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 * 32; x < w; x += 64) {
      g.fillStyle = rgba(60 + Math.random() * 30, 34, 24, 0.35); g.fillRect(x + 2, y + 2, 60, 28);
    }
    stains(g, w, h, 20); grime(g, w, h, 2000, 0.2);
  }, 256, 256), 1, { uv: 'world' });
  const ceilMat = api.mat(ceilingTex(), 3, { uv: 'world' });
  const woodMat = api.mat(woodTex('#2a190d'), 1.5, { uv: 'world' });
  const darkWoodMat = api.mat(woodTex('#1a0f07'), 1.5, { uv: 'world' });
  const stairMat = api.mat(marbleTex('#a8a090', '#8e8678'), 2, { uv: 'world', roughness: 0.55 });
  const jambMat = wallMat('hall');
  const plasterMat = new THREE.MeshStandardMaterial({ color: lin(0x4a4236), roughness: 1 });
  const ductMat = new THREE.MeshStandardMaterial({ color: lin(0x1e1f20), roughness: 0.75, metalness: 0.35 });
  const brassMat = new THREE.MeshStandardMaterial({ color: lin(0x6b5328), roughness: 0.45, metalness: 0.8 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffc98e });
  const deadBulbMat = new THREE.MeshBasicMaterial({ color: lin(0x3a3026) });
  const frameMat = api.mat(woodTex('#4a3618'), 1, { uv: 'unit', metalness: 0.4, roughness: 0.5 });
  const carpetMat = new THREE.MeshStandardMaterial({ map: carpetTex('#4a1010', '#1e0808', '#6e5328'), roughness: 1 });
  const rugMat = new THREE.MeshStandardMaterial({ map: carpetTex('#1c2a3a', '#0c121a', '#6e5a38'), roughness: 1 });
  const balMat = api.mat(balusterTex(), 1.5, { tileV: 0.95, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const books = api.mat(shelfTex(), 1.5, { tileV: 2.1 });
  const shelfTop = api.mat(woodTex('#24150b'), 1.5);
  // kitchen cabinets: hinged doors (nothing that looks like a searchable drawer)
  const cabinets = api.mat(T((g, w, h) => {
    g.fillStyle = '#2a190d'; g.fillRect(0, 0, w, h);
    for (const x0 of [10, w / 2 + 5]) {
      g.fillStyle = '#170d06'; g.fillRect(x0, 16, w / 2 - 15, h - 30);
      g.fillStyle = '#32200f'; g.fillRect(x0 + 8, 24, w / 2 - 31, h - 46);
    }
    g.fillStyle = '#6a5228'; g.fillRect(w / 2 - 14, h * 0.3, 5, 26); g.fillRect(w / 2 + 9, h * 0.3, 5, 26);
    grime(g, w, h, 700, 0.14);
  }, 256, 256), 1.0, { tileV: 1.0 });
  const counterTop = api.mat(marbleTex('#b0a898', '#9a9284'), 1.0, { roughness: 0.4 });
  const wardrobe = api.mat(doorsTex(), 1.3, { tileV: 2.7 });
  const pianoMat = new THREE.MeshStandardMaterial({ color: lin(0x0a0909), roughness: 0.25, metalness: 0.2 });
  const potMat = api.mat(terracottaTex(), 1.0);
  const soilMat = new THREE.MeshStandardMaterial({ color: lin(0x1a120a), roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: lin(0x111c0d), roughness: 0.95 });
  const clockMat = new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.6 });
  const pillarMat = api.mat(marbleTex('#8a8478', '#6e695f'), 2, { roughness: 0.5 });
  const paintings = [
    portraitTex('plain'), portraitTex('eyes'), portraitTex('scratched'), portraitTex('plain'), landscapeTex(), landscapeTex(),
  ].map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));

  // ---------- textures + materials for the abandoned look ----------
  function dirtTex() {
    return T((g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const x = w * (0.25 + Math.random() * 0.5), y = h * (0.25 + Math.random() * 0.5), r = w * (0.12 + Math.random() * 0.25);
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, rgba(8, 5, 2, 0.3)); grd.addColorStop(1, rgba(8, 5, 2, 0));
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      }
    }, 128, 128);
  }
  function webTex() {
    return T((g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = rgba(225, 222, 210, 0.55); g.lineWidth = 1;
      const spokes = 9;
      for (let k = 0; k < spokes; k++) {
        const a = (k / (spokes - 1)) * Math.PI / 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * w * 1.3, Math.sin(a) * h * 1.3); g.stroke();
      }
      for (let rr = 12; rr < w * 1.3; rr += 10 + Math.random() * 6) {
        g.beginPath();
        for (let k = 0; k < spokes; k++) {
          const a = (k / (spokes - 1)) * Math.PI / 2, sag = 1 - 0.06 * Math.sin(k * 1.7);
          const px = Math.cos(a) * rr * sag, py = Math.sin(a) * rr * sag;
          k ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.stroke();
      }
    }, 128, 128);
  }
  function glowTex(r, gr, b) {
    return T((g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, rgba(r, gr, b, 0.9)); grd.addColorStop(0.25, rgba(r, gr, b, 0.35)); grd.addColorStop(1, rgba(r, gr, b, 0));
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }, 64, 64);
  }
  // cream-painted chest of drawers: deliberately lighter than everything else so it stands out
  function searchFrontTex(n = 3) {
    return T((g, w, h) => {
      g.fillStyle = '#b9a984'; g.fillRect(0, 0, w, h);
      const dh = (h - 14) / n;
      for (let i = 0; i < n; i++) {
        const y = 10 + i * dh;
        g.fillStyle = '#7d6e52'; g.fillRect(12, y, w - 24, dh - 10);
        g.fillStyle = '#c8b893'; g.fillRect(16, y + 4, w - 32, dh - 18);
        g.fillStyle = '#9a7a38'; g.fillRect(w / 2 - 28, y + dh / 2 - 9, 56, 9);  // brass pull
        g.fillStyle = '#d8b860'; g.fillRect(w / 2 - 26, y + dh / 2 - 8, 52, 3);
      }
      for (let i = 0; i < 40; i++) {                                              // chipped paint
        g.fillStyle = rgba(60, 40, 22, 0.35 + Math.random() * 0.4);
        g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 2 + Math.random() * 9, 1 + Math.random() * 4, Math.random() * 3, 0, 7); g.fill();
      }
      grime(g, w, h, 1200, 0.18);
    }, 256, 256);
  }
  function lockerTex(door) {
    return T((g, w, h) => {
      g.fillStyle = '#3d4a40'; g.fillRect(0, 0, w, h);
      if (door) {
        // slots you can see out of (transparent), near eye height and at the bottom
        for (const [y0, n] of [[h * 0.1, 5], [h * 0.82, 4]]) {
          for (let k = 0; k < n; k++) g.clearRect(w * 0.2, y0 + k * 12, w * 0.6, 6);
        }
        g.fillStyle = '#20261f'; g.fillRect(w * 0.82, h * 0.48, 10, 40);               // handle
        g.fillStyle = '#6a6a5a'; g.fillRect(w * 0.42, h * 0.32, w * 0.16, 14);         // name plate
      }
      for (let i = 0; i < 25; i++) {                                                   // rust + dents
        const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 22;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, rgba(110, 55, 20, 0.5)); grd.addColorStop(1, rgba(110, 55, 20, 0));
        g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      grime(g, w, h, 900, 0.18);
    }, 128, 256);
  }

  const books2 = api.mat(shelfTex(0.45), 1.2, { tileV: 2.0 });            // half-empty hall shelves
  const bookMats = ['#4a1e1e', '#1e2e4a', '#3a3a1e', '#5a4a30', '#2c1c2c', '#1f3324'].map(c => new THREE.MeshStandardMaterial({ color: lin(c), roughness: 0.9 }));
  const paperMat = new THREE.MeshStandardMaterial({ color: lin(0x8a8270), roughness: 1, side: THREE.DoubleSide });
  const dirtMat = new THREE.MeshBasicMaterial({ map: dirtTex(), transparent: true, depthWrite: false });
  const webMat = new THREE.MeshBasicMaterial({ map: webTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x8a9aa0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const creamFront = api.mat(searchFrontTex(2), 1, { uv: 'unit', roughness: 0.75 });
  const cavityMat = new THREE.MeshStandardMaterial({ color: lin(0x1a120a), roughness: 1 });
  const creamSide = api.mat(woodTex('#ad9f7f'), 1, { roughness: 0.8 });
  const drawerFace = api.mat(T((g, w, h) => {
    g.fillStyle = '#c8b893'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9a7a38'; g.fillRect(w / 2 - 28, h / 2 - 6, 56, 12);
    g.fillStyle = '#d8b860'; g.fillRect(w / 2 - 26, h / 2 - 5, 52, 3);
    grime(g, w, h, 400, 0.15);
  }, 256, 64), 1, { uv: 'unit', roughness: 0.75 });
  const lockerBody = api.mat(lockerTex(false), 1, { uv: 'unit', roughness: 0.6, metalness: 0.4 });
  const lockerDoor = api.mat(lockerTex(true), 1, { uv: 'unit', roughness: 0.6, metalness: 0.4, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const lockerDark = new THREE.MeshStandardMaterial({ color: lin(0x15180f), roughness: 1 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb04a });
  const candleGlow = new THREE.SpriteMaterial({ map: glowTex(255, 170, 80), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  const doorMat = api.mat(doorsTex(false), 1, { uv: 'unit', roughness: 0.8 });
  const stoneMat = api.mat(api.gridTex('#2a2a28', '#1e1e1c', 2), 2, { uv: 'world' });

  // turn a group of meshes into static world meshes (so they merge into a few draw calls)
  function bake(group) {
    group.updateMatrixWorld(true);
    group.traverse(m => {
      if (!m.isMesh) return;
      const geo = m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      add(new THREE.Mesh(geo, m.material));
    });
  }
  const mesh = (geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); return m; };
  const faceIndex = (nx, nz) => nx > 0 ? 0 : nx < 0 ? 1 : nz > 0 ? 4 : 5;     // BoxGeometry face order
  const faces = (frontIdx, front, side, top) => [0, 1, 2, 3, 4, 5].map(i => i === frontIdx ? front : i === 2 ? top : side);
  function solid(x, y, z, w, h, d, material, noLedge = true) {
    const m = box(x, y, z, w, h, d, material, true);
    if (noLedge) api.lastCollider.noLedge = true;     // not a ledge for the vault prompt
    return m;
  }

  function spillBooks(x, z, n, spread) {
    for (let k = 0; k < n; k++) {
      const w = 0.14 + rnd() * 0.1, h = 0.035 + rnd() * 0.035, d = 0.2 + rnd() * 0.08;
      const b = mesh(new THREE.BoxGeometry(w, h, d), pick(bookMats), x + (rnd() - 0.5) * spread, h / 2 + (rnd() < 0.2 ? h : 0), z + (rnd() - 0.5) * spread);
      b.rotation.set(rnd() < 0.15 ? 0.3 : 0, rnd() * Math.PI, rnd() < 0.15 ? 0.25 : 0);
      add(b);
    }
  }
  function papers(x, z, n, spread) {
    for (let k = 0; k < n; k++) {
      const p = mesh(new THREE.PlaneGeometry(0.21, 0.29), paperMat, x + (rnd() - 0.5) * spread, 0.022 + k * 0.001, z + (rnd() - 0.5) * spread);
      p.rotation.set(-Math.PI / 2, 0, rnd() * Math.PI * 2);
      add(p);
    }
  }
  function rubble(x, z, n, spread) {
    for (let k = 0; k < n; k++) {
      const s = 0.04 + rnd() * 0.12;
      const m = mesh(new THREE.BoxGeometry(s, s * 0.6, s * (0.7 + rnd() * 0.6)), plasterMat, x + (rnd() - 0.5) * spread, s * 0.3, z + (rnd() - 0.5) * spread);
      m.rotation.y = rnd() * 3; add(m);
    }
  }
  function chair(x, z, yaw, tipped) {
    const gr = new THREE.Group();
    gr.add(mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), darkWoodMat, 0, 0.46, 0));
    for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) gr.add(mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), darkWoodMat, lx, 0.23, lz));
    gr.add(mesh(new THREE.BoxGeometry(0.46, 0.5, 0.04), darkWoodMat, 0, 0.73, -0.2));
    gr.position.set(x, 0, z); gr.rotation.y = yaw;
    if (tipped) { gr.rotation.x = -1.35; gr.position.y = 0.22; }
    bake(gr);
    if (!tipped) solid(x, 0, z, 0.45, 0.5, 0.45, null);
  }
  function cobweb(x, y, z, yaw, size, tiltDown = 0.6) {
    const w = mesh(new THREE.PlaneGeometry(size, size), webMat, x, y, z);
    w.rotation.set(tiltDown, yaw, Math.PI);      // spokes start in the corner
    add(w);
  }
  // ---------- walls: portraits + sconces in rooms; in the halls, shelves (standing, leaning, toppled) ----------
  function shelfSlot(run, c, r, t) {
    const n = run.dir, ax = run.axis;
    const outCell = ax === 'z' ? get(c, r + n) : get(c + n, r);
    const roll = rnd();
    const SW = 1.2, SD = 0.42, SH = 2.0;
    const at = (along, out, y, w, h, d, material, collide) => ax === 'z'
      ? box(along, y, run.coord + n * out, w, h, d, material, collide)
      : box(run.coord + n * out, y, along, d, h, w, material, collide);
    const xzAt = (along, out) => ax === 'z' ? [along, run.coord + n * out] : [run.coord + n * out, along];
    const shelfMats = [books2, books2, darkWoodMat, darkWoodMat, books2, books2];

    if (roll < 0.4) {                                             // standing, half emptied
      const m = at(t, SD / 2 + 0.02, 0, SW, SH, SD, shelfMats, true); api.lastCollider.noLedge = true;
      const [bx, bz] = xzAt(t, 0.7); spillBooks(bx, bz, 1 + Math.floor(rnd() * 3), 0.9);
      if (rnd() < 0.5) { const [wx, wz] = xzAt(t + SW / 2 - 0.1, 0.1); cobweb(wx, SH + 0.05, wz, run.axis === 'z' ? 0 : Math.PI / 2, 0.6); }
      return m;
    }
    if (roll < 0.62) {                                            // leaning against the wall, about to go
      const m = at(t, 0.34, 0, SW, SH, SD, shelfMats, false);
      if (ax === 'z') m.rotation.x = -n * 0.2; else m.rotation.z = n * 0.2;
      at(t, 0.32, 0, SW, SH, 0.6, null, true); api.lastCollider.noLedge = true;
      const [bx, bz] = xzAt(t, 0.9); spillBooks(bx, bz, 3 + Math.floor(rnd() * 4), 1.0);
      return m;
    }
    if (outCell === '.') {                                        // toppled out into the hall — hop over it
      const yaw = (rnd() - 0.5) * 0.18;
      const m = at(t, 1.2, 0.03, SW, SD, SH, [darkWoodMat, darkWoodMat, darkWoodMat, books2, darkWoodMat, darkWoodMat], false);
      m.rotation.set(ax === 'z' ? 0.05 : 0, yaw, ax === 'z' ? 0 : 0.05);
      at(t, 1.2, 0, SW + 0.1, 0.55, 2.2, null, true);
      const [bx, bz] = xzAt(t, 1.4); spillBooks(bx, bz, 8 + Math.floor(rnd() * 8), 2.4); papers(bx, bz, 4, 2.2);
      const [rx, rz] = xzAt(t, 0.15); rubble(rx, rz, 3, 1.0);
      return m;
    }
    return null;
  }

  // more materials for the house
  const tileMat = floorMat('tile');
  const porcelain = new THREE.MeshStandardMaterial({ color: lin(0xb8b2a2), roughness: 0.35 });
  const porcelainDirty = new THREE.MeshStandardMaterial({ color: lin(0x8a8270), roughness: 0.6 });
  const waterMat = new THREE.MeshStandardMaterial({ color: lin(0x1a1c12), roughness: 0.15, metalness: 0.2 });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: lin(0x4a5458), roughness: 0.08, metalness: 0.9 });
  const ironMat = new THREE.MeshStandardMaterial({ color: lin(0x18191a), roughness: 0.6, metalness: 0.6 });
  const sheetMat = api.mat(sheetTex('#9a907a'), 1.5, { roughness: 1 });
  const sheetDark = api.mat(sheetTex('#5a2a2a'), 1.5, { roughness: 1 });
  const pillowMat = api.mat(sheetTex('#b0a68e'), 0.6, { roughness: 1 });
  const fabricMat = api.mat(sheetTex('#3a2a20'), 1.2, { roughness: 1 });
  const fabricGreen = api.mat(sheetTex('#24301e'), 1.2, { roughness: 1 });
  const hedgeMat = api.mat(hedgeTex(), 1.5, { uv: 'world', roughness: 1 });
  const gardenStone = api.mat(stoneTex(), 2, { uv: 'world', roughness: 0.95 });
  const barkMat = api.mat(barkTex(), 1, { roughness: 1 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
  const sootMat = new THREE.MeshStandardMaterial({ color: lin(0x0a0807), roughness: 1 });
  const fridgeMat = new THREE.MeshStandardMaterial({ color: lin(0x8c8676), roughness: 0.5, metalness: 0.2 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: lin(0x4a3c26), roughness: 1 });
  const glowWarm = new THREE.SpriteMaterial({ map: glowTex(255, 140, 60), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });

  // =====================================================================
  // helpers (cell-based, on the current floor)
  // =====================================================================
  // greedy-merge cells matching pred(c, r) into rectangles (fewer boxes)
  function mergeRects(pred) {
    const used = []; for (let r = 0; r < H; r++) used.push(new Array(W).fill(false));
    const ok = (c, r) => c >= 0 && r >= 0 && c < W && r < H && !used[r][c] && pred(c, r);
    const out = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!ok(c, r)) continue;
      let c1 = c; while (ok(c1 + 1, r)) c1++;
      let r1 = r;
      outer: while (r1 + 1 < H) { for (let k = c; k <= c1; k++) if (!ok(k, r1 + 1)) break outer; r1++; }
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      out.push({ c0: c, r0: r, c1, r1 });
    }
    return out;
  }
  const byChar = chars => (c, r) => chars.includes(get(c, r));
  function rectBox(R, y0, y1, material, collide = true, inset = 0) {
    const x0 = ex(R.c0) + inset, x1 = ex(R.c1 + 1) - inset, z0 = ez(R.r0) + inset, z1 = ez(R.r1 + 1) - inset;
    return box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, material, collide);
  }
  function cellBox(c, r, size, y0, y1, material, collide = true) {
    return box(cx(c), y0, cz(r), size, y1 - y0, size, material, collide);
  }
  // box inside a wall-cell: l = along the passage axis, a = across it (both relative to cell centre)
  function sub(c, r, axis, l0, l1, a0, a1, y0, y1, material, collide = true) {
    const x = cx(c), z = cz(r);
    if (axis === 'x') return box(x + (l0 + l1) / 2, y0, z + (a0 + a1) / 2, l1 - l0, y1 - y0, a1 - a0, material, collide);
    return box(x + (a0 + a1) / 2, y0, z + (l0 + l1) / 2, a1 - a0, y1 - y0, l1 - l0, material, collide);
  }
  const passable = ch => (isOpen(ch) || ch === ' ') && ch !== 'D';
  function passAxis(c, r) {
    const xOK = passable(get(c - 1, r)) && passable(get(c + 1, r));
    const zOK = passable(get(c, r - 1)) && passable(get(c, r + 1));
    if (zOK && !xOK) return 'z';
    if (xOK && !zOK) return 'x';
    return isWallish(get(c - 1, r)) ? 'z' : 'x';
  }
  // the solid part of a doorway / vent / hole cell: a plaster core, with wallpaper on each face for the room it faces
  function solidPart(c, r, ax, a0, a1, y0, y1) {
    sub(c, r, ax, -HALF, HALF, a0, a1, y0, y1, coreMat);
    for (const s of [-1, 1]) {
      const zone = ax === 'x' ? zoneAt(c + s, r) : zoneAt(c, r + s);
      const l = s * (HALF + 0.01);
      sub(c, r, ax, l - 0.01, l + 0.01, a0, a1, y0, y1, wallMat(zone.wall), false);
    }
  }
  // which side of a cell is against a wall: [dc, dr]
  const wallSide = (c, r) => [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dc, dr]) => '#Z'.includes(get(c + dc, r + dr))) || [0, 1];
  // carpet / rug plane with its pattern aligned to its own edges
  function carpet(x0, z0, x1, z1, y, material, along = null) {
    const w = x1 - x0, d = z1 - z0, alongX = along ? along === 'x' : w > d;
    const across = alongX ? d : w, len = alongX ? w : d;
    const geo = new THREE.PlaneGeometry(across, len);
    const uv = geo.attributes.uv, p = geo.attributes.position;
    const start = alongX ? x0 : z0;
    for (let i = 0; i < uv.count; i++) {
      if (along) uv.setY(i, (start + len / 2 + p.getY(i)) / (across * 2));
      else uv.setY(i, uv.getY(i) * len / (across * 2));
    }
    const m = new THREE.Mesh(geo, material);
    m.rotation.set(-Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    add(m);
  }
  // cells that have a floor under them on the upper storey
  const floored1 = (c, r) => !' _Ov'.includes(get(c, r, 1));

  // =====================================================================
  // atmosphere
  // =====================================================================
  scene.background = new THREE.Color(0x020304);
  scene.fog = new THREE.FogExp2(0x030405, 0.07);
  scene.add(new THREE.HemisphereLight(0x2a3242, 0x050404, lit(0.09, 0.045, 0.022)));
  scene.add(new THREE.AmbientLight(0xffffff, lit(0.01, 0.004, 0)));
  const prevTrim = api.setTrim(false);

  // =====================================================================
  // ground, floors, ceilings, roof
  // =====================================================================
  onFloor(0);
  // the ground (also the basement's ceiling), with the opening over the cellar stairs
  for (const R of mergeRects((c, r) => !'z'.includes(get(c, r, 2)))) rectBox(R, -0.5, 0, [coreMat, coreMat, floorMat('wood'), ceilMat, coreMat, coreMat]);
  onFloor(2);
  for (const R of mergeRects((c, r) => get(c, r) !== ' ')) rectBox(R, -0.5, 0, floorMat('concrete'));
  onFloor(0);
  for (const z of L.zones) {
    onFloor(z.f);
    const inZone = (c, r) => zoneAt(c, r) === z && !isWallish(get(c, r)) && get(c, r) !== 'd' && (z.f !== 1 || floored1(c, r));
    for (const R of mergeRects(inZone)) rectBox(R, 0, 0.004, floorMat(z.floor), false);
  }
  // the upper floor: a slab with the ground floor's ceiling underneath
  onFloor(0);
  const slabMats = [coreMat, coreMat, floorMat('wood'), ceilMat, coreMat, coreMat];
  // around the rotten floor the boards give way: the solid slab stops short of the hole by about your
  // body width, so you can't just stroll across a one-cell hole on its edges
  const nearHole = (c, r) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => get(c + dc, r + dr, 1) === 'O');
  for (const R of mergeRects((c, r) => floored1(c, r) && !nearHole(c, r))) rectBox(R, STOREY - 0.3, STOREY, slabMats);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!floored1(c, r) || !nearHole(c, r)) continue;
    const cut = (dc, dr) => (get(c + dc, r + dr, 1) === 'O' ? 0.4 : 0);
    const x0 = ex(c) + cut(-1, 0), x1 = ex(c + 1) - cut(1, 0), z0 = ez(r) + cut(0, -1), z1 = ez(r + 1) - cut(0, 1);
    box((x0 + x1) / 2, STOREY - 0.3, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, slabMats);
  }
  // the roof
  {
    const r0 = 18, r1 = H - 1, z0 = ez(r0), z1 = ez(r1 + 1);
    api.box(0, STOREY + CE, (z0 + z1) / 2, W * CELL, 0.4, z1 - z0, [coreMat, coreMat, coreMat, ceilMat, coreMat, coreMat]);
  }

  // =====================================================================
  // walls + wallpaper
  // =====================================================================
  const runs = [];
  for (const f of LEVELS) {
    onFloor(f);
    for (const R of mergeRects(byChar('#Q'))) rectBox(R, 0, WH(), coreMat);
    // wallpaper on every exposed face, coloured by the room it faces. On the ground floor it stops at the
    // ceiling, except where there's no ceiling (the garden, the open foyer)
    const cladTop = (c, r) => (F === 2 ? BH : F === 1 ? (get(c, r) === ' ' ? CE + 0.4 : CE) : (floored1(c, r) ? CE : STOREY));
    const faceable = ch => isOpen(ch) || (F === 1 && ch === ' ');
    function emitRun(axis, dir, line, a, b, zone, top) {
      if (axis === 'z') {
        const coord = dir > 0 ? ez(line + 1) : ez(line), x0 = ex(a), x1 = ex(b + 1);
        box((x0 + x1) / 2, 0, coord + dir * 0.01, x1 - x0, top, 0.02, wallMat(zone.wall), false);
        const cells = []; for (let c = a; c <= b; c++) cells.push([c, line + dir]);
        runs.push({ f, axis, dir, coord, cells, zone });
      } else {
        const coord = dir > 0 ? ex(line + 1) : ex(line), z0 = ez(a), z1 = ez(b + 1);
        box(coord + dir * 0.01, 0, (z0 + z1) / 2, 0.02, top, z1 - z0, wallMat(zone.wall), false);
        const cells = []; for (let r = a; r <= b; r++) cells.push([line + dir, r]);
        runs.push({ f, axis, dir, coord, cells, zone });
      }
    }
    for (let r = 0; r < H; r++) for (const dir of [-1, 1]) {
      let start = -1, key = null, zone = null, top = 0;
      for (let c = 0; c <= W; c++) {
        const ok = c < W && get(c, r) === '#' && r + dir >= 0 && r + dir < H && faceable(get(c, r + dir));
        const zn = ok ? zoneAt(c, r + dir) : null, tp = ok ? cladTop(c, r + dir) : 0, k = ok ? zn.name + tp : null;
        if (ok && start >= 0 && k === key) continue;
        if (start >= 0) emitRun('z', dir, r, start, c - 1, zone, top);
        start = ok ? c : -1; key = k; zone = zn; top = tp;
      }
    }
    for (let c = 0; c < W; c++) for (const dir of [-1, 1]) {
      let start = -1, key = null, zone = null, top = 0;
      for (let r = 0; r <= H; r++) {
        const ok = r < H && get(c, r) === '#' && c + dir >= 0 && c + dir < W && faceable(get(c + dir, r));
        const zn = ok ? zoneAt(c + dir, r) : null, tp = ok ? cladTop(c + dir, r) : 0, k = ok ? zn.name + tp : null;
        if (ok && start >= 0 && k === key) continue;
        if (start >= 0) emitRun('x', dir, c, start, r - 1, zone, top);
        start = ok ? r : -1; key = k; zone = zn; top = tp;
      }
    }
  }

  // =====================================================================
  // doorways, vents, holes, the window
  // =====================================================================
  for (const f of LEVELS) {
    onFloor(f);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = get(c, r);
      if (!'DVHW'.includes(ch)) continue;
      const ax = passAxis(c, r);
      const acrossNb = s => ax === 'x' ? get(c, r + s) : get(c + s, r);
      if (ch === 'D') {
        solidPart(c, r, ax, -HALF, HALF, 2.8, WH());
        sub(c, r, ax, -HALF - 0.04, HALF + 0.04, -HALF, HALF, 2.7, 2.8, darkWoodMat, false);     // lintel trim
        for (const s of [-1, 1]) if (acrossNb(s) === '#') {                                       // door casing
          const a0 = s < 0 ? -HALF : HALF - 0.1;
          sub(c, r, ax, -HALF - 0.04, HALF + 0.04, a0, a0 + 0.1, 0, 2.8, darkWoodMat, false);
        }
      } else if (ch === 'V') {
        const ow = 1.35, oh = 1.35;            // wide + tall enough to slide in at an angle, too low to walk through
        api.addPassage({ x: cx(c), z: cz(r), y: Y0, axis: ax, depth: CELL, half: ow / 2 });
        solidPart(c, r, ax, -HALF, HALF, oh, WH());
        solidPart(c, r, ax, -HALF, -ow / 2, 0, oh);
        solidPart(c, r, ax, ow / 2, HALF, 0, oh);
        sub(c, r, ax, -HALF, HALF, -ow / 2, ow / 2, oh - 0.03, oh, ductMat, false);
        sub(c, r, ax, -HALF, HALF, -ow / 2, ow / 2, 0, 0.01, ductMat, false);
        for (const s of [-1, 1]) {
          const l = s * (HALF + 0.015);
          sub(c, r, ax, l - 0.015, l + 0.015, -ow / 2 - 0.06, ow / 2 + 0.06, oh, oh + 0.06, ductMat, false);
          sub(c, r, ax, l - 0.015, l + 0.015, -ow / 2 - 0.06, -ow / 2, 0, oh + 0.06, ductMat, false);
          sub(c, r, ax, l - 0.015, l + 0.015, ow / 2, ow / 2 + 0.06, 0, oh + 0.06, ductMat, false);
        }
        const s = rnd() < 0.5 ? -1 : 1;
        const gr = sub(c, r, ax, s * (HALF + 0.55) - 0.4, s * (HALF + 0.55) + 0.4, -0.45, 0.45, 0.005, 0.03, ductMat, false);
        gr.rotation.y = (rnd() - 0.5) * 0.9;
      } else {
        // H: a hole knocked through the wall (vault through). W: the bedroom window over the garden ladder
        const win = ch === 'W', ow = 1.4;
        const sill = win ? 0.6 : 1.0, top = win ? 2.6 : 2.7;
        api.setTrim(true);
        solidPart(c, r, ax, -HALF, HALF, 0, sill);
        api.setTrim(false);
        solidPart(c, r, ax, -HALF, HALF, top, WH());
        solidPart(c, r, ax, -HALF, -ow / 2, sill, top);
        solidPart(c, r, ax, ow / 2, HALF, sill, top);
        if (win) {
          // window frame, a few teeth of broken glass, one shutter hanging off its hinge outside
          for (const s of [-1, 1]) {
            const l = s * (HALF - 0.05);
            sub(c, r, ax, l - 0.05, l + 0.05, -ow / 2, ow / 2, top - 0.1, top, darkWoodMat, false);
            sub(c, r, ax, l - 0.05, l + 0.05, -ow / 2, -ow / 2 + 0.1, sill, top, darkWoodMat, false);
            sub(c, r, ax, l - 0.05, l + 0.05, ow / 2 - 0.1, ow / 2, sill, top, darkWoodMat, false);
          }
          for (let k = 0; k < 6; k++) {
            const s = rnd() < 0.5 ? -1 : 1, a = s * (ow / 2 - 0.12 - rnd() * 0.1), y = sill + 0.1 + rnd() * 1.6, size = 0.08 + rnd() * 0.14;
            const g = sub(c, r, ax, -HALF + 0.08, -HALF + 0.09, a - size / 2, a + size / 2, y, y + size * 1.6, glassMat, false);
            g.rotation.set(0, 0, (rnd() - 0.5) * 0.8);
          }
          const sh = sub(c, r, ax, -HALF - 0.1, -HALF - 0.06, ow / 2 - 0.05, ow / 2 + 0.6, sill - 0.3, top - 0.2, darkWoodMat, false);
          sh.rotation.set(0, 0, 0.25);
        } else {
          for (let k = 0; k < 7; k++) {
            const s = rnd() < 0.5 ? -1 : 1, size = 0.08 + rnd() * 0.16;
            const a = s * (ow / 2 - rnd() * 0.12), y = sill + 0.1 + rnd() * (top - sill - 0.2);
            sub(c, r, ax, -HALF - 0.01, HALF + 0.01, a - size / 2, a + size / 2, y, y + size, plasterMat, false);
          }
          for (let k = 0; k < 8; k++) {
            const s = rnd() < 0.5 ? -1 : 1, size = 0.05 + rnd() * 0.15, l = s * (HALF + 0.15 + rnd() * 0.7), a = (rnd() - 0.5) * 1.6;
            sub(c, r, ax, l - size / 2, l + size / 2, a - size / 2, a + size / 2, 0, size * 0.6, plasterMat, false);
          }
        }
      }
    }
  }

  // =====================================================================
  // the grand staircase (west side of the foyer, rising north to the gallery)
  // =====================================================================
  onFloor(0);
  const S = L.stairs;
  {
    const run = (S.rBottom - S.rTop + 1) * CELL, depth = run / S.steps;
    const x0 = ex(S.c0), x1 = ex(S.c1 + 1), zS = ez(S.rBottom + 1);
    for (let k = 1; k <= S.steps; k++) {
      const zA = zS - k * depth, zB = zA + depth;
      box((x0 + x1) / 2, 0, (zA + zB) / 2, x1 - x0, k * S.rise, depth, stairMat);
      carpet(x0 + 0.5, zA, x1 - 0.5, zB, k * S.rise + 0.004, carpetMat, 'z');
    }
    // banister down the open (east) side: posts + a sloped handrail
    const bx = x1 - 0.06;
    for (let k = 1; k <= S.steps; k += 2) {
      const zm = zS - (k - 0.5) * depth;
      box(bx, k * S.rise, zm, 0.07, 0.95, 0.07, darkWoodMat, false);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, Math.hypot(run, S.steps * S.rise)), darkWoodMat);
    rail.position.set(bx, (S.steps * S.rise) / 2 + 0.98, zS - run / 2);
    rail.rotation.x = Math.atan2(S.steps * S.rise, run);
    add(rail);
    box(bx, 0, zS - 0.1, 0.16, 1.15, 0.16, darkWoodMat, false);          // newel post
  }

  // =====================================================================
  // the cellar stairs: steep and narrow, down from the laundry to the basement
  // =====================================================================
  {
    const C = L.cellar;
    onFloor(2);
    const sg = Math.sign(C.lowRow - C.highRow);                  // +1: the steps climb north
    const run = (Math.abs(C.highRow - C.lowRow) + 1) * CELL, depth = run / C.steps;
    const x0 = ex(C.c0), x1 = ex(C.c1 + 1), zL = sg > 0 ? ez(C.lowRow + 1) : ez(C.lowRow);
    for (let k = 1; k <= C.steps; k++) {
      const zA = zL - sg * (k - 1) * depth, zm = zA - sg * depth / 2;
      box((x0 + x1) / 2, 0, zm, x1 - x0, k * C.rise, depth, gardenStone);
      box((x0 + x1) / 2, k * C.rise, zA - sg * (depth - 0.03), x1 - x0, 0.015, 0.06, ironMat, false);   // worn edge
    }
    // a hand rope along the wall
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(run, C.steps * C.rise)), ropeMat);
    rope.position.set(x0 + 0.08, C.steps * C.rise / 2 + 0.9, zL - sg * run / 2);
    rope.rotation.x = -sg * (Math.PI / 2 - Math.atan2(C.steps * C.rise, run));
    add(rope);
    // up in the garden: a low stone surround on three sides, the two old cellar doors flung open on either side,
    // and you step in from the end the steps climb toward
    onFloor(0);
    const entry = [0, -sg];                                      // the open side
    let minC = W, maxC = 0, minR = H, maxR = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (get(c, r) !== 'd') continue;
      minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (dc === entry[0] && dr === entry[1]) continue;
        if (get(c + dc, r + dr) === 'd' || isWallish(get(c + dc, r + dr))) continue;
        if (dc) { const x = dc > 0 ? ex(c + 1) : ex(c); box(x, 0, cz(r), 0.3, 0.75, CELL, gardenStone); }
        else { const z = dr > 0 ? ez(r + 1) : ez(r); box(cx(c), 0, z, CELL + 0.3, 0.75, 0.3, gardenStone); }
      }
    }
    // the two doors: heavy planks with iron straps, lying open on the grass to each side
    const dz0 = ez(minR), dz1 = ez(maxR + 1), dlen = dz1 - dz0 - 0.2, dw = (ex(maxC + 1) - ex(minC)) / 2;
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const hx = side < 0 ? ex(minC) - 0.15 : ex(maxC + 1) + 0.15;
      g.position.set(hx + side * dw / 2, 0.8, (dz0 + dz1) / 2);
      g.rotation.z = side * -0.35;                               // tipped back against the surround
      g.add(mesh(new THREE.BoxGeometry(dw, 0.08, dlen), darkWoodMat, 0, 0, 0));
      for (const t of [-0.35, 0, 0.35]) g.add(mesh(new THREE.BoxGeometry(dw + 0.02, 0.1, 0.06), ironMat, 0, 0, t * dlen));
      g.add(mesh(new THREE.TorusGeometry(0.07, 0.015, 4, 10), ironMat, side * -dw * 0.3, 0.06, 0).rotateX(Math.PI / 2));
      bake(g);
    }
    // a lamp glowing faintly down the steps
    const cl = new THREE.PointLight(0xffb070, lit(0.45, 0.22, 0), 7, 2); cl.position.set((x0 + x1) / 2, -1.5, (dz0 + dz1) / 2); scene.add(cl);
  }

  // =====================================================================
  // upper floor edges: balustrade around the open foyer; broken floor; floor vents
  // =====================================================================
  onFloor(1);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = get(c, r);
    if (!isOpen(ch) || '_Ov'.includes(ch)) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (get(c + dc, r + dr) !== '_') continue;
      if (dr === 1 && r + 1 === S.rTop && c >= S.c0 && c <= S.c1) continue;       // top of the stairs
      if (dc !== 0) {
        const x = (dc > 0 ? ex(c + 1) : ex(c)) - dc * 0.06;
        box(x, 0, cz(r), 0.1, 0.95, CELL, null);
        box(x, 0, cz(r), 0.05, 0.95, CELL, balMat, false);
        box(x, 0.95, cz(r), 0.12, 0.06, CELL + 0.02, darkWoodMat, false);
      } else {
        const z = (dr > 0 ? ez(r + 1) : ez(r)) - dr * 0.06;
        box(cx(c), 0, z, CELL, 0.95, 0.1, null);
        box(cx(c), 0, z, CELL, 0.95, 0.05, balMat, false);
        box(cx(c), 0.95, z, CELL + 0.02, 0.06, 0.12, darkWoodMat, false);
      }
    }
  }
  // the gallery's edge seen from below (the slab face over the foyer)
  for (let c = 13; c <= 22; c++) box(cx(c), -0.3, ez(33) - 0.01, CELL, 0.3, 0.02, darkWoodMat, false);

  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = get(c, r);
    if (ch === 'O') {
      // rotten boards: jagged plank ends poking into the hole, a dark rim; from below, splinters hanging down
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!floored1(c + dc, r + dr)) continue;
        for (let k = 0; k < 5; k++) {
          const len = 0.15 + rnd() * 0.45, wdt = 0.13, t = (k - 2) * 0.28 + (rnd() - 0.5) * 0.05;
          const px = dc ? cx(c) + dc * (HALF - len / 2) : cx(c) + t, pz = dr ? cz(r) + dr * (HALF - len / 2) : cz(r) + t;
          const b = box(px, -0.06 - rnd() * 0.05, pz, dc ? len : wdt, 0.05, dc ? wdt : len, darkWoodMat, false);
          b.rotation.set(dr ? (rnd() - 0.5) * 0.5 : 0, 0, dc ? (rnd() - 0.5) * 0.5 : 0);
        }
      }
      for (let k = 0; k < 4; k++) {
        const b = box(cx(c) + (rnd() - 0.5) * 1.1, -0.9 - rnd() * 0.5, cz(r) + (rnd() - 0.5) * 1.1, 0.12, 0.6 + rnd() * 0.5, 0.04, darkWoodMat, false);
        b.rotation.set((rnd() - 0.5) * 0.6, rnd() * 3, (rnd() - 0.5) * 0.6);
      }
      onFloor(0); rubble(cx(c), cz(r), 10, 1.8); spillBooks(cx(c), cz(r), 2, 1.2); onFloor(1);
    } else if (ch === 'v') {
      // a floor vent: a sheet-metal housing you crawl into, with the shaft dropping to the room below
      const open = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([dc, dr]) => floored1(c + dc, r + dr) && isOpen(get(c + dc, r + dr))) || [0, 1];
      const VH = 1.35, T = 0.08, x = cx(c), z = cz(r);
      box(x, VH, z, CELL, 0.1, CELL, ductMat);                           // lid (solid: you can't stand up in it)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (dc === open[0] && dr === open[1]) {
          // the opening: a frame around it, the grate kicked out onto the floor
          const fx = x + dc * (HALF - T / 2), fz = z + dr * (HALF - T / 2);
          box(fx, VH - 0.08, fz, dc ? T : CELL, 0.08, dc ? CELL : T, ductMat, false);
          const g = box(x + dc * (HALF + 0.6), 0.005, z + dr * (HALF + 0.6), 0.9, 0.025, 0.9, ductMat, false);
          g.rotation.y = (rnd() - 0.5) * 0.9;
          continue;
        }
        box(x + dc * (HALF - T / 2), 0, z + dr * (HALF - T / 2), dc ? T : CELL, VH, dc ? CELL : T, ductMat);
      }
      api.addPassage({ x, z, y: Y0, axis: open[0] ? 'x' : 'z', depth: CELL, half: 0.6 });
      // the shaft through the slab + the vent mouth in the ceiling below
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        box(x + dc * (HALF - 0.03), -0.6, z + dr * (HALF - 0.03), dc ? 0.06 : CELL, 0.6, dc ? CELL : 0.06, ductMat, false);
      }
      const hang = box(x + 0.3, -1.1, z - 0.3, 0.9, 0.03, 0.9, ductMat, false);   // grate hanging off one hinge
      hang.rotation.set(1.1, 0.2, 0);
    }
  }

  // =====================================================================
  // the garden ladder up to the small bedroom's window
  // =====================================================================
  onFloor(0);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (get(c, r) !== 'L') continue;
    const [dc, dr] = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([dc, dr]) => get(c + dc, r + dr) === '#');
    const top = STOREY + 0.6;                                   // the window sill
    if (dc !== 0) api.climbable('ladder', 'x', -dc, dc > 0 ? ex(c + 1) : ex(c), cz(r), 0.7, 0, top);
    else api.climbable('ladder', 'z', -dr, dr > 0 ? ez(r + 1) : ez(r), cx(c), 0.7, 0, top);
  }

  // =====================================================================
  // furniture
  // =====================================================================
  // which way a piece faces: away from the wall it's against
  function rectAgainst(R) {
    const sides = [
      [0, -1, () => { for (let c = R.c0; c <= R.c1; c++) if (!'#Z'.includes(get(c, R.r0 - 1))) return false; return true; }],
      [0, 1, () => { for (let c = R.c0; c <= R.c1; c++) if (!'#Z'.includes(get(c, R.r1 + 1))) return false; return true; }],
      [-1, 0, () => { for (let r = R.r0; r <= R.r1; r++) if (!'#Z'.includes(get(R.c0 - 1, r))) return false; return true; }],
      [1, 0, () => { for (let r = R.r0; r <= R.r1; r++) if (!'#Z'.includes(get(R.c1 + 1, r))) return false; return true; }],
    ];
    const s = sides.find(([, , t]) => t());
    return s ? [s[0], s[1]] : null;
  }
  const rectXZ = R => ({ x0: ex(R.c0), x1: ex(R.c1 + 1), z0: ez(R.r0), z1: ez(R.r1 + 1) });

  function bed(R) {
    const [dc, dr] = rectAgainst(R) || [0, -1];                 // headboard side
    const { x0, x1, z0, z1 } = rectXZ(R), xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    const alongX = dc !== 0;                                     // bed length runs along x
    const len = (alongX ? x1 - x0 : z1 - z0) - 0.25, wid = Math.min(alongX ? z1 - z0 : x1 - x0, 2.4) - 0.3;
    const hx = xm + dc * 0.1, hz = zm + dr * 0.1;
    const W2 = alongX ? len : wid, D2 = alongX ? wid : len;
    box(hx, 0, hz, W2, 0.66, D2, null); api.lastCollider.noLedge = true;
    const darkSheet = rnd() < 0.5;
    const g = new THREE.Group(); g.position.set(hx, 0, hz); g.rotation.y = Math.atan2(-dc, -dr);   // local +z = toward the foot
    g.add(mesh(new THREE.BoxGeometry(wid, 0.32, len), darkWoodMat, 0, 0.16, 0));
    const matt = mesh(new THREE.BoxGeometry(wid - 0.06, 0.22, len - 0.1), darkSheet ? sheetDark : sheetMat, 0, 0.43, 0.02); matt.rotation.z = (rnd() - 0.5) * 0.03; g.add(matt);
    const cover = mesh(new THREE.BoxGeometry(wid + 0.04, 0.06, len * 0.55), darkSheet ? sheetMat : sheetDark, 0.05, 0.56, len * 0.18); cover.rotation.set(0.03, 0.08, -0.04); g.add(cover);
    for (const s of (wid > 1.6 ? [-1, 1] : [0])) { const p = mesh(new THREE.BoxGeometry(0.6, 0.14, 0.4), pillowMat, s * wid * 0.24, 0.6, -len / 2 + 0.35); p.rotation.y = (rnd() - 0.5) * 0.3; g.add(p); }
    g.add(mesh(new THREE.BoxGeometry(wid + 0.1, 1.35, 0.08), darkWoodMat, 0, 0.675, -len / 2 - 0.04));      // headboard
    g.add(mesh(new THREE.BoxGeometry(wid + 0.1, 0.75, 0.08), darkWoodMat, 0, 0.375, len / 2 + 0.04));       // footboard
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), darkWoodMat, s * (wid / 2 + 0.05), 0.75, -len / 2 - 0.04));
    bake(g);
    return { x: hx, z: hz };
  }
  function toilet(c, r) {
    const [dc, dr] = wallSide(c, r), nx = -dc, nz = -dr;
    const x = cx(c) + dc * 0.35, z = cz(r) + dr * 0.35;
    solid(x, 0, z, 0.5, 0.45, 0.5, null);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(nx, nz);
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.4, 14), porcelainDirty, 0, 0.2, 0.08));
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.06, 16), porcelain, 0, 0.42, 0.1));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 14), waterMat, 0, 0.44, 0.1));
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.5, 0.2), porcelain, 0, 0.75, -0.2));
    const lid = mesh(new THREE.BoxGeometry(0.4, 0.03, 0.42), porcelainDirty, 0, 0.7, -0.05); lid.rotation.x = -1.3; g.add(lid);
    bake(g);
  }
  function bathtub(R) {
    const { x0, x1, z0, z1 } = rectXZ(R), alongX = x1 - x0 > z1 - z0;
    const [dc, dr] = rectAgainst(R) || [0, -1];
    const len = (alongX ? x1 - x0 : z1 - z0) - 0.3, wid = 0.85;
    const xm = (x0 + x1) / 2 + dc * (HALF - wid / 2 - 0.05), zm = (z0 + z1) / 2 + dr * (HALF - wid / 2 - 0.05);
    const w = alongX ? len : wid, d = alongX ? wid : len;
    solid(xm, 0, zm, w, 0.62, d, null);
    box(xm, 0.12, zm, w, 0.5, d, porcelain, false);
    box(xm, 0.55, zm, w - 0.14, 0.02, d - 0.14, waterMat, false);         // black water
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(xm + sx * (w / 2 - 0.1), 0, zm + sz * (d / 2 - 0.1), 0.08, 0.12, 0.08, brassMat, false);   // claw feet
  }
  function sink(c, r) {
    const [dc, dr] = wallSide(c, r);
    const x = cx(c) + dc * 0.45, z = cz(r) + dr * 0.45;
    solid(x, 0, z, 0.5, 0.9, 0.45, null);
    add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.78, 10), porcelain, x, 0.39, z));
    box(x, 0.78, z, 0.55, 0.14, 0.42, porcelain, false);
    box(x, 0.9, z, 0.42, 0.01, 0.3, waterMat, false);
    // a cracked mirror above it
    const mx = cx(c) + dc * (HALF - 0.02), mz = cz(r) + dr * (HALF - 0.02);
    box(mx, 1.3, mz, dc ? 0.03 : 0.6, 0.8, dc ? 0.6 : 0.03, mirrorMat, false);
    box(mx, 1.25, mz, dc ? 0.025 : 0.7, 0.9, dc ? 0.7 : 0.025, frameMat, false);
  }
  function sofa(R) {
    const { x0, x1, z0, z1 } = rectXZ(R), xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, alongX = x1 - x0 > z1 - z0;
    // face the coffee table / fireplace if there is one nearby, otherwise away from the wall
    let face = null;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 3 && !face; k++) {
      const c = dc > 0 ? R.c1 + k : dc < 0 ? R.c0 - k : Math.round((R.c0 + R.c1) / 2), r = dr > 0 ? R.r1 + k : dr < 0 ? R.r0 - k : Math.round((R.r0 + R.r1) / 2);
      if ('lF'.includes(get(c, r)) && (alongX ? dr !== 0 : dc !== 0)) face = [dc, dr];
    }
    if (!face) { const a = rectAgainst(R); face = a ? [-a[0], -a[1]] : alongX ? [0, 1] : [1, 0]; }
    const len = (alongX ? x1 - x0 : z1 - z0) - 0.2, dep = 0.95;
    const g = new THREE.Group(); g.position.set(xm, 0, zm); g.rotation.y = Math.atan2(face[0], face[1]);   // local +z = the way it faces
    g.add(mesh(new THREE.BoxGeometry(len, 0.42, dep), fabricGreen, 0, 0.21, 0));
    for (let k = 0; k < 3; k++) { const cu = mesh(new THREE.BoxGeometry(len / 3 - 0.04, 0.12, dep - 0.25), fabricGreen, (k - 1) * len / 3, 0.48, 0.1); cu.rotation.z = (rnd() - 0.5) * 0.06; g.add(cu); }
    g.add(mesh(new THREE.BoxGeometry(len, 0.55, 0.22), fabricGreen, 0, 0.7, -dep / 2 + 0.11));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.18, 0.62, dep), fabricGreen, s * (len / 2 - 0.09), 0.31, 0));
    bake(g);
    const w = alongX ? len : dep, d = alongX ? dep : len;
    solid(xm, 0, zm, w, 0.5, d, null);
    solid(xm - face[0] * (dep / 2 - 0.11), 0, zm - face[1] * (dep / 2 - 0.11), alongX ? len : 0.22, 0.97, alongX ? 0.22 : len, null);
  }
  const fires = [];
  function fireplace(c, r) {
    const [dc, dr] = wallSide(c, r);
    const x = cx(c) + dc * (HALF - 0.3), z = cz(r) + dr * (HALF - 0.3), along = dc === 0;
    const W2 = along ? 1.5 : 0.6, D2 = along ? 0.6 : 1.5;
    solid(x, 0, z, W2, 1.3, D2, null);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-dc, -dr);
    g.add(mesh(new THREE.BoxGeometry(1.5, 1.2, 0.6), gardenStone, 0, 0.6, 0));
    g.add(mesh(new THREE.BoxGeometry(1.75, 0.08, 0.72), darkWoodMat, 0, 1.24, 0.02));      // mantel
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.75, 0.05), sootMat, 0, 0.42, 0.29));           // firebox
    for (let k = 0; k < 7; k++) g.add(mesh(new THREE.BoxGeometry(0.08 + rnd() * 0.08, 0.04, 0.08 + rnd() * 0.06), emberMat, (rnd() - 0.5) * 0.6, 0.06, 0.34 + rnd() * 0.06));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), barkMat, 0, 0.1, 0.36).rotateZ(Math.PI / 2));
    // clock + candlesticks on the mantel
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.28, 0.12), darkWoodMat, 0, 1.42, 0));
    for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 8), plasterMat, s * 0.6, 1.39, 0));
    bake(g);
    const light = new THREE.PointLight(0xff6a2a, lit(0.5, 0.3, 0.16), 6, 2);      // the fire burns lower when it's harder
    light.position.set(cx(c) - dc * 0.2, Y0 + 0.4, cz(r) - dr * 0.2);
    scene.add(light);
    fires.push(light);
    api.addFlicker(light, []);
    const glow = new THREE.Sprite(glowWarm); glow.position.set(x - dc * 0.35, Y0 + 0.15, z - dr * 0.35); glow.scale.set(0.9, 0.5, 0.9); scene.add(glow);
  }
  function stove(c, r) {
    const [dc, dr] = wallSide(c, r);
    const x = cx(c) + dc * 0.15, z = cz(r) + dr * 0.15;
    solid(x, 0, z, 1.2, 0.95, 1.2, ironMat, false);
    for (const [ox, oz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), sootMat, x + ox, 0.965, z + oz));
    box(x + dc * 0.55, 0.95, z + dr * 0.55, dc ? 0.1 : 1.2, 0.5, dc ? 1.2 : 0.1, ironMat, false);
  }
  function fridge(c, r) {
    const [dc, dr] = wallSide(c, r);
    const x = cx(c) + dc * 0.3, z = cz(r) + dr * 0.3;
    solid(x, 0, z, 0.85, 1.9, 0.85, fridgeMat);
    box(x - dc * 0.44 + (dr ? 0.3 : 0), 0.9, z - dr * 0.44 + (dc ? 0.3 : 0), dc ? 0.04 : 0.05, 0.5, dc ? 0.05 : 0.04, brassMat, false);
  }
  function table(R, h = 0.8) {
    const { x0, x1, z0, z1 } = rectXZ(R), ins = 0.15;
    api.setTrim(true);
    box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0 - ins * 2, h, z1 - z0 - ins * 2, null);
    api.setTrim(false);
    box((x0 + x1) / 2, h - 0.06, (z0 + z1) / 2, x1 - x0 - ins * 2, 0.06, z1 - z0 - ins * 2, woodMat, false);
    for (const [px, pz] of [[x0 + ins + 0.06, z0 + ins + 0.06], [x1 - ins - 0.06, z0 + ins + 0.06], [x0 + ins + 0.06, z1 - ins - 0.06], [x1 - ins - 0.06, z1 - ins - 0.06]]) box(px, 0, pz, 0.08, h - 0.06, 0.08, darkWoodMat, false);
    // a few things left on it
    for (let k = 0; k < 3; k++) {
      const px = x0 + 0.4 + rnd() * (x1 - x0 - 0.8), pz = z0 + 0.4 + rnd() * (z1 - z0 - 0.8);
      if (rnd() < 0.5) add(mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.03, 12), porcelainDirty, px, h + 0.015, pz));
      else add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.18, 8), plasterMat, px, h + 0.09, pz));
    }
  }
  function lowTable(R) {
    const { x0, x1, z0, z1 } = rectXZ(R);
    box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0 - 0.5, 0.42, z1 - z0 - 0.5, null);
    box((x0 + x1) / 2, 0.36, (z0 + z1) / 2, x1 - x0 - 0.5, 0.06, z1 - z0 - 0.5, woodMat, false);
    box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0 - 0.7, 0.36, z1 - z0 - 0.7, darkWoodMat, false);
  }

  for (const f of LEVELS) {
    onFloor(f);
    api.setTrim(true);   // climbable furniture gets painted edges
    for (const R of mergeRects(byChar('b'))) rectBox(R, 0, 2.1, [books, books, shelfTop, shelfTop, books, books], true, 0.1);
    for (const R of mergeRects(byChar('k'))) rectBox(R, 0, 1.0, [cabinets, cabinets, counterTop, cabinets, cabinets, cabinets], true, 0.1);
    for (const R of mergeRects(byChar('n'))) { rectBox(R, 0, 1.05, pianoMat, true, 0.15); rectBox(R, 1.05, 1.07, darkWoodMat, false, 0.25); }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (get(c, r) !== 'q') continue;
      cellBox(c, r, 0.8, 0, 0.75, potMat);
      cellBox(c, r, 0.7, 0.75, 0.77, soilMat, false);
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.2 + rnd() * 0.15, 7, 5), leafMat);
        m.position.set(cx(c) + (rnd() - 0.5) * 0.4, 0.95 + rnd() * 0.3, cz(r) + (rnd() - 0.5) * 0.4);
        add(m);
      }
    }
    api.setTrim(false);
    for (const R of mergeRects(byChar('B'))) bed(R);
    for (const R of mergeRects(byChar('u'))) bathtub(R);
    for (const R of mergeRects(byChar('f'))) sofa(R);
    for (const R of mergeRects(byChar('j'))) table(R);
    for (const R of mergeRects(byChar('l'))) lowTable(R);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = get(c, r), x = cx(c), z = cz(r);
      if (ch === 'w') cellBox(c, r, 1.3, 0, 2.4, [wardrobe, wardrobe, shelfTop, shelfTop, wardrobe, wardrobe]);
      else if (ch === 'c') toilet(c, r);
      else if (ch === 'i') sink(c, r);
      else if (ch === 'F') fireplace(c, r);
      else if (ch === 'e') stove(c, r);
      else if (ch === 'r') fridge(c, r);
      else if (ch === 't') {
        cellBox(c, r, 1.3, 1.05, 1.2, woodMat);                     // slide or crawl underneath
        for (const [lx, lz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) box(x + lx, 0, z + lz, 0.08, 1.05, 0.08, darkWoodMat, false);
        box(x - 0.2, 1.2, z + 0.1, 0.07, 0.25, 0.07, plasterMat, false);
      } else if (ch === 'g') {
        box(x, 0, z, 0.7, 2.4, 0.6, woodMat);
        box(x, 2.4, z, 0.8, 0.15, 0.7, darkWoodMat, false);
        for (const s of [-1, 1]) {
          const face = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), clockMat);
          face.position.set(x, 1.95, z + s * 0.302);
          face.rotation.y = s > 0 ? 0 : Math.PI;
          add(face);
        }
      }
    }
  }

  // ---------- the basement: the old car, the workbench, pillars, the rusted garage door ----------
  let benchIt = null;
  onFloor(2);
  {
    const paint = new THREE.MeshStandardMaterial({ color: lin(0x3a1416), roughness: 0.45, metalness: 0.5 });
    const chrome = new THREE.MeshStandardMaterial({ color: lin(0x8a8c8e), roughness: 0.2, metalness: 1 });
    const tyre = new THREE.MeshStandardMaterial({ color: lin(0x111111), roughness: 0.9 });
    const glass = new THREE.MeshStandardMaterial({ color: lin(0x0c1214), roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
    const cover = api.mat(sheetTex('#3e3a32'), 1.5, { roughness: 1, side: THREE.DoubleSide });
    for (const R of mergeRects(byChar('C'))) {
      const { x0, x1, z0, z1 } = rectXZ(R), x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      const len = z1 - z0 - 0.6, wid = 1.85;
      api.setTrim(true); solid(x, 0, z, wid, 1.05, len, null, false); api.setTrim(false);
      solid(x, 1.05, z + 0.3, 1.6, 0.6, 2.2, null);
      const g = new THREE.Group(); g.position.set(x, 0, z);
      g.add(mesh(new THREE.BoxGeometry(wid, 0.55, len), paint, 0, 0.6, 0));                                 // body
      g.add(mesh(new THREE.BoxGeometry(wid - 0.1, 0.25, len * 0.34), paint, 0, 0.98, -len * 0.3));          // long bonnet
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), glass, 0, 1.35, 0.3));                               // cabin glass
      g.add(mesh(new THREE.BoxGeometry(1.62, 0.07, 2.25), paint, 0, 1.66, 0.3));                            // roof
      for (const sx of [-0.78, 0.78]) for (const sz of [-0.75, 1.35]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), paint, sx, 1.35, 0.3 + sz - 0.3));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                                                  // wheels + fenders
        const wh = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 16), tyre, sx * (wid / 2 - 0.05), 0.4, sz * len * 0.33); wh.rotation.z = Math.PI / 2; g.add(wh);
        const hub = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10), chrome, sx * (wid / 2 - 0.04), 0.4, sz * len * 0.33); hub.rotation.z = Math.PI / 2; g.add(hub);
      }
      for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(wid + 0.1, 0.12, 0.12), chrome, 0, 0.42, sz * (len / 2 + 0.04)));   // bumpers
      for (const sx of [-0.65, 0.65]) g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), chrome, sx, 0.85, -len / 2 + 0.02));        // headlamps
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.05), chrome, 0, 0.8, -len / 2 - 0.01));                                          // grille
      // a dust sheet half pulled off the back
      const sheet = mesh(new THREE.BoxGeometry(wid + 0.16, 0.03, len * 0.26), cover, 0.03, 0.9, len * 0.37); sheet.rotation.set(0.03, 0.02, -0.03); g.add(sheet);
      for (const sx of [-1, 1]) { const drape = mesh(new THREE.BoxGeometry(0.03, 0.5, len * 0.26), cover, sx * (wid / 2 + 0.09), 0.66, len * 0.37); drape.rotation.z = sx * 0.06; g.add(drape); }
      const tail = mesh(new THREE.BoxGeometry(wid + 0.16, 0.45, 0.03), cover, 0.03, 0.68, len / 2 + 0.09); tail.rotation.x = -0.08; g.add(tail);
      const heap = mesh(new THREE.BoxGeometry(1.1, 0.12, 0.7), cover, wid / 2 + 0.55, 0.06, len * 0.1); heap.rotation.y = 0.4; g.add(heap);    // the rest of it, pulled off onto the floor
      bake(g);
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = get(c, r);
      if (ch === 'p') {
        solid(cx(c), 0, cz(r), 0.6, BH, 0.6, gardenStone);
      } else if (ch === 'Q') {
        // the garage door on its inside face: corrugated steel, rusted shut
        const face = ex(c + 1) + 0.03;
        box(face, 0, cz(r), 0.05, 2.6, CELL, ironMat, false);
        for (let k = 0; k < 9; k++) box(face + 0.03, 0.15 + k * 0.28, cz(r), 0.03, 0.05, CELL, ductMat, false);
      }
    }
    for (const R of mergeRects(byChar('K'))) {
      const { x0, x1, z0, z1 } = rectXZ(R);
      const [dc, dr] = rectAgainst(R) || [0, -1];
      const nx = -dc, nz = -dr;
      const dep = 0.85, x = (x0 + x1) / 2 + dc * (HALF - dep / 2 - 0.02), z = (z0 + z1) / 2 + dr * (HALF - dep / 2 - 0.02);
      const len = (dc ? z1 - z0 : x1 - x0) - 0.2;
      const w = dc ? dep : len, d = dc ? len : dep;
      api.setTrim(true); box(x, 0, z, w, 0.95, d, null); api.setTrim(false);
      box(x, 0.88, z, w, 0.07, d, woodMat, false);                                          // thick top
      box(x, 0.25, z, w - 0.1, 0.04, d - 0.1, darkWoodMat, false);                          // lower shelf
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(x + sx * (w / 2 - 0.06), 0, z + sz * (d / 2 - 0.06), 0.08, 0.88, 0.08, darkWoodMat, false);
      // pegboard + tools on the wall behind it
      const wx = (x0 + x1) / 2 + dc * (HALF - 0.02), wz = (z0 + z1) / 2 + dr * (HALF - 0.02);
      box(wx, 1.05, wz, dc ? 0.03 : len, 1.2, dc ? len : 0.03, darkWoodMat, false);
      for (let k = 0; k < 9; k++) {
        const t = (k / 8 - 0.5) * (len - 0.6), tx = dc ? wx - dc * 0.04 : wx + t, tz = dc ? wz + t : wz - dr * 0.04;
        const tool = box(tx, 1.2 + rnd() * 0.6, tz, dc ? 0.03 : 0.05 + rnd() * 0.08, 0.15 + rnd() * 0.3, dc ? 0.05 + rnd() * 0.08 : 0.03, rnd() < 0.5 ? ironMat : darkWoodMat, false);
        tool.rotation.set(0, 0, (rnd() - 0.5) * 0.3);
      }
      // a heavy vise on one end, a few bits and pieces on the top
      const vx = x + (dc ? 0 : -len / 2 + 0.3), vz = z + (dc ? -len / 2 + 0.3 : 0);
      box(vx, 0.95, vz, 0.22, 0.2, 0.3, ironMat, false);
      for (let k = 0; k < 6; k++) {
        const px = x + (dc ? (rnd() - 0.5) * 0.5 : (rnd() - 0.2) * len * 0.7), pz = z + (dc ? (rnd() - 0.2) * len * 0.7 : (rnd() - 0.5) * 0.5);
        const b = box(px, 0.95, pz, 0.06 + rnd() * 0.12, 0.03 + rnd() * 0.05, 0.04 + rnd() * 0.1, rnd() < 0.5 ? ironMat : brassMat, false);
        b.rotation.y = rnd() * 3;
      }
      // a work lamp hanging over it
      const lamp = new THREE.PointLight(0xffd8a0, lit(0.7, 0.45, 0.25), 6, 2); lamp.position.set(x + nx * 0.2, Y0 + 2.2, z + nz * 0.2); scene.add(lamp);
      add(mesh(new THREE.ConeGeometry(0.18, 0.15, 12, 1, true), ironMat, x + nx * 0.2, 2.35, z + nz * 0.2));
      add(mesh(new THREE.SphereGeometry(0.05, 6, 4), bulbMat, x + nx * 0.2, 2.28, z + nz * 0.2));
      benchIt = api.addInteractable({
        type: 'bench', focus: new THREE.Vector3(x + nx * (dep / 2), Y0 + 1.0, z + nz * (dep / 2)), normal: { x: nx, z: nz }, reach: 2.6,
        top: new THREE.Vector3(x, Y0 + 0.96, z), done: false,
      });
    }
  }

  // carpet runners + rugs
  for (const R of L.runners) {
    onFloor(R.f);
    const x0 = ex(R.c0), x1 = ex(R.c1 + 1), z0 = ez(R.r0), z1 = ez(R.r1 + 1), m = (x0 + x1) / 2;
    carpet(m - 1.2, z0 + 0.6, m + 1.2, z1 - 0.6, 0.008, carpetMat);
  }
  L.rugs.forEach((R, i) => { onFloor(R.f); carpet(ex(R.c0), ez(R.r0), ex(R.c1 + 1), ez(R.r1 + 1), 0.016 + i * 0.001, rugMat); });

  // =====================================================================
  // the garden: stone walls, hedges, dead trees, the family plot, the well, lanterns, the night sky
  // =====================================================================
  onFloor(0);
  for (const R of mergeRects(byChar('Z'))) {
    rectBox(R, 0, 3.6, gardenStone);
    rectBox(R, 3.6, 3.75, gardenStone, false, -0.08);
  }
  for (const R of mergeRects(byChar('h'))) {
    rectBox(R, 0, 2.4, hedgeMat, true, 0.1);
    for (let k = 0; k < 4; k++) {                                     // lumpy top
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5 + rnd() * 0.3, 7, 5), hedgeMat);
      m.position.set(ex(R.c0) + rnd() * (ex(R.c1 + 1) - ex(R.c0)), 2.35, ez(R.r0) + rnd() * (ez(R.r1 + 1) - ez(R.r0)));
      m.scale.y = 0.5; add(m);
    }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = get(c, r), x = cx(c), z = cz(r);
    if (ch === 'T') {
      solid(x, 0, z, 0.6, 7, 0.6, null);
      const g = new THREE.Group(); g.position.set(x, 0, z);
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.32, 6.5, 8), barkMat, 0, 3.25, 0));
      for (let k = 0; k < 6; k++) {                                   // bare, crooked branches
        const len = 1.4 + rnd() * 2.2, a = rnd() * Math.PI * 2, y = 2.6 + rnd() * 3.2, tilt = 0.6 + rnd() * 0.6;
        const b = mesh(new THREE.CylinderGeometry(0.03, 0.09, len, 5), barkMat, Math.cos(a) * len * 0.4, y + len * 0.3, Math.sin(a) * len * 0.4);
        b.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); g.add(b);
      }
      bake(g);
    } else if (ch === 'G') {
      api.setTrim(true);
      box(x, 0, z, 0.8, 0.95, 0.22, gardenStone);
      api.setTrim(false);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.22, 16, 1, false, 0, Math.PI), gardenStone);
      top.rotation.set(Math.PI / 2, 0, Math.PI / 2); top.position.set(x, 0.95, z); top.rotation.z += (rnd() - 0.5) * 0.1; add(top);
      box(x, 0, z + 0.55, 0.9, 0.08, 1.0, soilMat, false);
    }
  }
  // grass tufts
  {
    const tuftTex = T((g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = ['#2a3a1a', '#3a4222', '#4a4426'][i % 3]; g.lineWidth = 2;
        const x = 8 + Math.random() * (w - 16); g.beginPath(); g.moveTo(x, h);
        g.quadraticCurveTo(x + (Math.random() - 0.5) * 20, h * 0.5, x + (Math.random() - 0.5) * 30, h * (0.05 + Math.random() * 0.4)); g.stroke();
      }
    }, 64, 64);
    const tuftMat = new THREE.MeshStandardMaterial({ map: tuftTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    for (let r = 1; r <= 17; r++) for (let c = 1; c < W - 1; c++) {
      if (get(c, r) !== 'y' || rnd() > 0.35) continue;
      for (let k = 0; k < 2; k++) {
        const p = mesh(new THREE.PlaneGeometry(0.6, 0.45), tuftMat, cx(c) + (rnd() - 0.5) * 1.2, 0.22, cz(r) + (rnd() - 0.5) * 1.2);
        p.rotation.y = k * Math.PI / 2 + rnd(); add(p);
      }
    }
  }
  // the well
  let wellIt = null;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (get(c, r) !== 'o') continue;
    const x = cx(c), z = cz(r);
    solid(x, 0, z, 1.5, 0.95, 1.5, null);
    const wellStone = gardenStone.clone(); wellStone.side = THREE.DoubleSide;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.95, 20, 1, true), wellStone); ring.position.set(x, 0.475, z); add(ring);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.08, 6, 24), gardenStone); lip.rotation.x = Math.PI / 2; lip.position.set(x, 0.95, z); add(lip);
    add(mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.02, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }), x, 0.6, z));     // it goes a long way down
    for (const s of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), darkWoodMat, x + s * 0.85, 0.95, z));
    const roof = new THREE.Group(); roof.position.set(x, 2.0, z);
    for (const s of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(2.0, 0.05, 0.85), darkWoodMat, 0, 0.18, s * 0.33); p.rotation.x = s * 0.5; roof.add(p); }
    bake(roof);
    // the winch: axle across the posts, rope down to a bucket, and an empty square socket where the crank goes
    const axle = new THREE.Group(); axle.position.set(x, 1.6, z); scene.add(axle);
    const drum = mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.55, 10), darkWoodMat); drum.rotation.z = Math.PI / 2; axle.add(drum);
    for (let k = 0; k < 5; k++) { const turn = mesh(new THREE.TorusGeometry(0.12, 0.018, 4, 12), ropeMat, -0.3 + k * 0.08, 0, 0); turn.rotation.y = Math.PI / 2; axle.add(turn); }
    const rope = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 5), ropeMat); scene.add(rope);
    // the bucket: wooden staves, two iron hoops, a dark wet inside, an iron handle arching over it.
    // Its origin is the top of the handle, where the rope ties on.
    const bucket = new THREE.Group(); scene.add(bucket);
    const staves = new THREE.MeshStandardMaterial({ color: lin(0x5a3a20), roughness: 0.85, side: THREE.DoubleSide });
    const wet = new THREE.MeshStandardMaterial({ color: lin(0x120c08), roughness: 0.4, side: THREE.BackSide });
    bucket.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 14, 1, true), staves, 0, -0.36, 0));
    bucket.add(mesh(new THREE.CylinderGeometry(0.195, 0.155, 0.335, 14, 1, true), wet, 0, -0.36, 0));
    bucket.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14), darkWoodMat, 0, -0.52, 0));
    for (const [y, r] of [[-0.24, 0.196], [-0.46, 0.168]]) bucket.add(mesh(new THREE.TorusGeometry(r, 0.012, 5, 18), ironMat, 0, y, 0).rotateX(Math.PI / 2));
    bucket.add(mesh(new THREE.TorusGeometry(0.2, 0.011, 5, 14, Math.PI), ironMat, 0, -0.2, 0));   // the handle
    const socket = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), ironMat, x + 0.95, 1.6, z); scene.add(socket);
    // the crank, put together from the three parts (hidden until you fit it)
    const crank = new THREE.Group(); crank.position.set(x + 0.98, 1.6, z); scene.add(crank);
    crank.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), ironMat, 0.03, 0, 0));
    crank.add(mesh(new THREE.BoxGeometry(0.04, 0.42, 0.05), ironMat, 0.08, -0.19, 0));
    const grip = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), darkWoodMat, 0.18, -0.38, 0); grip.rotation.z = Math.PI / 2; crank.add(grip);
    crank.visible = false;
    wellIt = api.addInteractable({
      type: 'well', focus: new THREE.Vector3(x + 0.95, 1.3, z), normal: null, reach: 2.6,
      x, z, axle, rope, bucket, crank, top: 1.6, deep: 6.5, depth: 1, wound: 0, fitted: false, raised: false,
    });
    // a small lantern on the well post
    const lantern = new THREE.PointLight(0xffb060, lit(0.7, 0.45, 0.25), 9, 2); lantern.position.set(x - 0.85, 2.1, z + 0.2); scene.add(lantern); api.addFlicker(lantern, []);
    add(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), brassMat, x - 0.85, 1.95, z + 0.2));
  }
  // lanterns along the garden paths + a cold glow from the moon
  for (const [c, r] of L.lanterns) {
    const x = cx(c), z = cz(r);
    add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6), ironMat, x, 0.9, z));
    add(mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), brassMat, x, 1.9, z));
    const dead = rnd() < 0.34 || LIT === 'dark';
    add(mesh(new THREE.SphereGeometry(0.05, 6, 4), dead ? deadBulbMat : bulbMat, x, 1.9, z));
    if (!dead) { const l = new THREE.PointLight(0xffb070, lit(0.6, 0.35, 0), 9, 2); l.position.set(x, 1.9, z); scene.add(l); if (rnd() < 0.5) api.addFlicker(l, []); }
  }
  for (const [c, r] of [[9, 7], [26, 7], [17.5, 13]]) {
    const moon = new THREE.PointLight(0x6f86b8, lit(0.45, 0.36, 0.26), 22, 1.4);
    moon.position.set(cx(c), 7, cz(r)); scene.add(moon);
  }
  {
    // the moon + stars, above the garden (never fogged)
    const mt = T((g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(230,236,255,1)'); grd.addColorStop(0.22, 'rgba(210,220,245,1)'); grd.addColorStop(0.3, 'rgba(140,160,210,0.35)'); grd.addColorStop(1, 'rgba(60,80,140,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }, 128, 128);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, fog: false, depthWrite: false, transparent: true }));
    moon.position.set(-30, 60, -110); moon.scale.set(30, 30, 1); scene.add(moon);
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.3, R = 140;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * R; pos[i * 3 + 1] = Math.sin(e) * R; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * R - 30;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9aa4b8, size: 0.6, fog: false, sizeAttenuation: true })));
  }

  // =====================================================================
  // lighting: chandeliers
  // =====================================================================
  let bulbsLeft = lit(99, 1, 0);           // basement bulbs that still work (dim: just one, dark: none)
  for (const [c, r, f, flick] of L.lights) {
    onFloor(f);
    if (f === 2) {
      if (bulbsLeft-- <= 0) {
        // a dead bulb on its cord
        add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7), sootMat, cx(c), BH - 0.35, cz(r)));
        add(mesh(new THREE.SphereGeometry(0.06, 8, 6), deadBulbMat, cx(c), BH - 0.7, cz(r)));
        continue;
      }
      // a bare bulb on a cord
      const x = cx(c), z = cz(r), y = BH - 0.7;
      add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7), sootMat, x, BH - 0.35, z));
      const bm = flick ? bulbMat.clone() : bulbMat;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bm); bulb.position.set(x, Y0 + y, z);
      if (flick) scene.add(bulb); else api.addStatic(bulb);
      const light = new THREE.PointLight(0xffc890, 0.85, 11, 2); light.position.set(x, Y0 + y - 0.05, z); scene.add(light);
      if (flick) api.addFlicker(light, [bm]);
      continue;
    }
    // dim: the chandeliers in the rooms are dead, only the halls keep (weaker) light. dark: all of them are dead.
    const inRoom = !zoneAt(Math.floor(c), Math.floor(r)).hall;
    const dead = rnd() < 0.3 || LIT === 'dark' || (LIT === 'dim' && inRoom);
    const flicker = !dead && (flick || rnd() < (LIT === 'dim' ? 0.7 : 0.4));
    const x = cx(c), z = cz(r), y = 4.2;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, CE - y), brassMat);
    chain.position.set(x, (CE + y) / 2, z); add(chain);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 24), brassMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z); add(ring);
    add(mesh(new THREE.SphereGeometry(0.11, 8, 6), brassMat, x, y, z));
    const myBulb = flicker ? bulbMat.clone() : bulbMat;
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2, bx = x + Math.cos(a) * 0.5, bz = z + Math.sin(a) * 0.5;
      add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14), plasterMat, bx, y + 0.08, bz));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), (dead || (k === 3 && !flicker)) ? deadBulbMat : myBulb);
      bulb.position.set(bx, Y0 + y + 0.19, bz);
      if (flicker) scene.add(bulb); else api.addStatic(bulb);
    }
    if (dead) continue;
    const light = new THREE.PointLight(0xffa860, lit(0.95, 0.5, 0), lit(13, 10, 13), 2);
    light.position.set(x, Y0 + y - 0.1, z);
    scene.add(light);
    if (flicker) api.addFlicker(light, [myBulb]);
  }

  // =====================================================================
  // wall decor: portraits + sconces; in the halls, shelves (standing, leaning, toppled)
  // =====================================================================
  function wallBox(run, t, off, y, w, h, d, material) {
    const n = run.coord + run.dir * off;
    return run.axis === 'z' ? box(t, y, n, w, h, d, material, false) : box(n, y, t, d, h, w, material, false);
  }
  for (const run of runs) {
    onFloor(run.f);
    if (run.cells.length < 3 || run.zone === OUTSIDE || run.zone.name === 'garden' || run.f === 2) continue;   // no portraits in the cellar
    for (let i = 1; i < run.cells.length - 1; i += 3) {
      const [c, r] = run.cells[i];
      const nb = get(c, r);
      if ('bwgDkSXBcuifFenrCKpdz'.includes(nb) || isWallish(nb) || '_Ovs '.includes(nb)) continue;
      const t = run.axis === 'z' ? cx(c) : cz(r);
      const yRot = run.axis === 'z' ? (run.dir > 0 ? 0 : Math.PI) : (run.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const inHall = zoneAt(c, r) === L.hall;
      if (inHall && nb === '.' && rnd() < 0.45 && shelfSlot(run, c, r, t)) continue;
      if (rnd() < 0.6) {
        const [w, h] = pick([[1.0, 1.3], [1.3, 0.95], [0.8, 1.05], [1.6, 1.15]]);
        const tilt = rnd() < 0.3 ? (rnd() - 0.5) * 0.14 : 0;
        const y = 2.4;
        const frame = run.axis === 'z'
          ? box(t, y - (h + 0.16) / 2, run.coord + run.dir * 0.035, w + 0.16, h + 0.16, 0.05, frameMat, false)
          : box(run.coord + run.dir * 0.035, y - (h + 0.16) / 2, t, 0.05, h + 0.16, w + 0.16, frameMat, false);
        if (run.axis === 'z') frame.rotation.z = tilt; else frame.rotation.x = tilt;
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pick(paintings));
        const n = run.coord + run.dir * 0.062;
        if (run.axis === 'z') pic.position.set(t, y, n); else pic.position.set(n, y, t);
        pic.rotation.set(0, yRot, tilt * (run.dir > 0 ? 1 : -1) * (run.axis === 'z' ? 1 : -1));
        add(pic);
      } else {
        const y = 2.2;
        wallBox(run, t, 0.02, y - 0.1, 0.12, 0.22, 0.04, brassMat);
        wallBox(run, t, 0.1, y + 0.02, 0.04, 0.04, 0.16, brassMat);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), rnd() < 0.3 ? bulbMat : deadBulbMat);
        const n = run.coord + run.dir * 0.18;
        if (run.axis === 'z') bulb.position.set(t, y + 0.12, n); else bulb.position.set(n, y + 0.12, t);
        add(bulb);
      }
    }
  }

  // =====================================================================
  // searchable chests of drawers (S) — the keys, medkits and notes are put in them by game.js
  // =====================================================================
  const drawerAt = {};
  for (const f of LEVELS) {
    onFloor(f);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (get(c, r) !== 'S') continue;
      const [dc, dr] = wallSide(c, r);
      const nx = -dc, nz = -dr;
      const SW = 1.1, SD = 0.55, SH = 0.9;
      const bx = cx(c) + dc * (HALF - SD / 2 - 0.02), bz = cz(r) + dr * (HALF - SD / 2 - 0.02);
      const alongX = dc === 0;
      const yaw = Math.atan2(nx, nz);
      box(bx, 0, bz, alongX ? SW : SD, SH, alongX ? SD : SW, null);
      api.lastCollider.noLedge = true;
      const LOW = 0.64, SLOT = 0.22;
      const body = new THREE.Group();
      body.position.set(bx, 0, bz); body.rotation.y = yaw;
      body.add(mesh(new THREE.BoxGeometry(SW, LOW, SD), faces(4, creamFront, creamSide, cavityMat), 0, LOW / 2, 0));
      body.add(mesh(new THREE.BoxGeometry(SW + 0.03, 0.035, SD + 0.02), creamSide, 0, LOW + SLOT + 0.0175, 0));
      for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.03, SLOT, SD), creamSide, s * (SW / 2 - 0.015), LOW + SLOT / 2, 0));
      body.add(mesh(new THREE.BoxGeometry(SW, SLOT, 0.03), cavityMat, 0, LOW + SLOT / 2, -SD / 2 + 0.015));
      bake(body);
      const TW = SW - 0.08, TD = SD - 0.05, TH = 0.17;
      const tray = new THREE.Group();
      tray.position.set(bx, Y0 + LOW + 0.005, bz); tray.rotation.y = yaw;
      tray.add(mesh(new THREE.BoxGeometry(SW - 0.04, SLOT - 0.02, 0.025), [creamSide, creamSide, creamSide, creamSide, drawerFace, creamSide], 0, (SLOT - 0.02) / 2, SD / 2 + 0.005));
      tray.add(mesh(new THREE.BoxGeometry(TW, 0.012, TD), cavityMat, 0, 0.006, SD / 2 - TD / 2));
      for (const s of [-1, 1]) tray.add(mesh(new THREE.BoxGeometry(0.014, TH, TD), creamSide, s * (TW / 2 - 0.007), TH / 2, SD / 2 - TD / 2));
      tray.add(mesh(new THREE.BoxGeometry(TW, TH, 0.014), creamSide, 0, TH / 2, SD / 2 - TD + 0.007));
      scene.add(tray);
      // a lit candle on top makes them easy to spot in the dark
      const tx = alongX ? 1 : 0, tz = alongX ? 0 : 1;
      const ox = bx - nx * 0.12 + tx * 0.36, oz = bz - nz * 0.12 + tz * 0.36;
      add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 8), plasterMat, ox, SH + 0.08, oz));
      add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 10), brassMat, ox, SH + 0.01, oz));
      add(mesh(new THREE.SphereGeometry(0.018, 6, 4), flameMat, ox, SH + 0.19, oz));
      const glow = new THREE.Sprite(candleGlow);
      glow.position.set(ox, Y0 + SH + 0.2, oz); glow.scale.set(0.5, 0.5, 0.5);
      scene.add(glow);
      const it = api.addInteractable({
        type: 'drawer', cell: [c, r], floor: f, y: Y0,
        room: (z => (z.bedroom ? (typeof z.bedroom === 'string' ? z.bedroom : z.name) : null))(zoneAt(c, r)),
        focus: new THREE.Vector3(bx + nx * 0.2, Y0 + 0.8, bz + nz * 0.2), normal: { x: nx, z: nz },
        group: tray, base: tray.position.clone(), slide: 0.42,
        area: { x0: -TW / 2 + 0.07, x1: TW / 2 - 0.07, z0: SD / 2 - 0.38, z1: SD / 2 - 0.07, y: 0.012 },
        topAt: new THREE.Vector3(bx - tx * 0.22, Y0 + SH + 0.02, bz - tz * 0.22),
        open: 0, searched: false, items: [],
      });
      drawerAt[f + ':' + c + ',' + r] = it;
    }
  }

  // =====================================================================
  // lockers (X) — hide inside, peek out through the slots
  // =====================================================================
  for (const f of LEVELS) {
    onFloor(f);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (get(c, r) !== 'X') continue;
      const [dc, dr] = wallSide(c, r);
      const nx = -dc, nz = -dr, tx = dr !== 0 ? 1 : 0, tz = dc !== 0 ? 1 : 0;
      const LW = 0.95, LD = 0.62, LH = 2.1;
      const bx = cx(c) + dc * (HALF - LD / 2 - 0.02), bz = cz(r) + dr * (HALF - LD / 2 - 0.02);
      const w = tx ? LW : LD, d = tx ? LD : LW;
      const lockerGroup = new THREE.Group();
      lockerGroup.position.set(bx + nx * LD / 2, Y0, bz + nz * LD / 2);
      scene.add(lockerGroup);
      const own = m => { if (m) { scene.remove(m); m.userData.static = false; m.position.sub(lockerGroup.position); lockerGroup.add(m); } return m; };
      own(solid(bx, 0, bz, w, LH, d, faces(faceIndex(nx, nz), lockerDark, lockerBody, lockerBody)));
      const collider = api.lastCollider;
      const ins = 0.03;
      own(box(bx - nx * (LD / 2 - ins), 0, bz - nz * (LD / 2 - ins), tx ? LW - 0.06 : 0.02, LH - 0.04, tx ? 0.02 : LW - 0.06, lockerDark, false));
      for (const s of [-1, 1]) own(box(bx + s * tx * (LW / 2 - ins), 0, bz + s * tz * (LW / 2 - ins), tx ? 0.02 : LD - 0.06, LH - 0.04, tx ? LD - 0.06 : 0.02, lockerDark, false));
      own(box(bx, LH - 0.06, bz, w - 0.06, 0.02, d - 0.06, lockerDark, false));
      const pivot = new THREE.Group();
      pivot.position.set(bx - tx * LW / 2 + nx * (LD / 2 + 0.018), Y0, bz - tz * LW / 2 + nz * (LD / 2 + 0.018)).sub(lockerGroup.position);
      const door = mesh(new THREE.BoxGeometry(tx ? LW - 0.03 : 0.03, LH - 0.06, tx ? 0.03 : LW - 0.03), lockerDoor, tx * (LW / 2), LH / 2, tz * (LW / 2));
      pivot.add(door);
      lockerGroup.add(pivot);
      api.addInteractable({
        type: 'locker', cell: [c, r], floor: f, y: Y0,
        focus: new THREE.Vector3(bx + nx * LD / 2, Y0 + 1.3, bz + nz * LD / 2), normal: { x: nx, z: nz },
        group: lockerGroup, collider, size: { w: LW, d: LD, h: LH }, along: { x: tx, z: tz },
        pivot, swing: tz * nx - tx * nz, open: 0,
        hideAt: { x: bx + nx * 0.06, z: bz + nz * 0.06 }, exitAt: { x: bx + nx * (LD / 2 + 0.6), z: bz + nz * (LD / 2 + 0.6) },
        yaw: Math.atan2(-nx, -nz),
      });
    }
  }

  // =====================================================================
  // the front door (E): chained shut with three padlocks, and a brass combination lock set into it.
  // =====================================================================
  onFloor(0);
  {
    const cols = []; for (let c = 0; c < W; c++) if (get(c, H - 1) === 'E') cols.push(c);
    const x0 = ex(cols[0]), x1 = ex(cols[cols.length - 1] + 1), xm = (x0 + x1) / 2, dw = x1 - x0;
    const z0 = ez(H - 1), z1 = ez(H), DH = 3.3;
    box(xm, DH, (z0 + z1) / 2, dw, STOREY - DH, CELL, coreMat);
    box(xm, DH, z0 - 0.01, dw, CE - DH, 0.02, wallMat('foyer'), false);
    for (const px of [x0, x1]) box(px, 0, z0 - 0.04, 0.22, DH + 0.1, 0.12, darkWoodMat, false);
    box(xm, DH, z0 - 0.04, dw + 0.22, 0.18, 0.12, darkWoodMat, false);
    const leaves = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side < 0 ? x0 : x1, 0, z0 + 0.3);
      pivot.add(mesh(new THREE.BoxGeometry(dw / 2 - 0.02, DH - 0.05, 0.09), doorMat, -side * (dw / 4), DH / 2, 0));
      pivot.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), brassMat, -side * (dw / 2 - 0.16), 1.15, -0.07));
      scene.add(pivot);
      leaves.push({ pivot, side });
    }
    box(xm, 0, z0 + 0.3, dw, DH, 0.3, null, true);
    const doorCollider = api.lastCollider; doorCollider.noLedge = true;
    // a heavy chain looped between the handles, held by three padlocks
    const chain = new THREE.Group();
    const linkGeo = new THREE.TorusGeometry(0.035, 0.009, 4, 10);
    for (let k = 0; k < 15; k++) {
      const t = k / 14, lx = xm - 0.3 + t * 0.6, ly = 1.15 - Math.sin(t * Math.PI) * 0.22;
      const link = mesh(linkGeo, ductMat, lx, ly, z0 + 0.2);
      link.rotation.set(0, k % 2 ? Math.PI / 2 : 0, 0.4 + t);
      chain.add(link);
    }
    scene.add(chain);
    const padlocks = [];
    for (const [k, t] of [[0, 0.22], [1, 0.5], [2, 0.78]].map(([k, t]) => [k, t])) {
      const lx = xm - 0.3 + t * 0.6, ly = 1.15 - Math.sin(t * Math.PI) * 0.22 - 0.1;
      const lock = new THREE.Group();
      lock.add(mesh(new THREE.BoxGeometry(0.12, 0.14, 0.05), brassMat, lx, ly, z0 + 0.19));
      lock.add(mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 12, Math.PI), ductMat, lx, ly + 0.07, z0 + 0.19));
      lock.add(mesh(new THREE.BoxGeometry(0.02, 0.04, 0.01), sootMat, lx, ly - 0.02, z0 + 0.163));
      scene.add(lock);
      padlocks.push(lock);
    }
    // the combination lock: four brass number wheels behind a little window, set into the right-hand leaf
    const kx = xm + dw / 4, ky = 1.45, kz = z0 + 0.24;
    const screen = document.createElement('canvas'); screen.width = 256; screen.height = 96;
    const screenTex = new THREE.CanvasTexture(screen); screenTex.encoding = THREE.sRGBEncoding;
    // fixed to the right-hand door leaf, so it swings open with it
    const leafR = leaves.find(l => l.side > 0).pivot;
    const plate = new THREE.Group(); plate.position.set(kx - leafR.position.x, ky, kz - leafR.position.z); leafR.add(plate);
    plate.add(mesh(new THREE.BoxGeometry(0.42, 0.24, 0.04), brassMat, 0, 0, 0));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: screenTex }));
    face.position.set(0, 0.01, -0.021); face.rotation.y = Math.PI; plate.add(face);
    const keyLight = new THREE.PointLight(0xffd9a0, 0.25, 1.6, 2); keyLight.position.set(0, 0.1, -0.4); plate.add(keyLight);
    // porch + moonlight outside
    box(xm, -0.5, z1 + 3, dw + 3, 0.5, 6, stoneMat);
    const moon = new THREE.PointLight(0x8fa8d8, lit(0.9, 0.6, 0.4), 14, 2);
    moon.position.set(xm, 3, z1 + 3);
    scene.add(moon);
    api.addInteractable({
      type: 'exit', focus: new THREE.Vector3(xm - 0.2, 1.05, z0 - 0.05), normal: { x: 0, z: -1 },
      leaves, chain, padlocks, collider: doorCollider, planeZ: z0 + 0.3, open: 0, unlocked: false,
    });
    api.addInteractable({
      type: 'keypad', focus: new THREE.Vector3(kx, ky, z0 - 0.05), normal: { x: 0, z: -1 },
      screen, screenTex, light: keyLight,
    });
  }

  // =====================================================================
  // clutter: dirt, papers, rubble, books, toppled chairs, cobwebs, a crashed chandelier
  // =====================================================================
  for (const f of LEVELS) {
    onFloor(f);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = get(c, r);
      if (isWallish(ch) || ' _OvEsdz'.includes(ch) || zoneAt(c, r).outdoor) continue;
      const x = cx(c), z = cz(r), hall = zoneAt(c, r).hall;
      if (rnd() < 0.22) {
        const s = 0.8 + rnd() * 1.6;
        const d = mesh(new THREE.PlaneGeometry(s, s), dirtMat, x + (rnd() - 0.5), 0.021, z + (rnd() - 0.5));
        d.rotation.set(-Math.PI / 2, 0, rnd() * 6); add(d);
      }
      if (ch !== '.') continue;
      const roll = rnd();
      if (roll < (hall ? 0.07 : 0.04)) papers(x, z, 2 + Math.floor(rnd() * 4), 1.2);
      else if (roll < (hall ? 0.11 : 0.06)) rubble(x, z, 3 + Math.floor(rnd() * 4), 1.0);
      else if (roll < (hall ? 0.14 : 0.08)) spillBooks(x, z, 2 + Math.floor(rnd() * 3), 1.0);
      else if (roll < (hall ? 0.15 : 0.085)) chair(x + (rnd() - 0.5) * 0.6, z + (rnd() - 0.5) * 0.6, rnd() * 6, true);
    }
    // cobwebs in doorway corners
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (get(c, r) !== 'D' || rnd() > 0.45) continue;
      const ax = passAxis(c, r);
      const sa = rnd() < 0.5 ? -1 : 1, sl = rnd() < 0.5 ? -1 : 1;
      const a = sa * (HALF - 0.12), l = sl * (HALF + 0.08);
      const [x, z] = ax === 'z' ? [cx(c) + a, cz(r) + l] : [cx(c) + l, cz(r) + a];
      cobweb(x, 2.6, z, (ax === 'z' ? 0 : Math.PI / 2) + (sa > 0 ? Math.PI / 2 : 0), 0.7, 0.3);
    }
  }
  // garden litter: fallen branches + dead leaves
  onFloor(0);
  for (let k = 0; k < 40; k++) {
    const c = 1 + Math.floor(rnd() * (W - 2)), r = 1 + Math.floor(rnd() * 17);
    if (get(c, r) !== 'y') continue;
    const b = mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.6 + rnd() * 1.2, 5), barkMat, cx(c) + (rnd() - 0.5), 0.04, cz(r) + (rnd() - 0.5));
    b.rotation.set(Math.PI / 2, 0, rnd() * 6); add(b);
  }
  // a chandelier that came down in the back hall
  {
    const x = cx(17.3), z = cz(26.5);
    const gr = new THREE.Group(); gr.position.set(x, 0, z);
    const ring = mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 24), brassMat, 0, 0.12, 0); ring.rotation.set(Math.PI / 2 + 0.25, 0, 0.1); gr.add(ring);
    const chain = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6), brassMat, 0.9, 0.03, 0.4); chain.rotation.set(0, 0.6, Math.PI / 2); gr.add(chain);
    for (let k = 0; k < 6; k++) { const cnd = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14), plasterMat, (rnd() - 0.5) * 2, 0.025, (rnd() - 0.5) * 2); cnd.rotation.set(Math.PI / 2, 0, rnd() * 6); gr.add(cnd); }
    for (let k = 0; k < 16; k++) { const s = 0.05 + rnd() * 0.1; const sh = mesh(new THREE.PlaneGeometry(s, s * 0.7), glassMat, (rnd() - 0.5) * 2.6, 0.025, (rnd() - 0.5) * 2.6); sh.rotation.set(-Math.PI / 2, 0, rnd() * 6); gr.add(sh); }
    bake(gr);
    rubble(x, z, 10, 2.2);
  }

  // =====================================================================
  // hand-off to the game: props you can throw, where the crank parts can be, spawn, layout
  // =====================================================================
  api.set('props', L.props.map(p => ({ type: p.type, x: cx(p.c), y: FL[p.f], z: cz(p.r), yaw: p.yaw, floor: p.f })));
  api.set('storey', STOREY);

  api.setTrim(prevTrim);
  api.setSpawn(cx(L.spawn.c), FL[L.spawn.f], cz(L.spawn.r), L.spawn.yaw);
  api.setLayout(L);
};
