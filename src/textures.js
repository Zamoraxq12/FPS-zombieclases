// =============================================================================
//  TEXTURAS PROCEDURALES "PIXEL ART"
//  Se dibujan en un <canvas> de 32x32 y se usan con filtro Nearest
//  para conseguir el look de los shooters de 1997-2000.
// =============================================================================
import * as THREE from 'three';

// Generador pseudoaleatorio con semilla (para que las texturas sean siempre iguales)
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeTexture(size, seed, painter) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  painter(ctx, size, rng(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function noise(ctx, s, r, base, vary) {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const k = (r() - 0.5) * vary;
    ctx.fillStyle = `rgb(${base[0] + k},${base[1] + k},${base[2] + k * 0.6})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

export function createTextures() {
  return {
    // Paredes de tablones verde-oliva (como la captura de referencia)
    wall: makeTexture(32, 1, (ctx, s, r) => {
      noise(ctx, s, r, [118, 112, 38], 40);
      for (let y = 0; y < s; y += 6) {
        ctx.fillStyle = 'rgba(20,18,5,0.85)';
        ctx.fillRect(0, y, s, 1);
        ctx.fillStyle = 'rgba(200,190,90,0.25)';
        ctx.fillRect(0, y + 1, s, 1);
      }
      for (let i = 0; i < 18; i++) {           // manchas
        ctx.fillStyle = `rgba(40,35,10,${0.2 + r() * 0.3})`;
        ctx.fillRect((r() * s) | 0, (r() * s) | 0, 2, 1);
      }
    }),
    // Paredes exteriores de hormigón
    concrete: makeTexture(32, 2, (ctx, s, r) => {
      noise(ctx, s, r, [92, 96, 84], 34);
      ctx.fillStyle = 'rgba(30,30,25,0.6)';
      ctx.fillRect(0, 15, s, 1); ctx.fillRect(15, 0, 1, 15); ctx.fillRect(7, 16, 1, 16); ctx.fillRect(25, 16, 1, 16);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(120,10,10,0.5)'; ctx.fillRect((r() * s) | 0, 20 + ((r() * 10) | 0), 1, 3); }
    }),
    // Suelo interior de baldosas verdosas
    floor: makeTexture(32, 3, (ctx, s, r) => {
      noise(ctx, s, r, [74, 104, 78], 26);
      ctx.fillStyle = 'rgba(25,40,25,0.7)';
      ctx.fillRect(0, 0, s, 1); ctx.fillRect(0, 0, 1, s); ctx.fillRect(0, 16, s, 1); ctx.fillRect(16, 0, 1, s);
      if (r() > 0.3) { ctx.fillStyle = 'rgba(110,10,10,0.55)'; ctx.fillRect(20, 22, 3, 2); ctx.fillRect(22, 24, 1, 1); }
    }),
    // Asfalto exterior
    asphalt: makeTexture(32, 4, (ctx, s, r) => {
      noise(ctx, s, r, [52, 56, 48], 30);
      ctx.fillStyle = 'rgba(15,15,12,0.6)';
      for (let i = 0; i < 4; i++) ctx.fillRect((r() * s) | 0, (r() * s) | 0, 4, 1);
    }),
    // Techo con vigas
    ceiling: makeTexture(32, 5, (ctx, s, r) => {
      noise(ctx, s, r, [70, 68, 30], 28);
      ctx.fillStyle = 'rgba(25,25,10,0.9)';
      ctx.fillRect(0, 13, s, 6);
      ctx.fillStyle = 'rgba(110,110,60,0.6)';
      ctx.fillRect(0, 13, s, 1);
    }),
    // Cajas de madera
    crate: makeTexture(32, 6, (ctx, s, r) => {
      noise(ctx, s, r, [120, 86, 44], 30);
      ctx.fillStyle = '#3a2810';
      ctx.fillRect(0, 0, s, 2); ctx.fillRect(0, s - 2, s, 2); ctx.fillRect(0, 0, 2, s); ctx.fillRect(s - 2, 0, 2, s);
      for (let i = 0; i < s; i++) { ctx.fillRect(i, i, 2, 1); }
    }),
    // Barriles tóxicos
    barrel: makeTexture(32, 7, (ctx, s, r) => {
      noise(ctx, s, r, [150, 140, 30], 30);
      ctx.fillStyle = '#2a2a10'; ctx.fillRect(0, 4, s, 2); ctx.fillRect(0, 26, s, 2);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(16, 16, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#c8c020'; ctx.fillRect(15, 12, 2, 8);
    }),
    // Helipuerto de extracción
    helipad: makeTexture(64, 8, (ctx, s, r) => {
      noise(ctx, s, r, [60, 64, 58], 20);
      ctx.strokeStyle = '#e8e030'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(32, 32, 27, 0, 7); ctx.stroke();
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(20, 18, 5, 28); ctx.fillRect(39, 18, 5, 28); ctx.fillRect(20, 29, 24, 5);
    }),
  };
}
