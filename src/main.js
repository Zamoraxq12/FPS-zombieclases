// =============================================================================
//  OPERACIÓN EXTRACCIÓN · Sobrevive al apocalipsis
//  Punto de entrada: renderer, carga de GLB, bucle de juego y estados.
// =============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { createTextures } from './textures.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPON_LAYER } from './weapons.js';
import { ZombieManager } from './zombies.js';
import { PickupManager } from './pickups.js';
import { Effects } from './effects.js';
import { initAudio, SFX } from './audio.js';
import { Hud } from './hud.js';

window.__gameStarted = true; // Three.js cargó correctamente

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.autoClear = false;                       // se dibuja en dos pasadas (mundo + arma)
renderer.setClearColor(CONFIG.fogColor);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFar);

const camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.05, 200);
scene.add(camera);                                // necesario: el arma es hija de la cámara

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  // Resolución interna reducida -> píxeles grandes al escalar con CSS
  renderer.setSize(Math.floor(w / CONFIG.pixelScale), Math.floor(h / CONFIG.pixelScale), false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --------------------------------------------------------------- iluminación
const hemi = new THREE.HemisphereLight(0x9fb080, 0x283018, 2.6);
hemi.layers.enableAll();                          // ilumina mundo y arma
scene.add(hemi);
const weaponLight = new THREE.DirectionalLight(0xfff0d0, 2.2);
weaponLight.position.set(1, 2, 1);
weaponLight.layers.set(WEAPON_LAYER);             // solo ilumina el arma
camera.add(weaponLight);
// Linterna del jugador
const flashlight = new THREE.SpotLight(0xfff4d0, 30, 28, 0.42, 0.6, 1.4);
flashlight.position.set(0, 0, 0);
camera.add(flashlight);
camera.add(flashlight.target);
flashlight.target.position.set(0, 0, -1);

// ------------------------------------------------------------- carga de GLB
async function loadModels() {
  const paths = new Set([
    ...CONFIG.weapons.map((w) => w.model),
    ...Object.values(CONFIG.zombieTypes).map((z) => z.model),
    ...Object.values(CONFIG.pickups).map((p) => p.model),
  ]);
  const loader = new GLTFLoader();
  const text = document.getElementById('loading-text');
  const out = {};
  let done = 0;
  await Promise.all([...paths].map(async (path) => {
    // En la versión de "doble clic" (index.html) los GLB vienen incrustados en base64,
    // porque el navegador no permite leer archivos locales con file://
    const embedded = window.EMBEDDED_MODELS && window.EMBEDDED_MODELS[path];
    const gltf = embedded
      ? await loader.parseAsync(base64ToArrayBuffer(embedded), '')
      : await loader.loadAsync(path);
    // Material plano para reforzar el estilo retro
    gltf.scene.traverse((o) => {
      if (o.isMesh) { o.material.flatShading = true; o.material.metalness = Math.min(o.material.metalness, 0.2); }
    });
    out[path] = gltf.scene;
    text.textContent = `CARGANDO MODELOS GLB... ${++done}/${paths.size}`;
  }));
  return out;
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ------------------------------------------------------------------- juego
const hud = new Hud();
let state = 'loading';
let level, player, weapons, zombies, pickups, effects;
let elapsed = 0, clockT = 0;

async function init() {
  let models;
  try {
    models = await loadModels();
  } catch (err) {
    console.error(err);
    document.getElementById('loading-text').innerHTML =
      'ERROR AL CARGAR EL JUEGO.<br><br>Revisa tu conexión a internet<br>(Three.js se descarga al iniciar).';
    return;
  }

  level = new Level(scene, createTextures());
  effects = new Effects(scene);
  player = new Player(camera, level);
  weapons = new WeaponSystem(camera, {
    pistol: models[CONFIG.weapons[0].model].clone(true),
    plasma: models[CONFIG.weapons[1].model].clone(true),
  }, effects);
  zombies = new ZombieManager(scene, models, effects);
  pickups = new PickupManager(scene, models);

  resetGame();
  hud.show('start');
  state = 'ready';
}

function resetGame() {
  effects.clear();
  zombies.spawnFromLevel(level);
  pickups.spawnFromLevel(level);
  weapons.reset();
  player.reset(level.start);
  level.flowFrom = -1;
  elapsed = 0;
}

// ----------------------------------------------------------- pointer lock
function lockPointer() {
  initAudio();
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
}

function startPlaying() {
  if (state === 'gameover' || state === 'victory') resetGame();
  state = 'playing';
  hud.show('hud');
  lockPointer();
}

document.getElementById('btn-start').addEventListener('click', startPlaying);
document.getElementById('btn-resume').addEventListener('click', startPlaying);
document.getElementById('btn-retry').addEventListener('click', startPlaying);
document.getElementById('btn-again').addEventListener('click', startPlaying);
canvas.addEventListener('click', () => { if (state === 'playing' && !document.pointerLockElement) lockPointer(); });

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'playing') {
    state = 'paused';
    hud.show('pause');
  }
});

