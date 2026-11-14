// =============================================================================
//  NIVEL: mapa, construcción del mundo 3D, colisiones y búsqueda de caminos
// =============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

// -----------------------------------------------------------------------------
//  MAPA DEL NIVEL (40 x 32 celdas, cada celda = 4 m  ->  160 x 128 m)
//
//   #  muro              .  suelo interior        ,  suelo exterior
//   x  cajas (obstáculo)  b  barriles (obstáculo)
//   S  inicio            E  zona de extracción
//   z  zombi soldado      r  zombi corredor        g  zombi gigante
//   a  caja de munición 9mm   p  celda de plasma   v  adrenalina (velocidad)
//
//  Recorrido: Búnker (A) -> Laboratorio (B) -> Oficinas (C) -> Patio norte (D1)
//             -> Patio sur (D2) -> Almacén (E) -> Helipuerto (F)
// -----------------------------------------------------------------------------
export const MAP = [
  '########################################',
  '#.....#............#.................a.#',
  '#.S...#..xx........#.....x...z.........#',
  '#.....#..x....z..........x..........r..#',
  '#......................................#',
  '#..a..#........xx..#....z........xx....#',
  '#.....#.....p....z.#...................#',
  '############.#################..########',
  '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
  '#,v,,,,,,,,,,,,##,,,z,,,,,,,,,b,,,,,,p,#',
  '#,,,,,bb,,,,,,,##,,,,,,,,,,r,,,,,,,,,,,#',
  '#,,,,,,,z,,,,,,##,,,,,b,,,,,,,,z,,,,g,,#',
  '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
  '#################################,,,,,,#',
  '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
  '#,,,,,,,,z,,,,,,,,,,,z,,###,,,,,,,b,,,,#',
  '#,,,,,,,,,,,b,,,,,,,,,,,###,,,z,,,,b,,,#',
  '#,,,,,,,,,,,,,,,,,,b,,,,###,,,,,,,,,,,,#',
  '#,,,,,,,,,,,,,,r,,,,a,,,,,,,,,,,,,,,,,,#',
  '####..##################################',
  '#.................z....................#',
  '#.......xx....xx....xx....xx...........#',
  '#.......xx....xx....xx....xx..z........#',
  '#.......xx....xx....xx....xx.......g...#',
  '#.a.........z..........................#',
  '#................p.....r...............#',
  '####################################..##',
  '##########################,,,,,,,,,,,a,#',
  '##########################,,,b,,g,,,,,,#',
  '##########################,,,z,,,,E,,,,#',
  '##########################,,,,,,z,,,b,,#',
  '########################################',
];

// Luces de ambiente (celda x, celda y, color)
const LIGHTS = [
  [3, 3, 0xd8ff9a], [12, 3, 0xb8ff70], [29, 3, 0xe0f090], [8, 10, 0x9fd0ff],
  [28, 10, 0x9fd0ff], [12, 16, 0xffb070], [31, 16, 0x9fd0ff], [10, 22, 0xd8ff9a],
  [28, 22, 0xff7050], [32, 28, 0x80ff90],
];

const SOLID_HALF = { '#': 2.0, 'x': 1.75, 'b': 1.0 }; // media anchura de colisión por tipo

export class Level {
  constructor(scene, textures) {
    this.scene = scene;
    this.tex = textures;
    this.C = CONFIG.cellSize;
    this.H = MAP.length;
    this.W = MAP[0].length;
    this.grid = MAP.map((row) => row.split(''));
    this.entities = [];          // zombis y objetos a crear por otros módulos
    this.raycastMeshes = [];     // geometría que bloquea los disparos
    this.flickerLights = [];
    this.flow = new Int32Array(this.W * this.H).fill(-1);
    this.flowFrom = -1;

    this.#parse();
    this.#build();
  }

