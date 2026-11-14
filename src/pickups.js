// =============================================================================
//  OBJETOS COLECCIONABLES: munición y adrenalina  (RF02, RF10)
// =============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SFX } from './audio.js';

export class PickupManager {
  constructor(scene, baseModels) {
    this.scene = scene;
    this.baseModels = baseModels;
    this.items = [];
  }

  spawnFromLevel(level) {
    this.clear();
    for (const e of level.entities) {
      const cfg = CONFIG.pickups[e.type];
      if (!cfg) continue;
      const root = new THREE.Group();
      const model = this.baseModels[cfg.model].clone(true);
      model.scale.setScalar(1.3);
      root.add(model);
      // Halo brillante para que el objeto se vea en la oscuridad
      // (sprite aditivo en vez de luz real: así no cambia el número de luces al recogerlo)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture(), color: cfg.kind === 'boost' ? 0x40a0ff : 0xffe070,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55,
      }));
      glow.scale.setScalar(2.2);
      glow.position.y = 0.6;
      root.add(glow);
      const p = level.cellCenter(e.cx, e.cy);
      root.position.copy(p);
      this.scene.add(root);
      this.items.push({ cfg, root, model, taken: false, seed: Math.random() * 10 });
    }
  }

  clear() {
    this.items.forEach((i) => this.scene.remove(i.root));
    this.items = [];
  }

  /**
   * Comprueba la distancia al jugador y aplica el efecto al recogerlo.
   * @returns {string|null} texto para mostrar en el HUD
   */
  update(dt, t, player, weapons) {
    let message = null;
    for (const it of this.items) {
      if (it.taken) continue;
      it.model.rotation.y += dt * 1.5;
      it.model.position.y = 0.25 + Math.sin(t * 2.5 + it.seed) * 0.12;
      const d = Math.hypot(player.position.x - it.root.position.x, player.position.z - it.root.position.z);
      if (d > CONFIG.pickupRadius) continue;

      it.taken = true;
      this.scene.remove(it.root);
      SFX.pickup();
      if (it.cfg.kind === 'ammo') {
        const wcfg = CONFIG.weapons.find((w) => w.id === it.cfg.weapon);
        weapons.addAmmo(it.cfg.weapon, wcfg.pickupAmmo);
        message = `+${wcfg.pickupAmmo} ${it.cfg.label}`;
      } else if (it.cfg.kind === 'boost') {
        player.boostTime = CONFIG.player.boostDuration;
        message = `${it.cfg.label} · ${CONFIG.player.boostDuration}s`;
      }
    }
    return message;
  }
}

let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  _halo = new THREE.CanvasTexture(c);
  return _halo;
}
