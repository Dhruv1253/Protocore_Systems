/* Protocore hero — 3D LT control panel with exploded → assembled reveal.
   Classic script: expects global THREE (three r128 UMD). Registers <panel-3d>. */
(function () {
  if (window.customElements.get('panel-3d')) return;

  const GREY = 0xc6cacd, GREY_D = 0xb4b9bd, INK = 0x14181d, DARK = 0x22272d;
  const ease = t => 1 - Math.pow(1 - t, 3);

  class Panel3D extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.style.minHeight = '420px';

      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:grab';
      this.appendChild(canvas);

      const ui = document.createElement('div');
      ui.style.cssText = 'position:absolute;left:0;bottom:0;display:flex;gap:10px;align-items:center;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;color:#8A949F';
      const btn = document.createElement('button');
      btn.textContent = 'EXPLODED VIEW';
      btn.style.cssText = 'background:rgba(255,255,255,.06);color:#F7F8FA;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:9px 16px;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;cursor:pointer;backdrop-filter:blur(6px)';
      const hint = document.createElement('span');
      hint.textContent = 'DRAG TO ROTATE';
      ui.appendChild(btn); ui.appendChild(hint);
      this.appendChild(ui);

      if (!window.THREE) { hint.textContent = '3D LIBRARY UNAVAILABLE'; return; }

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(8.4, 3.4, 11.6);
      camera.lookAt(0, 0.2, 0);

      scene.add(new THREE.HemisphereLight(0xdfe7ef, 0x0b0f14, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(5.5, 8, 6.5);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1; key.shadow.camera.far = 30;
      key.shadow.camera.left = -7; key.shadow.camera.right = 7;
      key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xd81324, 0.55);
      rim.position.set(-6, 2.5, -4);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0xbcd0e6, 0.3);
      fill.position.set(-4, 1, 7);
      scene.add(fill);

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.34 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2.95;
      floor.receiveShadow = true;
      scene.add(floor);

      const rig = new THREE.Group();
      scene.add(rig);
      const model = new THREE.Group();
      model.scale.setScalar(0.82);
      rig.add(model);

      const std = (color, rough, metal) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      const parts = [];
      function box(w, h, d, mat, x, y, z, ox, oy, oz) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.castShadow = true; m.receiveShadow = true;
        m.userData.home = m.position.clone();
        m.userData.off = new THREE.Vector3(ox || 0, oy || 0, oz || 0);
        model.add(m);
        parts.push(m);
        return m;
      }

      const matBody = std(GREY_D, 0.52, 0.35);
      const matDoor = std(GREY, 0.42, 0.4);
      const matInk = std(INK, 0.7, 0.2);
      const matDark = std(DARK, 0.6, 0.3);
      const matVfd = std(0xd8cfbb, 0.6, 0.15);
      const matPlate = std(0x9aa1a8, 0.45, 0.55);

      // shell + plinth
      box(4.4, 5.2, 1.7, matBody, 0, 0, -0.12, 0, 0, -2.6);
      box(4.5, 0.55, 1.8, matInk, 0, -2.62, -0.1, 0, -0.9, -2.6);

      // back mounting plate + internals (revealed when exploded)
      box(3.9, 4.5, 0.08, matPlate, 0, 0.1, -0.55, 0, 0, -1.2);
      for (let i = 0; i < 3; i++) {
        const x = -1.15 + i * 1.15;
        box(0.62, 1.0, 0.34, matVfd, x, 1.15, -0.3, x * 1.5, 1.5, 1.4);
      }
      for (let i = 0; i < 4; i++) {
        const x = -1.2 + i * 0.8;
        box(0.42, 0.5, 0.3, matDark, x, -0.35, -0.3, x * 1.6, -0.2, 2.0);
      }
      [0xb03a2a, 0xc8a415, 0x2f5da8].forEach((c, i) => {
        box(3.0, 0.1, 0.08, std(c, 0.35, 0.6), 0, -1.3 - i * 0.2, -0.32, 0, -1.6 - i * 0.25, 2.4);
      });

      // three doors
      for (let d = 0; d < 3; d++) {
        const cx = -1.42 + d * 1.42;
        const dz = 0.78;
        const spread = new THREE.Vector3(cx * 1.35, 0.08 * d, 2.4 + d * 0.3);
        const door = box(1.36, 4.7, 0.1, matDoor, cx, 0.05, dz, spread.x, spread.y, spread.z);
        const add = (w, h, dd, mat, ox, oy, oz) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat);
          m.position.set(ox, oy, oz);
          m.castShadow = true;
          door.add(m);
          return m;
        };
        if (d !== 1) add(0.5, 0.38, 0.03, matDark, -0.28, 1.85, 0.07);
        add(0.5, 0.38, 0.03, matDark, -0.28, -1.9, 0.07);
        add(0.1, 0.62, 0.07, matInk, 0.52, -0.35, 0.09);
        if (d === 1) {
          // Protocore badge, top of centre door
          const badge = add(0.98, 0.5, 0.03, new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.45, metalness: 0.1 }), 0, 1.95, 0.07);
          const tex = new THREE.TextureLoader().load('uploads/PC%20Logo.png');
          tex.encoding = THREE.sRGBEncoding;
          const decal = new THREE.Mesh(
            new THREE.PlaneGeometry(0.9, 0.42),
            new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0 })
          );
          decal.position.set(0, 0, 0.017);
          badge.add(decal);
          add(0.78, 0.56, 0.05, matInk, 0, 1.0, 0.08);
          const scr = add(0.64, 0.42, 0.02, new THREE.MeshStandardMaterial({ color: 0x0d2b44, emissive: 0x1b4c73, emissiveIntensity: 0.9, roughness: 0.3 }), 0, 1.0, 0.12);
          scr.castShadow = false;
          add(0.42, 0.2, 0.1, new THREE.MeshStandardMaterial({ color: 0xd81324, roughness: 0.4 }), 0, -1.1, 0.1);
        }
        const lamp = (lx, color) => {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 18),
            new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.35 }));
          m.rotation.x = Math.PI / 2;
          m.position.set(lx, 0.3, 0.1);
          door.add(m);
        };
        lamp(-0.3, 0x1f9d55); lamp(-0.1, 0xd81324); lamp(0.1, 0xd8a215);
      }

      // timeline
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let t = reduce ? 0 : 1, target = 0, hold = reduce ? 0 : 0.75, started = false;
      btn.addEventListener('click', () => {
        target = target > 0.5 ? 0 : 1;
        hold = 0;
        btn.textContent = target > 0.5 ? 'ASSEMBLED VIEW' : 'EXPLODED VIEW';
      });

      // drag
      let drag = false, px = 0, spin = -0.45, vel = 0;
      canvas.addEventListener('pointerdown', e => { drag = true; px = e.clientX; canvas.style.cursor = 'grabbing'; });
      addEventListener('pointerup', () => { drag = false; canvas.style.cursor = 'grab'; });
      addEventListener('pointermove', e => {
        if (!drag) return;
        vel = (e.clientX - px) * 0.006;
        spin += vel; px = e.clientX;
      });

      const resize = () => {
        const w = this.clientWidth || 640;
        const h = Math.max(this.clientHeight || 0, 420);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      new ResizeObserver(resize).observe(this);

      let last = performance.now();
      const tick = now => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (hold > 0) hold -= dt; else {
          const speed = 0.55;
          t += (target - t) * Math.min(1, dt / speed * 1.6);
          if (Math.abs(target - t) < 0.001) t = target;
        }
        const k = ease(Math.max(0, Math.min(1, t)));
        for (const p of parts) {
          p.position.copy(p.userData.home).addScaledVector(p.userData.off, k);
        }
        if (!drag) { vel *= 0.92; spin += vel + dt * 0.09; }
        rig.rotation.y = spin;
        rig.rotation.x = -0.04 + Math.sin(now / 4200) * 0.03;
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      started = true;
    }
  }

  window.customElements.define('panel-3d', Panel3D);
})();
