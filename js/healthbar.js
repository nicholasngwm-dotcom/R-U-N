// Health bar HUD: a rough, hand-inked frame with a heart and a red bar.
// Lost health gets scratched out with black ink scribble; at 0 the scribble swallows the heart too.
const HealthBar = (function () {
  const CW = 300, CH = 60, DPR = 2;          // css size, drawn at 2x for crisp ink
  const X0 = 56, X1 = 284, BY = 24, BH = 13; // the bar slot
  let canvas, g, shown = 100, target = 100, shake = 0, lastDrawn = -1;

  // seeded random so the same health always draws the same scribble (no flicker)
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  function roughRect(r, x0, y0, x1, y1, rad, jitter) {
    const pts = [], n = 64;
    const w = x1 - x0, h = y1 - y0;
    for (let i = 0; i < n; i++) {
      // walk around a rounded rect
      const a = (i / n) * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
      let x = x0 + w / 2 + Math.sign(cx) * Math.min(w / 2, Math.abs(cx) * (w / 2 + rad));
      let y = y0 + h / 2 + Math.sign(sy) * Math.min(h / 2, Math.abs(sy) * (h / 2 + rad));
      x += (r() - 0.5) * jitter; y += (r() - 0.5) * jitter;
      pts.push([x, y]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }
  function heartPath(x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.85);
    g.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.95, y - s * 0.95, x, y - s * 0.35);
    g.bezierCurveTo(x + s * 0.95, y - s * 0.95, x + s * 1.25, y + s * 0.05, x, y + s * 0.85);
    g.closePath();
  }
  // black ink scrawl from x a to b, spilling a little above and below the bar
  function scribble(r, a, b, top, bottom) {
    g.save();
    g.lineCap = g.lineJoin = 'round';
    const passes = Math.ceil((b - a) / 1.5);
    for (let k = 0; k < passes; k++) {
      g.strokeStyle = `rgba(4,4,4,${0.85 + r() * 0.15})`;
      g.lineWidth = 1.5 + r() * 4;
      g.beginPath();
      let x = a + r() * (b - a), y = top + r() * (bottom - top);
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x = Math.max(a - 3, Math.min(b + 3, x + (r() - 0.5) * 26));
        y = top + r() * (bottom - top);
        g.quadraticCurveTo(x + (r() - 0.5) * 12, (y + top + bottom) / 3, x, y);
      }
      g.stroke();
    }
    for (let k = 0; k < passes / 2; k++) {                                   // blots
      g.fillStyle = 'rgba(0,0,0,0.95)';
      g.beginPath(); g.ellipse(a + r() * (b - a), top + 3 + r() * (bottom - top - 6), 2 + r() * 5, 2 + r() * 4, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function draw(hp) {
    const r = rng(7);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, CW, CH);
    // frame: dark halo, dark body, rough light-grey ink outline
    roughRect(r, 7, 11, CW - 7, CH - 11, 9, 3.4);
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.stroke();
    g.fillStyle = '#161616'; g.fill();
    g.lineWidth = 2.8; g.strokeStyle = '#a9aeb3'; g.stroke();
    roughRect(r, 10, 14, CW - 10, CH - 14, 7, 1.6);
    g.lineWidth = 1; g.strokeStyle = 'rgba(200,205,210,0.25)'; g.stroke();

    // heart
    heartPath(32, 30, 13);
    const hg = g.createLinearGradient(20, 18, 44, 42);
    hg.addColorStop(0, '#e2353a'); hg.addColorStop(1, '#8b0d12');
    g.fillStyle = hg; g.fill();
    g.lineWidth = 2.6; g.strokeStyle = '#1b0707'; g.stroke();
    g.fillStyle = 'rgba(255,220,220,0.55)';
    g.beginPath(); g.ellipse(26, 25, 3, 1.8, -0.6, 0, Math.PI * 2); g.fill();

    // bar slot + red fill
    g.fillStyle = '#2b0b0c'; g.fillRect(X0, BY, X1 - X0, BH);
    const fillW = (X1 - X0) * Math.max(0, Math.min(1, hp / 100));
    const bg = g.createLinearGradient(0, BY, 0, BY + BH);
    bg.addColorStop(0, '#e32a2f'); bg.addColorStop(0.55, '#c3151c'); bg.addColorStop(1, '#7d0a0f');
    g.fillStyle = bg; g.fillRect(X0, BY, fillW, BH);
    g.fillStyle = 'rgba(255,140,140,0.5)'; g.fillRect(X0, BY + 2, fillW, 1.5);
    g.lineWidth = 1.6; g.strokeStyle = '#120404'; g.strokeRect(X0, BY, X1 - X0, BH);

    // scratch out what's been lost (seeded per 25 hp chunk, so each hit adds new scribble)
    if (hp < 100) {
      const r2 = rng(1000 + Math.round(hp));
      const start = X0 + fillW - 3;
      scribble(r2, start, X1 + 10, 9, CH - 9);                       // spills over the frame, like ink
      if (hp <= 0) scribble(r2, 12, X0 + 6, 13, CH - 13);            // dead: the heart goes too
    }
  }

  function init(container) {
    canvas = document.createElement('canvas');
    canvas.id = 'healthbar';
    canvas.width = CW * DPR; canvas.height = CH * DPR;
    canvas.style.width = CW + 'px'; canvas.style.height = CH + 'px';
    g = canvas.getContext('2d');
    container.appendChild(canvas);
    draw(100);
  }
  function set(hp, hurt) {
    target = Math.max(0, Math.min(100, hp));
    if (hurt) shake = 0.45;
  }
  function update(dt) {
    if (!canvas) return;
    shown += (target - shown) * Math.min(1, dt * 9);
    if (Math.abs(shown - target) < 0.3) shown = target;
    const q = Math.round(shown);
    if (q !== lastDrawn) { draw(q); lastDrawn = q; }
    shake = Math.max(0, shake - dt);
    const s = shake * 14;
    canvas.style.transform = s > 0 ? `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)` : '';
    canvas.classList.toggle('low', target > 0 && target <= 25);
  }
  return { init, set, update };
})();
