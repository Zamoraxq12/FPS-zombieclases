// =============================================================================
//  JUGADOR: cámara en primera persona + movimiento WASD + vista con mouse (RF06)
// =============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SFX } from './audio.js';

export class Player {
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;
    this.position = new THREE.Vector3();
    this.yaw = 0;          // rotación horizontal (eje Y)
    this.pitch = 0;        // rotación vertical (eje X)
    this.keys = new Set();
    this.boostTime = 0;
    this.moving = false;
    this.bobPhase = 0;
    this.stepTimer = 0;

    // El orden YXZ evita el "gimbal lock": primero gira en Y (yaw) y luego en X (pitch)
    camera.rotation.order = 'YXZ';

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  reset(start) {
    this.position.set(start.x, 0, start.z);
    this.yaw = -Math.PI / 2; // mirando hacia +X (la salida del búnker)
    this.pitch = 0;
    this.boostTime = 0;
    this.keys.clear();
    this.#applyCamera(0);
  }

  /** Orientación con el mouse (Pointer Lock entrega movementX / movementY). */
  onMouseMove(dx, dy) {
    const s = CONFIG.player.mouseSensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  update(dt) {
    const k = this.keys;
    // Entrada del teclado -> vector local (x = lateral, z = frontal)
    let ix = 0, iz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) iz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;

    this.moving = ix !== 0 || iz !== 0;
    if (this.boostTime > 0) this.boostTime -= dt;

    if (this.moving) {
      const len = Math.hypot(ix, iz);
      ix /= len; iz /= len;                       // la diagonal no es más rápida
      // Vectores "adelante" y "derecha" según el yaw de la cámara
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let speed = CONFIG.player.speed;
      if (this.boostTime > 0) speed *= CONFIG.player.boostMultiplier;
      this.position.x += (fx * iz + rx * ix) * speed * dt;
      this.position.z += (fz * iz + rz * ix) * speed * dt;
      // Colisión contra muros y obstáculos
      this.level.resolveCollision(this.position, CONFIG.player.radius);

      this.bobPhase += dt * speed * 1.9;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { SFX.step(); this.stepTimer = 1.9 / speed * 1.6; }
    }
    this.#applyCamera(dt);
  }

  #applyCamera() {
    const bob = this.moving ? Math.abs(Math.sin(this.bobPhase)) * 0.06 : 0;
    this.camera.position.set(this.position.x, CONFIG.player.height + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
