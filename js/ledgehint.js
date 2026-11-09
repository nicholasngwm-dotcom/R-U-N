// Highlights the ledge you're facing and shows whether you can get over it:
//   pale  = VAULT / CLIMB      amber = CLIMB UP (slow)      red = TOO HIGH / NO ROOM
const LedgeHint = (function () {
  const COLORS = { vault: 0xe6dfc4, high: 0xe0922e, no: 0xc4362c, blocked: 0xc4362c };
  let line, mat, el;
  let opacity = 0;
  let time = 0;
  let lastKey = '';

  function init(scene, promptEl) {
    mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    line = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    line.visible = false;
    line.renderOrder = 2;
    scene.add(line);
    el = promptEl;
  }

  // put a glowing strip along the top edge of the face we're looking at
  function placeLine(info, player) {
    const b = info.ob.box;
    const ex = player.pos.x + info.fx * info.ob.tEnter;
    const ez = player.pos.z + info.fz * info.ob.tEnter;
    const T = 0.035, OUT = 0.015, y = b.max.y + 0.01;
    const nearMinX = Math.abs(ex - b.min.x) < 0.02, nearMaxX = Math.abs(ex - b.max.x) < 0.02;
    if (nearMinX || nearMaxX) {
      line.position.set(nearMinX ? b.min.x - OUT : b.max.x + OUT, y, (b.min.z + b.max.z) / 2);
      line.scale.set(T, T, b.max.z - b.min.z + 0.03);
    } else {
      const nearMinZ = Math.abs(ez - b.min.z) < Math.abs(ez - b.max.z);
      line.position.set((b.min.x + b.max.x) / 2, y, nearMinZ ? b.min.z - OUT : b.max.z + OUT);
      line.scale.set(b.max.x - b.min.x + 0.03, T, T);
    }
  }

  function label(info) {
    if (info.cls === 'vault') return info.kind === 'vault' ? 'VAULT' : 'CLIMB';
    if (info.cls === 'high') return 'CLIMB UP';
    if (info.cls === 'no') return 'TOO HIGH';
    return 'NO ROOM';
  }

  function update(player, dt, active) {
    time += dt;
    const info = active ? player.ledgeInfo() : null;
    opacity += ((info ? 1 : 0) - opacity) * (1 - Math.exp(-12 * dt));

    if (info) {
      placeLine(info, player);
      mat.color.setHex(COLORS[info.cls]);
      const canGo = info.cls === 'vault' || info.cls === 'high';
      const text = (canGo && info.inReach ? '[SPACE]  ' : '') + label(info);
      const key = text + info.cls + info.inReach;
      if (key !== lastKey) {        // only touch the DOM when something changes
        el.textContent = text;
        el.className = 'show ' + info.cls + (info.inReach ? ' reach' : '');
        lastKey = key;
      }
    } else if (lastKey) {
      el.className = '';
      lastKey = '';
    }

    mat.opacity = opacity * (0.55 + 0.25 * Math.sin(time * 5));
    line.visible = opacity > 0.02;
  }

  return { init, update };
})();
