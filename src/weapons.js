// =============================================================================
//  SISTEMA DE ARMAS, MUNICIÓN Y DISPAROS  (RF01, RF02, RF07)
// =============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SFX } from './audio.js';

export const WEAPON_LAYER = 1; // capa de render propia para que el arma no atraviese muros

export class WeaponSystem {
  /**
   * @param camera   cámara del jugador (las armas se cuelgan de ella)
   * @param models   { pistol: THREE.Group, plasma: THREE.Group } cargados desde GLB
   */
  constructor(camera, models, effects) {
    this.camera = camera;
    this.effects = effects;
    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0); // centro de la pantalla = mira

    // El "holder" es HIJO de la cámara: hereda su posición y rotación,
    // así el arma acompaña siempre la vista del jugador.
    this.holder = new THREE.Group();
    camera.add(this.holder);

    // Destello de boca (sprite aditivo) y luz del disparo
    const flashTex = makeFlashTexture();
    this.weapons = CONFIG.weapons.map((cfg) => {
      const object = models[cfg.id];
      object.scale.setScalar(cfg.scale);
      object.position.fromArray(cfg.holdPosition);
      object.rotation.y = 0.04;
      object.visible = false;
      const muzzle = object.getObjectByName('Muzzle') || object;
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flashTex, color: cfg.flashColor, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      flash.scale.setScalar(cfg.id === 'plasma' ? 0.45 : 0.3);
      flash.visible = false;
      muzzle.add(flash);
      this.holder.add(object);
      object.traverse((o) => o.layers.set(WEAPON_LAYER));
      return { cfg, object, muzzle, flash, ammo: cfg.startAmmo };
    });

    this.flashLight = new THREE.PointLight(0xffd080, 0, 10, 2);
    this.flashLight.layers.enableAll();
    camera.add(this.flashLight);
    this.flashLight.position.set(0.2, -0.1, -0.8);

    this.current = 0;
    this.cooldown = 0;
    this.recoil = 0;
    this.flashTime = 0;
    this.switchState = null; // { to, t, phase }
    this.weapons[0].object.visible = true;
    this.stats = { shots: 0, hits: 0 };
  }

  get active() { return this.weapons[this.current]; }

  reset() {
    this.weapons.forEach((w, i) => { w.ammo = w.cfg.startAmmo; w.object.visible = i === 0; });
    this.current = 0; this.cooldown = 0; this.recoil = 0; this.switchState = null;
    this.stats = { shots: 0, hits: 0 };
  }

  // ------------------------------------------------------- cambio de arma (1/2)
  select(index) {
    if (index === this.current || index < 0 || index >= this.weapons.length) return;
    if (this.switchState) { this.switchState.to = index; return; }
    this.switchState = { to: index, t: 0, phase: 'down' };
    SFX.switchWeapon();
  }

  // -------------------------------------------------------- munición (RF02)
  /** Única forma de recuperar munición: recoger un objeto del escenario. */
  addAmmo(weaponId, amount) {
    const w = this.weapons.find((x) => x.cfg.id === weaponId);
    if (w) w.ammo += amount;
  }

  // ---------------------------------------------------------- disparo (RF07)
  /**
   * Se llama UNA vez por cada evento 'mousedown' -> un disparo por clic.
   * Mantener el botón presionado no genera más eventos, así que no hay modo automático.
   * @returns {string} 'fired' | 'hit' | 'kill' | 'empty' | 'busy'
   */
  fire(worldTargets, zombieTargets) {
    if (this.switchState || this.cooldown > 0) return 'busy';
    const w = this.active;
    if (w.ammo <= 0) { SFX.empty(); return 'empty'; }   // bloqueo con 0 balas

    w.ammo -= 1;                                          // cada disparo consume 1 bala
    this.stats.shots++;
    this.cooldown = w.cfg.cooldown;
    this.recoil = 1;
    this.flashTime = 0.06;
    w.flash.visible = true;
    w.flash.material.rotation = Math.random() * Math.PI;
    this.flashLight.color.setHex(w.cfg.flashColor);
    this.flashLight.intensity = 6;
    w.cfg.id === 'plasma' ? SFX.plasma() : SFX.pistol();

    // --- RAYCASTING desde el centro de la cámara
    this.raycaster.setFromCamera(this.center, this.camera);
    this.raycaster.far = w.cfg.range;
    const hits = this.raycaster.intersectObjects([...worldTargets, ...zombieTargets], true);
    const muzzlePos = new THREE.Vector3();
    w.muzzle.getWorldPosition(muzzlePos);

    let end, result = 'fired';
    const first = hits[0];
    if (first) {
      end = first.point;
      const zombie = findZombie(first.object);
      if (zombie) {
        // Impacto válido: el primer objeto atravesado por el rayo es un zombi
        this.stats.hits++;
        zombie.takeHit(first.point);
        result = zombie.alive ? 'hit' : 'kill';
      } else {
        const n = first.face ? first.face.normal.clone().transformDirection(first.object.matrixWorld) : null;
        this.effects.burst(first.point, w.cfg.id === 'plasma' ? 0x60ff70 : 0xffe080, 6, 2, n);
      }
    } else {
      end = this.raycaster.ray.at(w.cfg.range, new THREE.Vector3());
    }
    this.effects.tracer(muzzlePos, end, w.cfg.id === 'plasma' ? 0x50ff70 : 0xfff0a0);
    return result;
  }

  // ---------------------------------------------------------- animación arma
  update(dt, player, t) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Cambio de arma: baja el arma actual, cambia el modelo y sube la nueva
    let switchOffset = 0;
    const s = this.switchState;
    if (s) {
      s.t += dt / 0.16;
      if (s.phase === 'down') {
        switchOffset = s.t;
        if (s.t >= 1) {
          this.active.object.visible = false;
          this.current = s.to;
          this.active.object.visible = true;
          s.phase = 'up'; s.t = 0;
        }
      } else {
        switchOffset = 1 - s.t;
        if (s.t >= 1) this.switchState = null;
      }
    }

    // Balanceo al caminar + respiración + retroceso
    const w = this.active;
    const bob = player.moving ? player.bobPhase : 0;
    const base = w.cfg.holdPosition;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    w.object.position.set(
      base[0] + Math.sin(bob) * 0.015,
      base[1] - Math.abs(Math.cos(bob)) * 0.012 + Math.sin(t * 1.8) * 0.004 - Math.max(0, switchOffset) * 0.35,
      base[2] + this.recoil * 0.07,
    );
    w.object.rotation.x = this.recoil * 0.22;

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) { w.flash.visible = false; this.weapons.forEach((x) => (x.flash.visible = false)); }
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 80);
  }
}

function findZombie(obj) {
  while (obj) {
    if (obj.userData.zombie) return obj.userData.zombie;
    obj = obj.parent;
  }
  return null;
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(15, 0, 2, 32); ctx.fillRect(0, 15, 32, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
