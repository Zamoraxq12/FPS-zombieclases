// =============================================================================
//  ZOMBIS: modelos GLB, máquina de estados (inactivo -> persecución -> muerto),
//  impactos y animación procedural por nodos  (RF04, RF05, RF07)
// =============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SFX } from './audio.js';

const STATE = { IDLE: 'idle', CHASE: 'chase', DEAD: 'dead' };

export class Zombie {
  constructor(typeKey, model, position, effects) {
    this.type = typeKey;
    this.cfg = CONFIG.zombieTypes[typeKey];
    this.effects = effects;
    this.state = STATE.IDLE;
    this.hp = CONFIG.zombieHealth;          // 2 puntos de resistencia
    this.position = position.clone();
    this.heading = Math.random() * Math.PI * 2;
    this.phase = Math.random() * 10;
    this.groanTimer = 2 + Math.random() * 6;
    this.hitFlash = 0;
    this.stagger = 0;
    this.deathT = 0;

    // Contenedor -> modelo GLB clonado
    this.root = new THREE.Group();
    this.model = model;
    this.model.scale.setScalar(this.cfg.scale);
    this.root.add(this.model);
    this.root.userData.zombie = this;      // permite identificar el zombi desde el raycast

    // Cada zombi necesita SUS propios materiales para poder "parpadear" al recibir daño
    this.materials = [];
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (this.cfg.tint && o.material.emissive.getHex() === 0) o.material.color.setHex(this.cfg.tint);
        o.material.userData.baseEmissive = o.material.emissive.getHex();
        this.materials.push(o.material);
      }
    });

    // Nodos del GLB que se animan por código
    const n = (name) => this.model.getObjectByName(name);
    this.bones = { hips: n('Hips'), torso: n('Torso'), head: n('Head'), armL: n('ArmL'), armR: n('ArmR'), legL: n('LegL'), legR: n('LegR') };
    this.hipsY = this.bones.hips.position.y;

    this.#syncTransform();
  }

  get alive() { return this.state !== STATE.DEAD; }

  // ------------------------------------------------------------------ impactos
  /** Se llama solo cuando el raycast confirma un impacto válido sobre el zombi. */
  takeHit(point) {
    if (!this.alive) return;
    this.hp -= 1;                              // cada impacto válido resta 1
    this.hitFlash = 0.15;
    this.stagger = 0.25;
    this.effects.burst(point, 0x9a0a0a, 14, 3.2);
    SFX.hit();
    if (this.hp <= 0) this.#die();             // muere exactamente al 2.º impacto
  }

  #die() {
    this.state = STATE.DEAD;                   // deja de perseguir y de atacar
    this.deathT = 0;
    SFX.kill();
    this.effects.burst(this.position.clone().setY(1.2), 0x6a0808, 24, 4);
  }

  // ---------------------------------------------------------------- IA y anim.
  /**
   * @returns {boolean} true si el zombi atrapó al jugador
   */
  update(dt, player, level, t) {
    if (this.state === STATE.DEAD) { this.#animateDeath(dt); return false; }

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    // --- Estado INACTIVO: espera hasta que el jugador entre en su rango
    if (this.state === STATE.IDLE) {
      if (dist <= this.cfg.detectRange) {
        this.state = STATE.CHASE;              // ¡detectado!
        SFX.alert(volumeAt(dist));
      }
      this.#animateIdle(dt, t);
    }

    // --- Estado ACTIVO: persigue al jugador
    if (this.state === STATE.CHASE) {
      let tx = player.position.x, tz = player.position.z;
      // Si está lejos usa el campo de flujo (rodea paredes); si comparte celda o está
      // muy cerca, va en línea recta hacia el jugador
      const [zx, zy] = level.worldToCell(this.position.x, this.position.z);
      const [px, py] = level.worldToCell(player.position.x, player.position.z);
      if (dist > 2.2 && (zx !== px || zy !== py)) {
        const step = level.nextStepToward(this.position.x, this.position.z);
        if (step) { tx = step.x; tz = step.z; }
      }
      const mx = tx - this.position.x, mz = tz - this.position.z;
      const ml = Math.hypot(mx, mz) || 1;
      const speed = this.stagger > 0 ? this.cfg.speed * 0.25 : this.cfg.speed;
      this.position.x += (mx / ml) * speed * dt;
      this.position.z += (mz / ml) * speed * dt;
      level.resolveCollision(this.position, this.cfg.radius);

      // Girar suavemente hacia la dirección de avance
      const targetHeading = Math.atan2(mx, mz);
      let diff = targetHeading - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 8);

      this.#animateWalk(dt, speed);

      this.groanTimer -= dt;
      if (this.groanTimer <= 0) { SFX.groan(volumeAt(dist)); this.groanTimer = 3 + Math.random() * 5; }

      // --- Contacto con el jugador -> atrapado (Game Over)
      if (dist < this.cfg.radius + CONFIG.player.radius + CONFIG.catchDistance) return true;
    }

    // Parpadeo rojo al recibir un impacto
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    const flash = this.hitFlash > 0 ? 0.8 : 0;
    for (const m of this.materials) {
      if (flash) m.emissive.setRGB(flash, 0, 0); else m.emissive.setHex(m.userData.baseEmissive);
    }

    this.#syncTransform();
    return false;
  }

  #syncTransform() {
    this.root.position.set(this.position.x, 0, this.position.z);
    this.root.rotation.y = this.heading;
  }

  #animateIdle(dt, t) {
    const b = this.bones, p = t * 1.3 + this.phase;
    b.armL.rotation.x = Math.sin(p) * 0.08; b.armR.rotation.x = Math.sin(p + 1) * 0.08;
    b.armL.rotation.z = 0.12; b.armR.rotation.z = -0.12;
    b.head.rotation.z = Math.sin(p * 0.7) * 0.35;
    b.head.rotation.x = 0.35;
    b.torso.rotation.x = 0.15 + Math.sin(p) * 0.04;
    b.legL.rotation.x = b.legR.rotation.x = 0;
    this.heading += Math.sin(p * 0.3) * dt * 0.3;   // se balancea sin rumbo
  }

  #animateWalk(dt, speed) {
    const b = this.bones;
    this.phase += dt * speed * 3.2;
    const s = Math.sin(this.phase);
    b.legL.rotation.x = s * 0.6; b.legR.rotation.x = -s * 0.6;
    b.armL.rotation.x = -1.35 + Math.sin(this.phase * 0.5) * 0.15;   // brazos estirados
    b.armR.rotation.x = -1.45 - Math.sin(this.phase * 0.5) * 0.15;
    b.armL.rotation.z = b.armR.rotation.z = 0;
    b.torso.rotation.x = 0.22;
    b.torso.rotation.z = s * 0.08;
    b.head.rotation.z = Math.sin(this.phase * 0.5) * 0.2;
    b.head.rotation.x = -0.15;
    b.hips.position.y = this.hipsY + Math.abs(s) * 0.04;
  }

  #animateDeath(dt) {
    if (this.deathT >= 1) return;
    this.deathT = Math.min(1, this.deathT + dt * 1.8);
    const k = 1 - (1 - this.deathT) ** 3;                // ease-out
    this.model.rotation.x = -Math.PI / 2 * k;           // cae de espaldas
    this.model.position.y = 0.18 * k;
    this.bones.armL.rotation.x = -2.6 * k; this.bones.armR.rotation.x = -2.2 * k;
    this.bones.legL.rotation.x = 0.2 * k; this.bones.legR.rotation.x = -0.15 * k;
    for (const m of this.materials) m.emissive.setHex(0);  // se apagan los ojos
  }
}