document.addEventListener('mousemove', (e) => {
  if (state === 'playing' && document.pointerLockElement === canvas) player.onMouseMove(e.movementX, e.movementY);
});

// RF01: cada evento mousedown = un único disparo (no hay disparo automático)
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || state !== 'playing' || document.pointerLockElement !== canvas) return;
  const result = weapons.fire(level.raycastMeshes, zombies.hitTargets());
  if (result === 'empty') hud.toast('¡SIN MUNICIÓN! BUSCA CAJAS DE MUNICIÓN', '#ff5050');
  if (result === 'hit' || result === 'kill') hud.hitMarker(result === 'kill');
});

window.addEventListener('keydown', (e) => {
  if (state === 'playing') {
    if (e.code === 'Digit1' || e.code === 'Numpad1') weapons.select(0);
    if (e.code === 'Digit2' || e.code === 'Numpad2') weapons.select(1);
  }
  if (e.code === 'KeyR' && (state === 'gameover' || state === 'victory')) startPlaying();
});

// ------------------------------------------------------------- fin partida
function gameOver() {
  state = 'gameover';                 // detiene la actualización del mundo
  SFX.gameOver();
  document.exitPointerLock();
  hud.endScreen('gameover', summary());
}

function victory() {
  state = 'victory';
  SFX.victory();
  document.exitPointerLock();
  hud.endScreen('victory', summary());
}

function summary() {
  const acc = weapons.stats.shots ? Math.round((weapons.stats.hits / weapons.stats.shots) * 100) : 0;
  return { time: elapsed, kills: zombies.killed, total: zombies.total, shots: weapons.stats.shots, accuracy: acc };
}

// ------------------------------------------------------------ bucle principal
const clock = new THREE.Clock();

function update(dt) {
  elapsed += dt;
  player.update(dt);
  weapons.update(dt, player, clockT);

  // Zombis: detección, persecución y contacto
  if (zombies.update(dt, player, level, clockT)) { gameOver(); return; }

  const msg = pickups.update(dt, clockT, player, weapons);
  if (msg) hud.toast(msg);

  // Zona de extracción
  const toExit = Math.hypot(player.position.x - level.exit.x, player.position.z - level.exit.z);
  if (toExit <= CONFIG.extractionRadius) { victory(); return; }

  hud.update({ player, weapons, zombies, level, toExit, elapsed });
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  clockT += dt;

  if (state === 'playing') update(dt);
  if (level) level.update(dt, clockT);
  if (effects) effects.update(dt);

  // Pasada 1: mundo.  Pasada 2: arma (con el depth limpio para que no atraviese paredes)
  renderer.clear();
  camera.layers.set(0);
  renderer.render(scene, camera);
  renderer.clearDepth();
  camera.layers.set(WEAPON_LAYER);
  renderer.render(scene, camera);
  camera.layers.set(0);
}

init();
frame();
