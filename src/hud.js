// =============================================================================
//  HUD y pantallas (munición, armas, objetivo, Game Over, Victoria)
// =============================================================================
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'start', 'pause', 'gameover', 'victory'];

export class Hud {
  constructor() {
    this.slots = [...document.querySelectorAll('.slot')];
    this.slots.forEach((s, i) => { s.querySelector('.wname').textContent = CONFIG.weapons[i].name; });
    this.toastTimer = null;
  }

  /** Muestra una pantalla ('start', 'pause', ...) o el HUD de juego ('hud'). */
  show(name) {
    SCREENS.forEach((s) => $(s).classList.toggle('hidden', s !== name));
    $('hud').classList.toggle('hidden', name !== 'hud');
  }

  toast(text, color = '#ffe070') {
    const t = $('toast');
    t.textContent = text;
    t.style.color = color;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /** Marca de impacto en la mira (rojo al acertar a un zombi). */
  hitMarker(kill) {
    const c = $('crosshair');
    c.classList.add('hit');
    if (kill) this.toast('INFECTADO ELIMINADO', '#ff6060');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => c.classList.remove('hit'), 120);
  }

  update({ player, weapons, zombies, level, toExit, elapsed }) {
    // Munición del arma seleccionada (RF02)
    const w = weapons.active;
    $('ammo-name').textContent = w.cfg.name;
    $('ammo-count').textContent = w.ammo;
    $('ammo-count').classList.toggle('empty', w.ammo === 0);
    weapons.weapons.forEach((x, i) => {
      this.slots[i].classList.toggle('active', i === weapons.current);
      this.slots[i].classList.toggle('empty', x.ammo === 0);
      this.slots[i].querySelector('.wammo').textContent = x.ammo;
    });

    $('kills').textContent = zombies.killed;
    $('total').textContent = zombies.total;
    $('distance').textContent = Math.round(toExit);
    $('time').textContent = formatTime(elapsed);

    // Objetivo según la zona del mapa
    const [, cy] = level.worldToCell(player.position.x, player.position.z);
    let obj;
    if (cy <= 7) obj = 'OBJETIVO: CRUZA EL LABORATORIO Y SAL AL PATIO';
    else if (cy <= 12) obj = 'OBJETIVO: RODEA EL MURO DEL PATIO POR EL ESTE';
    else if (cy <= 18) obj = 'OBJETIVO: BUSCA LA ENTRADA AL ALMACÉN (SUROESTE)';
    else if (cy <= 25) obj = 'OBJETIVO: CRUZA EL ALMACÉN HACIA EL HELIPUERTO (SURESTE)';
    else obj = '¡OBJETIVO: ENTRA EN EL HAZ VERDE DE EXTRACCIÓN!';
    $('objective').textContent = obj;

    // Adrenalina
    $('boost').classList.toggle('hidden', player.boostTime <= 0);
    $('boost-time').textContent = Math.max(0, Math.ceil(player.boostTime));

    // Viñeta roja cuando un zombi activo está cerca
    const near = zombies.nearestActiveDistance(player);
    $('danger').style.opacity = near < 7 ? (1 - near / 7).toFixed(2) : 0;
  }

  endScreen(kind, s) {
    this.show(kind);
    const html = `TIEMPO: ${formatTime(s.time)}<br>ZOMBIS ELIMINADOS: ${s.kills}/${s.total}<br>` +
      `DISPAROS: ${s.shots} · PRECISIÓN: ${s.accuracy}%`;
    $(kind === 'victory' ? 'victory-stats' : 'gameover-stats').innerHTML = html;
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