function volumeAt(dist) { return Math.max(0.05, 1 - dist / 30); }

// =============================================================================
export class ZombieManager {
  constructor(scene, baseModels, effects) {
    this.scene = scene;
    this.baseModels = baseModels;     // { 'assets/models/x.glb': THREE.Group }
    this.effects = effects;
    this.zombies = [];
  }

  spawnFromLevel(level) {
    this.clear();
    for (const e of level.entities) {
      const cfg = CONFIG.zombieTypes[e.type];
      if (!cfg) continue;
      const model = this.baseModels[cfg.model].clone(true);
      const z = new Zombie(e.type, model, level.cellCenter(e.cx, e.cy), this.effects);
      this.scene.add(z.root);
      this.zombies.push(z);
    }
  }

  clear() {
    for (const z of this.zombies) {
      this.scene.remove(z.root);
      z.materials.forEach((m) => m.dispose());
    }
    this.zombies = [];
  }

  /** Objetos que el raycast de los disparos puede impactar (solo zombis vivos). */
  hitTargets() { return this.zombies.filter((z) => z.alive).map((z) => z.root); }

  get total() { return this.zombies.length; }
  get killed() { return this.zombies.filter((z) => !z.alive).length; }
  get chasing() { return this.zombies.filter((z) => z.state === STATE.CHASE).length; }

  nearestActiveDistance(player) {
    let best = Infinity;
    for (const z of this.zombies) {
      if (z.state !== STATE.CHASE) continue;
      best = Math.min(best, Math.hypot(z.position.x - player.position.x, z.position.z - player.position.z));
    }
    return best;
  }

  /** @returns {boolean} true si algún zombi atrapó al jugador */
  update(dt, player, level, t) {
    // El campo de flujo solo se recalcula cuando el jugador cambia de celda
    level.updateFlowField(player.position.x, player.position.z);
    let caught = false;
    for (const z of this.zombies) if (z.update(dt, player, level, t)) caught = true;

    // Separación simple para que no se amontonen en el mismo punto
    const alive = this.zombies.filter((z) => z.state === STATE.CHASE);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz), min = a.cfg.radius + b.cfg.radius;
        if (d > 0.0001 && d < min) {
          const push = (min - d) / 2;
          a.position.x -= (dx / d) * push; a.position.z -= (dz / d) * push;
          b.position.x += (dx / d) * push; b.position.z += (dz / d) * push;
        }
      }
    }
    return caught;
  }
}