  // ---------------------------------------------------------------- utilidades
  cellCenter(cx, cy) {
    return new THREE.Vector3(cx * this.C + this.C / 2, 0, cy * this.C + this.C / 2);
  }
  worldToCell(x, z) {
    return [Math.floor(x / this.C), Math.floor(z / this.C)];
  }
  charAt(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return '#';
    return this.grid[cy][cx];
  }
  isSolid(cx, cy) {
    return this.charAt(cx, cy) in SOLID_HALF;
  }
  isOutdoor(cx, cy) {
    return this.outdoor[cy * this.W + cx];
  }

  // ------------------------------------------------------------ lectura mapa
  #parse() {
    this.outdoor = new Array(this.W * this.H).fill(false);
    const floorChars = '.,';
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const ch = this.grid[y][x];
        if (ch === ',') this.outdoor[y * this.W + x] = true;
        if (!floorChars.includes(ch) && !(ch in SOLID_HALF)) {
          // Celda con entidad: se guarda y se reemplaza por suelo
          this.entities.push({ type: ch, cx: x, cy: y });
          if (ch === 'S') this.start = this.cellCenter(x, y);
          if (ch === 'E') this.exit = this.cellCenter(x, y);
        }
      }
    }
    // Las celdas con entidades heredan interior/exterior de sus vecinas
    for (const e of this.entities) {
      let out = 0, ins = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = this.charAt(e.cx + dx, e.cy + dy);
        if (c === ',') out++; else if (c !== '#') ins++;
      }
      this.outdoor[e.cy * this.W + e.cx] = out > ins;
      this.grid[e.cy][e.cx] = out > ins ? ',' : '.';
    }
    // Las barricadas sobre el patio también son exteriores
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const ch = this.grid[y][x];
      if (ch === 'x' || ch === 'b') {
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.charAt(x + dx, y + dy) === ',').length;
        this.outdoor[y * this.W + x] = n > 0;
      }
    }
  }

  // --------------------------------------------------------- construcción 3D
  #build() {
    const C = this.C, WH = CONFIG.wallHeight;
    const dummy = new THREE.Object3D();

    // Agrupar celdas por tipo para usar InstancedMesh (muy eficiente)
    const lists = { floor: [], asphalt: [], ceiling: [], wall: [], concrete: [], crate: [], barrel: [] };
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const ch = this.grid[y][x];
        const out = this.isOutdoor(x, y);
        if (ch === '#') {
          // Solo se dibujan los muros que tocan una celda transitable
          let touchesFloor = false, touchesOut = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const n = this.charAt(x + dx, y + dy);
            if (n !== '#') { touchesFloor = true; if (this.isOutdoor(x + dx, y + dy)) touchesOut = true; }
          }
          if (touchesFloor) (touchesOut ? lists.concrete : lists.wall).push([x, y]);
          continue;
        }
        (out ? lists.asphalt : lists.floor).push([x, y]);
        if (!out) lists.ceiling.push([x, y]);
        if (ch === 'x') lists.crate.push([x, y]);
        if (ch === 'b') lists.barrel.push([x, y]);
      }
    }

    const lambert = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
    const addInstanced = (geo, mat, cells, place, blocksShots) => {
      if (!cells.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
      cells.forEach(([x, y], i) => { place(dummy, x, y, i); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      if (blocksShots) this.raycastMeshes.push(mesh);
      return mesh;
    };

    // Suelos y techos
    const plane = new THREE.PlaneGeometry(C, C);
    plane.rotateX(-Math.PI / 2);
    const ceilGeo = plane.clone().rotateX(Math.PI);
    const placeFlat = (h) => (d, x, y) => { d.position.set(x * C + C / 2, h, y * C + C / 2); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); };
    addInstanced(plane, lambert(this.tex.floor), lists.floor, placeFlat(0), true);
    addInstanced(plane, lambert(this.tex.asphalt), lists.asphalt, placeFlat(0), true);
    addInstanced(ceilGeo, lambert(this.tex.ceiling), lists.ceiling, placeFlat(WH), true);

    // Muros (cubos de 4x4x4)
    const box = new THREE.BoxGeometry(C, WH, C);
    const placeWall = (d, x, y) => { d.position.set(x * C + C / 2, WH / 2, y * C + C / 2); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); };
    addInstanced(box, lambert(this.tex.wall), lists.wall, placeWall, true);
    addInstanced(box, lambert(this.tex.concrete), lists.concrete, placeWall, true);

    // Cajas apiladas (obstáculos)
    const crateGeo = new THREE.BoxGeometry(3.5, 2.2, 3.5);
    addInstanced(crateGeo, lambert(this.tex.crate), lists.crate, (d, x, y, i) => {
      d.position.set(x * C + C / 2, 1.1, y * C + C / 2); d.rotation.set(0, (i % 3) * 0.12, 0); d.scale.set(1, 1, 1);
    }, true);
    const topCrates = lists.crate.filter((_, i) => i % 2 === 0);
    addInstanced(new THREE.BoxGeometry(2.2, 1.6, 2.2), lambert(this.tex.crate), topCrates, (d, x, y, i) => {
      d.position.set(x * C + C / 2 + 0.3, 3.0, y * C + C / 2 - 0.2); d.rotation.set(0, 0.5 + i, 0); d.scale.set(1, 1, 1);
    }, true);

    // Barriles tóxicos (dos por celda)
    const barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.35, 10);
    const barrelCells = [];
    lists.barrel.forEach(([x, y]) => { barrelCells.push([x, y, -0.35, -0.3]); barrelCells.push([x, y, 0.4, 0.35]); });
    addInstanced(barrelGeo, lambert(this.tex.barrel, { emissive: 0x151800 }),
      barrelCells, (d, x, y, i) => {
        const c = barrelCells[i];
        d.position.set(x * C + C / 2 + c[2], 0.675, y * C + C / 2 + c[3]); d.rotation.set(0, i, 0); d.scale.set(1, 1, 1);
      }, true);

    // Iluminación
    for (const [cx, cy, color] of LIGHTS) {
      const p = this.cellCenter(cx, cy);
      const light = new THREE.PointLight(color, 45, 26, 1.6);
      light.position.set(p.x, WH - 0.6, p.z);
      this.scene.add(light);
      // Lámpara visible
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.3), new THREE.MeshBasicMaterial({ color }));
      lamp.position.set(p.x, WH - 0.06, p.z);
      if (!this.isOutdoor(cx, cy)) this.scene.add(lamp);
      this.flickerLights.push({ light, base: 45, seed: Math.random() * 100 });
    }

    this.#buildStart();
    this.#buildExtraction();
  }

  // Marca visual de la zona de inicio
  #buildStart() {
    const sign = makeTextSprite('ZONA DE INICIO', '#c8ff70');
    sign.position.set(this.start.x, 3.1, this.start.z - 1.5);
    this.scene.add(sign);
  }

  // Helipuerto + haz de luz de la zona de extracción
  #buildExtraction() {
    const e = this.exit;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(this.C * 2.2, this.C * 2.2),
      new THREE.MeshLambertMaterial({ map: this.tex.helipad }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(e.x, 0.02, e.z);
    this.scene.add(pad);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(CONFIG.extractionRadius, CONFIG.extractionRadius, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x50ff70, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    beam.position.set(e.x, 15, e.z);
    this.scene.add(beam);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(CONFIG.extractionRadius, 0.08, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0x80ff90 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(e.x, 0.3, e.z);
    this.scene.add(ring);

    const light = new THREE.PointLight(0x60ff80, 40, 20, 1.5);
    light.position.set(e.x, 3, e.z);
    this.scene.add(light);

    const sign = makeTextSprite('EXTRACCIÓN', '#80ff90');
    sign.position.set(e.x, 4.2, e.z);
    this.scene.add(sign);

    this.exitFx = { beam, ring, light };
  }

  update(dt, t) {
    // Parpadeo de luces (ambientación de horror)
    for (const f of this.flickerLights) {
      const n = Math.sin(t * 13 + f.seed) * Math.sin(t * 7.3 + f.seed * 2);
      f.light.intensity = n > 0.93 ? f.base * 0.15 : f.base;
    }
    const fx = this.exitFx;
    fx.ring.position.y = 0.3 + (Math.sin(t * 2) * 0.5 + 0.5) * 2.5;
    fx.beam.material.opacity = 0.14 + Math.sin(t * 3) * 0.05;
  }

  // ---------------------------------------------------------------------------
  //  COLISIONES: círculo (jugador / zombi) contra las celdas sólidas (AABB)
  //  Se empuja el círculo fuera de cada caja que intersecta.
  // ---------------------------------------------------------------------------
  resolveCollision(pos, radius) {
    const C = this.C;
    const [cx, cy] = this.worldToCell(pos.x, pos.z);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          const half = SOLID_HALF[this.charAt(x, y)];
          if (half === undefined) continue;
          const bx = x * C + C / 2, bz = y * C + C / 2;
          // Punto de la caja más cercano al centro del círculo
          const qx = THREE.MathUtils.clamp(pos.x, bx - half, bx + half);
          const qz = THREE.MathUtils.clamp(pos.z, bz - half, bz + half);
          let dx = pos.x - qx, dz = pos.z - qz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (radius - d);
            pos.z += (dz / d) * (radius - d);
          } else {
            // Centro dentro de la caja: sacar por el eje de menor penetración
            const px = half + radius - Math.abs(pos.x - bx);
            const pz = half + radius - Math.abs(pos.z - bz);
            if (px < pz) pos.x += Math.sign(pos.x - bx || 1) * px;
            else pos.z += Math.sign(pos.z - bz || 1) * pz;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  CAMPO DE FLUJO (BFS) hacia el jugador: cada celda guarda su distancia en
  //  pasos al jugador. Los zombis activos bajan por este "gradiente" para
  //  rodear muros y obstáculos en lugar de quedarse atascados.
  // ---------------------------------------------------------------------------
  updateFlowField(px, pz) {
    const [sx, sy] = this.worldToCell(px, pz);
    const start = sy * this.W + sx;
    if (start === this.flowFrom) return;
    this.flowFrom = start;
    const flow = this.flow.fill(-1);
    const queue = new Int32Array(this.W * this.H);
    let head = 0, tail = 0;
    flow[start] = 0; queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % this.W, y = (i / this.W) | 0;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (this.isSolid(nx, ny)) continue;
        if (dx && dy && (this.isSolid(x + dx, y) || this.isSolid(x, y + dy))) continue; // sin cortar esquinas
        const ni = ny * this.W + nx;
        if (flow[ni] !== -1) continue;
        flow[ni] = flow[i] + 1;
        queue[tail++] = ni;
      }
    }
  }

  /** Devuelve el centro de la celda vecina más cercana al jugador (o null). */
  nextStepToward(x, z) {
    const [cx, cy] = this.worldToCell(x, z);
    const here = this.flow[cy * this.W + cx];
    if (here <= 0) return null;
    let best = null, bestD = here;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx, ny = cy + dy;
      if (this.isSolid(nx, ny)) continue;
      if (dx && dy && (this.isSolid(cx + dx, cy) || this.isSolid(cx, cy + dy))) continue;
      const d = this.flow[ny * this.W + nx];
      if (d >= 0 && d < bestD) { bestD = d; best = [nx, ny]; }
    }
    return best ? this.cellCenter(best[0], best[1]) : null;
  }
}

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Cartel de texto como sprite (siempre mira a la cámara)
export function makeTextSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, 256, 48);
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false }));
  s.scale.set(3.2, 0.6, 1);
  return s;
}
