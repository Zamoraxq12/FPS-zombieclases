// =============================================================================
//  EFECTOS: partículas de impacto, sangre y trazadoras de los disparos
// =============================================================================
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.tracers = [];
    this.geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.mats = new Map();
  }

  #mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.mats.get(color);
  }

  burst(pos, color, count = 10, speed = 3, normal = null) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, this.#mat(color));
      m.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      if (normal) v.addScaledVector(normal, speed * 0.6);
      this.scene.add(m);
      this.particles.push({ m, v, life: 0.4 + Math.random() * 0.4 });
    }
  }

  tracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, fog: false });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.v.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.03) { p.m.position.y = 0.03; p.v.set(0, 0, 0); }
      if (p.life <= 0) { this.scene.remove(p.m); this.particles.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12);
      if (t.life <= 0) {
        this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  clear() {
    this.particles.forEach((p) => this.scene.remove(p.m));
    this.tracers.forEach((t) => this.scene.remove(t.line));
    this.particles.length = 0; this.tracers.length = 0;
  }
}
