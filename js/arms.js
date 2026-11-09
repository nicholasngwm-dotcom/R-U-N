// First-person arms: hidden normally, they reach out to plant on ledges when
// vaulting and grip hand-over-hand on ladders / vines.
const Arms = (function () {
  const arms = [];
  const shoulder = new THREE.Vector3();
  const target = new THREE.Vector3();

  function init(scene) {
    const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2b2824).convertSRGBToLinear(), roughness: 0.85 });
    const glove = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4a3b30).convertSRGBToLinear(), roughness: 0.7 });
    for (let i = 0; i < 2; i++) {
      // forearm: unit-length box along +z, stretched from shoulder to hand each frame
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 1).translate(0, 0, 0.5), sleeve);
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.036, 0.11), glove);
      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.03, 0.075), glove);
      fingers.position.set(0, -0.01, -0.085);
      fingers.rotation.x = -0.55; // curl over the edge
      hand.add(palm, fingers);
      hand.rotation.order = 'YXZ';
      fore.visible = hand.visible = false;
      scene.add(fore, hand);
      arms.push({ fore, hand, pos: new THREE.Vector3(), out: false, side: i === 0 ? -1 : 1 });
    }
  }

  function update(camera, player, dt) {
    camera.updateMatrixWorld();
    const t = player.handTargets();
    for (let i = 0; i < 2; i++) {
      const a = arms[i];
      camera.localToWorld(shoulder.set(a.side * 0.2, -0.32, -0.05));
      const tgt = t && t.list[i];
      if (tgt) {
        if (!a.out) a.pos.copy(shoulder);
        a.out = true;
        a.pos.lerp(target.set(tgt.x, tgt.y, tgt.z), 1 - Math.exp(-28 * dt));
      } else if (a.out) {
        a.pos.lerp(shoulder, 1 - Math.exp(-18 * dt));
        if (a.pos.distanceTo(shoulder) < 0.08) a.out = false;
      }
      a.fore.visible = a.hand.visible = a.out;
      if (!a.out) continue;
      a.fore.position.copy(shoulder);
      a.fore.lookAt(a.pos);
      a.fore.scale.z = Math.max(0.01, shoulder.distanceTo(a.pos));
      a.hand.position.copy(a.pos);
      // flat on a ledge, or upright gripping a ladder rung / vine
      a.hand.rotation.set(t && t.mode === 'climb' ? 1.35 : 0, player.yaw, 0);
    }
  }

  return { init, update };
})();
