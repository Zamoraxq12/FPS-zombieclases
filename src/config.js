// =============================================================================
//  CONFIGURACIÓN GENERAL DEL JUEGO
//  Todos los valores "de diseño" están aquí para poder ajustar la dificultad.
// =============================================================================
export const CONFIG = {
  // --- Render retro: se dibuja a baja resolución y se escala con píxeles duros
  pixelScale: 2.5,
  fov: 72,
  fogColor: 0x1d2a12,
  fogNear: 4,
  fogFar: 38,

  // --- Mundo
  cellSize: 4,          // cada carácter del mapa = celda de 4x4 metros
  wallHeight: 4,

  // --- Jugador
  player: {
    height: 1.65,       // altura de los ojos (cámara)
    radius: 0.4,        // radio de colisión
    speed: 4.6,         // m/s
    boostMultiplier: 1.6,
    boostDuration: 10,  // segundos
    mouseSensitivity: 0.0022,
  },

  // --- Armas (RF01 / RF02)
  weapons: [
    {
      id: 'pistol', name: 'PISTOLA 9MM', key: '1',
      model: 'assets/models/pistol.glb',
      startAmmo: 12,        // munición inicial
      pickupAmmo: 6,        // munición que da cada caja
      cooldown: 0.22,       // tiempo mínimo entre clics (no es automático)
      range: 60,
      flashColor: 0xffd27a,
      holdPosition: [0.22, -0.2, -0.42],
      scale: 1.25,
    },
    {
      id: 'plasma', name: 'RIFLE DE PLASMA', key: '2',
      model: 'assets/models/plasma_rifle.glb',
      startAmmo: 5,
      pickupAmmo: 3,
      cooldown: 0.45,
      range: 80,
      flashColor: 0x40ff60,
      holdPosition: [0.24, -0.25, -0.5],
      scale: 1.0,
    },
  ],

  // --- Zombis (RF05 / RF07 / RF11)
  zombieHealth: 2,              // cada zombi muere EXACTAMENTE con 2 impactos
  zombieTypes: {
    // detectRange: distancia (m) a la que el zombi se activa
    z: { name: 'Soldado',   model: 'assets/models/zombie_soldier.glb',   speed: 1.7, detectRange: 11, scale: 1.0,  radius: 0.4 },
    r: { name: 'Corredor',  model: 'assets/models/zombie_scientist.glb', speed: 3.9, detectRange: 14, scale: 0.95, radius: 0.35 },
    g: { name: 'Gigante',   model: 'assets/models/zombie_soldier.glb',   speed: 1.2, detectRange: 9,  scale: 1.45, radius: 0.6, tint: 0x9a7f6a },
  },
  catchDistance: 0.25,          // margen extra de contacto zombi-jugador

  // --- Objetos coleccionables (RF10)
  pickups: {
    a: { kind: 'ammo',   weapon: 'pistol', model: 'assets/models/ammo_box.glb',    label: 'MUNICIÓN 9MM' },
    p: { kind: 'ammo',   weapon: 'plasma', model: 'assets/models/plasma_cell.glb', label: 'CELDA DE PLASMA' },
    v: { kind: 'boost',                    model: 'assets/models/adrenaline.glb',  label: 'ADRENALINA (VELOCIDAD)' },
  },
  pickupRadius: 1.2,

  // --- Extracción
  extractionRadius: 2.6,
};
