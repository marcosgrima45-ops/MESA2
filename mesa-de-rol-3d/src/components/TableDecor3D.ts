import * as THREE from 'three';
import { TableSurface } from '../types';
import wax1Url from '../assets/wax_1.webp';
import wax2Url from '../assets/wax_2.webp';
import candleFlameUrl from '../assets/candle_flame.webp';

export interface TableEnvironmentController {
  group: THREE.Group;
  updateSurface: (surface: TableSurface) => void;
  updateAnimation: (elapsedTime: number, camera?: THREE.Camera) => void;
  dispose: () => void;
}

interface RealisticCandleRig {
  worldX: number;
  worldZ: number;
  billboard: THREE.Mesh;
  bodyMaterial: THREE.ShaderMaterial;
  flameMaterial: THREE.ShaderMaterial;
  haloSprite: THREE.Sprite;
  tableGlowMat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  baseIntensity: number;
  baseLightPos: THREE.Vector3;
  phase: number;
}

function drawStarPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  points: number,
  outerR: number,
  innerR: number,
  rotation = -Math.PI / 2
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotation + (i * Math.PI) / points;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function drawRealisticMoon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  phaseIndex: number,
  rimColor: string
) {
  const pad = Math.ceil(radius * 0.65);
  const imgSize = Math.ceil((radius + pad) * 2);
  const half = imgSize / 2;
  const offCanvas = document.createElement('canvas');
  offCanvas.width = imgSize;
  offCanvas.height = imgSize;
  const offCtx = offCanvas.getContext('2d')!;
  const imgData = offCtx.createImageData(imgSize, imgSize);
  const data = imgData.data;

  // Map 8 indices around the ring to realistic lunar illumination angles (from Full -> Waning -> New -> Waxing)
  // phaseAngle = 0 -> Full Moon (sun behind viewer +Z), PI -> New Moon (sun behind moon -Z)
  const phaseAngle = (phaseIndex / 8) * Math.PI * 2;
  const sunX = Math.sin(phaseAngle);
  const sunY = 0.14;
  const sunZ = Math.cos(phaseAngle);
  const sunLen = Math.hypot(sunX, sunY, sunZ) || 1;
  const sx = sunX / sunLen;
  const sy = sunY / sunLen;
  const sz = sunZ / sunLen;

  // Deterministic crater catalog (normalized on sphere disk)
  const craters = [
    { x: -0.34, y: 0.42, r: 0.16, depth: 0.28 }, // Tycho-like bright highland crater
    { x: -0.18, y: -0.22, r: 0.14, depth: 0.25 }, // Copernicus-like
    { x: 0.28, y: 0.12, r: 0.12, depth: 0.22 },
    { x: 0.44, y: -0.28, r: 0.11, depth: 0.2 },
    { x: -0.52, y: -0.05, r: 0.1, depth: 0.19 },
    { x: 0.08, y: 0.52, r: 0.09, depth: 0.18 },
    { x: -0.06, y: -0.56, r: 0.11, depth: 0.2 },
    { x: 0.56, y: 0.28, r: 0.085, depth: 0.17 },
    { x: -0.24, y: 0.12, r: 0.075, depth: 0.16 },
    { x: 0.18, y: -0.38, r: 0.08, depth: 0.18 },
    { x: -0.46, y: -0.38, r: 0.07, depth: 0.16 },
    { x: 0.36, y: 0.44, r: 0.075, depth: 0.15 },
  ];

  const seedShift = phaseIndex * 0.65;

  for (let py = 0; py < imgSize; py++) {
    for (let px = 0; px < imgSize; px++) {
      const dx = px + 0.5 - half;
      const dy = py + 0.5 - half;
      const dist = Math.hypot(dx, dy);

      if (dist > radius + 1.2) continue;

      const idx = (py * imgSize + px) * 4;
      const edgeAA = 1 - smoothstep(radius - 0.9, radius + 0.8, dist);
      if (edgeAA <= 0) continue;

      const nx = Math.max(-1, Math.min(1, dx / radius));
      const ny = Math.max(-1, Math.min(1, -dy / radius));
      const nzSq = Math.max(0, 1 - nx * nx - ny * ny);
      const nz = Math.sqrt(nzSq);

      // Spherical-warped coordinates so surface features curve over the lunar globe
      const lon = Math.atan2(nx, Math.max(0.06, nz));
      const lat = Math.asin(Math.max(-1, Math.min(1, ny)));

      // Multi-octave deterministic lunar maria (dark basalt plains) + highland albedo
      const m1 =
        Math.sin(lon * 2.4 + 0.6 + seedShift * 0.2) * Math.cos(lat * 2.1 - 0.3) +
        0.55 * Math.sin(lon * 4.7 - lat * 3.2 + 1.4) +
        0.3 * Math.cos(lon * 7.8 + lat * 6.4 - 0.8);
      const mariaMask = smoothstep(-0.15, 0.72, m1);

      // Fine regolith micro-grain
      const micro =
        0.5 +
        0.28 * Math.sin(lon * 19.0 + lat * 15.0) +
        0.22 * Math.cos(lon * 31.0 - lat * 27.0);

      // Base lunar highland vs basalt mare tone (cool silvery-ivory moon tint)
      let albedo = 0.86 - mariaMask * 0.38 + (micro - 0.5) * 0.08;

      // Apply craters with rim highlight and bowl shadow
      let bumpX = 0;
      let bumpY = 0;
      for (let c = 0; c < craters.length; c++) {
        const cr = craters[c];
        const cdx = nx - cr.x;
        const cdy = ny - cr.y;
        const cd = Math.hypot(cdx, cdy);
        if (cd < cr.r * 1.45) {
          const t = cd / cr.r;
          if (t < 0.82) {
            // Crater floor shadow depression
            const bowl = 1 - t / 0.82;
            albedo -= cr.depth * 0.25 * bowl;
            if (cd > 0.001) {
              bumpX -= (cdx / cd) * cr.depth * 0.9 * (1 - bowl * 0.3);
              bumpY -= (cdy / cd) * cr.depth * 0.9 * (1 - bowl * 0.3);
            }
          } else if (t < 1.15) {
            // Raised sunlit crater rim
            const rim = 1 - Math.abs(t - 0.96) / 0.19;
            albedo += Math.max(0, rim) * 0.14;
            if (cd > 0.001) {
              bumpX += (cdx / cd) * cr.depth * 0.65;
              bumpY += (cdy / cd) * cr.depth * 0.65;
            }
          } else if (c < 2) {
            // Subtle bright ejecta halo on major craters
            albedo += (1 - (t - 1.15) / 0.3) * 0.07;
          }
        }
      }

      // Perturbed normal for crisp crater lighting near the lunar terminator
      const pnx = nx + bumpX;
      const pny = ny + bumpY;
      const pnz = nz;
      const plen = Math.hypot(pnx, pny, pnz) || 1;
      const ndotl = (pnx * sx + pny * sy + pnz * sz) / plen;

      // Lommel-Seeliger-inspired lunar shading (brighter near limb like real dusty regolith, crisp terminator)
      const terminator = smoothstep(-0.06, 0.28, ndotl);
      const limbBoost = 0.78 + 0.22 * (1 - nz * 0.45);
      const sunlit = terminator * (0.35 + 0.72 * Math.max(0, ndotl)) * limbBoost;

      // Subtle cool earthshine on the unlit night side of the moon
      const earthshine = (1 - terminator) * (0.11 + 0.05 * (1 - mariaMask));
      // Delicate silvery rim corona on dark/new-moon phases
      const rimGlow = Math.pow(1 - nz, 2.6) * (0.28 + 0.16 * (1 - Math.max(0, sz)));

      const litR = Math.min(255, Math.round((albedo * sunlit * 248 + earthshine * 115 + rimGlow * 185)));
      const litG = Math.min(255, Math.round((albedo * sunlit * 246 + earthshine * 138 + rimGlow * 212)));
      const litB = Math.min(255, Math.round((albedo * sunlit * 255 + earthshine * 182 + rimGlow * 255)));

      data[idx] = litR;
      data[idx + 1] = litG;
      data[idx + 2] = litB;
      data[idx + 3] = Math.round(edgeAA * 242);
    }
  }

  offCtx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.translate(cx, cy);

  // Soft celestial glow halo behind the moon
  const halo = ctx.createRadialGradient(0, 0, radius * 0.55, 0, 0, radius * 1.65);
  halo.addColorStop(0, 'rgba(205, 226, 255, 0.34)');
  halo.addColorStop(0.55, 'rgba(147, 197, 253, 0.12)');
  halo.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.65, 0, Math.PI * 2);
  ctx.fill();

  // Delicate astrolabe orbital bezel framing each moon
  ctx.beginPath();
  ctx.arc(0, 0, radius + 4.5, 0, Math.PI * 2);
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  for (let t = 0; t < 4; t++) {
    const ta = (t * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ta) * (radius + 4.5), Math.sin(ta) * (radius + 4.5));
    ctx.lineTo(Math.cos(ta) * (radius + 9), Math.sin(ta) * (radius + 9));
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Paint the 3D-shaded realistic moon
  ctx.drawImage(offCanvas, -half, -half);
  ctx.restore();
}

function drawCompassRose(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  primaryStroke: string,
  secondaryStroke: string,
  fillLight: string,
  fillDark: string
) {
  ctx.save();
  ctx.translate(cx, cy);

  [1.0, 0.86, 0.62, 0.34].forEach((factor, idx) => {
    ctx.beginPath();
    ctx.arc(0, 0, radius * factor, 0, Math.PI * 2);
    ctx.strokeStyle = idx % 2 === 0 ? primaryStroke : secondaryStroke;
    ctx.lineWidth = idx === 0 ? 3.5 : 2;
    ctx.stroke();
  });

  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI * 2) / 72;
    const isMajor = i % 6 === 0;
    const r1 = radius * (isMajor ? 0.86 : 0.91);
    const r2 = radius * 0.99;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.strokeStyle = isMajor ? primaryStroke : secondaryStroke;
    ctx.lineWidth = isMajor ? 2.5 : 1.2;
    ctx.stroke();
  }

  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    const tipR = radius * 0.72;
    const sideR = radius * 0.14;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -tipR);
    ctx.lineTo(sideR, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = fillLight;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -tipR);
    ctx.lineTo(-sideR, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = fillDark;
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < 8; i++) {
    const isCardinal = i % 2 === 0;
    const angle = (i * Math.PI) / 4;
    const tipR = radius * (isCardinal ? 0.96 : 0.78);
    const sideR = radius * (isCardinal ? 0.16 : 0.11);

    ctx.save();
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, -tipR);
    ctx.lineTo(sideR, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = fillLight;
    ctx.fill();
    ctx.strokeStyle = primaryStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -tipR);
    ctx.lineTo(-sideR, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = fillDark;
    ctx.fill();
    ctx.strokeStyle = primaryStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = fillDark;
  ctx.fill();
  ctx.strokeStyle = primaryStroke;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.055, 0, Math.PI * 2);
  ctx.fillStyle = primaryStroke;
  ctx.fill();

  ctx.restore();
}

function drawEmbossedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string
) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillText(text, x + 1.5, y + 2);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawArcaneRuneRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  secondaryColor: string,
  mode: 'runes' | 'roman' | 'celestial' | 'obsidian'
) {
  const runes = [
    'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ',
    'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ',
  ];
  const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const cardinalLetters = ['N', 'E', 'S', 'O'];

  ctx.save();
  ctx.translate(cx, cy);

  ctx.beginPath();
  ctx.arc(0, 0, radius + 44, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius + 30, 0, Math.PI * 2);
  ctx.strokeStyle = secondaryColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(0, 0, radius - 38, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius - 50, 0, Math.PI * 2);
  ctx.strokeStyle = secondaryColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const petalCount = 24;
  for (let i = 0; i < petalCount; i++) {
    const a = (i * Math.PI * 2) / petalCount;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.arc(0, -(radius + 37), 5.5, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? color : secondaryColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -(radius - 62));
    ctx.lineTo(6, -(radius - 54));
    ctx.lineTo(0, -(radius - 46));
    ctx.lineTo(-6, -(radius - 54));
    ctx.closePath();
    ctx.fillStyle = secondaryColor;
    ctx.fill();
    ctx.restore();
  }

  if (mode === 'roman') {
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      ctx.save();
      ctx.rotate(a);
      ctx.font = 'bold 42px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawEmbossedText(ctx, romans[i], 0, -radius, color);
      ctx.restore();

      const midA = a + Math.PI / 12;
      ctx.save();
      ctx.rotate(midA);
      ctx.font = 'bold 28px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawEmbossedText(ctx, runes[i % runes.length], 0, -radius, secondaryColor);
      ctx.restore();
    }
  } else if (mode === 'celestial') {
    let moonIndex = 0;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24;
      ctx.save();
      ctx.rotate(a);
      if (i % 3 === 0) {
        // Keep a consistent astronomical illumination orientation across all 8 realistic moon phases
        ctx.save();
        ctx.translate(0, -radius);
        ctx.rotate(-a);
        drawRealisticMoon(ctx, 0, 0, 27, moonIndex, secondaryColor);
        ctx.restore();
        moonIndex++;
      } else {
        ctx.font = 'bold 30px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawEmbossedText(ctx, runes[i], 0, -radius, i % 2 === 0 ? color : secondaryColor);
      }
      ctx.restore();
    }
  } else if (mode === 'obsidian') {
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24;
      ctx.save();
      ctx.rotate(a);
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.font = 'bold 34px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawEmbossedText(ctx, runes[i], 0, -radius, i % 2 === 0 ? color : secondaryColor);
      ctx.restore();
    }
  } else {
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24;
      ctx.save();
      ctx.rotate(a);
      if (i % 6 === 0) {
        ctx.font = '900 44px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawEmbossedText(ctx, cardinalLetters[i / 6], 0, -radius, color);
      } else {
        ctx.font = 'bold 32px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawEmbossedText(ctx, runes[i], 0, -radius, i % 2 === 0 ? color : secondaryColor);
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawCornerOrnaments(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  stroke: string,
  accent: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, -innerR);
    ctx.quadraticCurveTo(0, -(innerR + outerR) * 0.52, 26, -innerR);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -innerR - 8);
    ctx.lineTo(0, -outerR + 8);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    drawStarPolygon(ctx, 0, -(innerR + outerR) * 0.5, 4, 12, 4.5, 0);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function createFullTableSurfaceTexture(
  surface: TableSurface,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (surface === 'green_felt') {
    ctx.fillStyle = '#0d311c';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      data[i] = Math.max(0, Math.min(255, data[i] + n * 0.4));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n * 0.5));
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (surface === 'red_velvet') {
    ctx.fillStyle = '#360810';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n * 0.2));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n * 0.32));
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (surface === 'midnight_felt') {
    ctx.fillStyle = '#0a1833';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      data[i] = Math.max(0, Math.min(255, data[i] + n * 0.25));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n * 0.55));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (surface === 'obsidian_stone') {
    ctx.fillStyle = '#151921';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n * 1.12));
    }
    ctx.putImageData(imgData, 0, 0);

    for (let c = 0; c < 14; c++) {
      let cx = Math.random() * size;
      let cy = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let seg = 0; seg < 6; seg++) {
        cx += (Math.random() - 0.5) * 150;
        cy += (Math.random() - 0.5) * 150;
        ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = c % 4 === 0 ? 'rgba(94, 234, 212, 0.08)' : 'rgba(6, 7, 10, 0.42)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#1f140c';
    ctx.fillRect(0, 0, size, size);

    const plankCount = 5;
    const plankWidth = size / plankCount;
    for (let p = 0; p < plankCount; p++) {
      const x0 = p * plankWidth;
      const shade = (p % 2 === 0 ? 1 : -1) * 5;
      const grad = ctx.createLinearGradient(x0, 0, x0 + plankWidth, 0);
      grad.addColorStop(0, `rgb(${31 + shade}, ${20 + shade}, ${12 + shade})`);
      grad.addColorStop(0.5, `rgb(${42 + shade}, ${27 + shade}, ${16 + shade})`);
      grad.addColorStop(1, `rgb(${28 + shade}, ${17 + shade}, ${10 + shade})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x0, 0, plankWidth, size);

      for (let g = 0; g < 55; g++) {
        const gx = x0 + 6 + Math.random() * (plankWidth - 12);
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        const wave = (Math.random() - 0.5) * 16;
        ctx.bezierCurveTo(
          gx + wave,
          size * 0.33,
          gx - wave,
          size * 0.66,
          gx + (Math.random() - 0.5) * 6,
          size
        );
        ctx.strokeStyle = g % 3 === 0 ? 'rgba(10, 5, 2, 0.26)' : 'rgba(98, 62, 32, 0.14)';
        ctx.lineWidth = 0.8 + Math.random() * 1.8;
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(7, 4, 2, 0.8)';
      ctx.fillRect(x0, 0, 2.5, size);
      ctx.fillStyle = 'rgba(110, 74, 40, 0.12)';
      ctx.fillRect(x0 + 2.5, 0, 1.5, size);
    }

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 10;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n * 0.7));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n * 0.45));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCompassOverlayTexture(
  surface: TableSurface,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 2048;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const tintGrad = ctx.createRadialGradient(half, half, 40, half, half, half * 0.96);
  if (surface === 'green_felt') {
    tintGrad.addColorStop(0, 'rgba(32, 102, 60, 0.42)');
    tintGrad.addColorStop(0.65, 'rgba(18, 66, 38, 0.18)');
    tintGrad.addColorStop(1, 'rgba(13, 49, 28, 0)');
  } else if (surface === 'red_velvet') {
    tintGrad.addColorStop(0, 'rgba(115, 22, 38, 0.45)');
    tintGrad.addColorStop(0.65, 'rgba(72, 12, 24, 0.2)');
    tintGrad.addColorStop(1, 'rgba(54, 8, 16, 0)');
  } else if (surface === 'midnight_felt') {
    tintGrad.addColorStop(0, 'rgba(26, 62, 124, 0.46)');
    tintGrad.addColorStop(0.65, 'rgba(14, 34, 76, 0.22)');
    tintGrad.addColorStop(1, 'rgba(10, 24, 51, 0)');
  } else if (surface === 'obsidian_stone') {
    tintGrad.addColorStop(0, 'rgba(42, 52, 68, 0.45)');
    tintGrad.addColorStop(0.65, 'rgba(24, 30, 40, 0.2)');
    tintGrad.addColorStop(1, 'rgba(21, 25, 33, 0)');
  } else {
    tintGrad.addColorStop(0, 'rgba(72, 46, 26, 0.42)');
    tintGrad.addColorStop(0.65, 'rgba(44, 28, 16, 0.18)');
    tintGrad.addColorStop(1, 'rgba(31, 20, 12, 0)');
  }
  ctx.fillStyle = tintGrad;
  ctx.beginPath();
  ctx.arc(half, half, half * 0.96, 0, Math.PI * 2);
  ctx.fill();

  if (surface === 'green_felt') {
    drawCornerOrnaments(ctx, half, half, 450, 740, 'rgba(225, 190, 102, 0.28)', 'rgba(240, 212, 138, 0.4)');
    drawCompassRose(
      ctx,
      half,
      half,
      410,
      'rgba(232, 198, 112, 0.56)',
      'rgba(186, 152, 88, 0.3)',
      'rgba(235, 205, 130, 0.18)',
      'rgba(96, 70, 26, 0.24)'
    );
    drawArcaneRuneRing(
      ctx,
      half,
      half,
      860,
      'rgba(232, 198, 112, 0.56)',
      'rgba(196, 160, 92, 0.36)',
      'runes'
    );
  } else if (surface === 'red_velvet') {
    ctx.save();
    ctx.translate(half, half);
    [
      { x: 0, y: -45, r: 520 },
      { x: 35, y: 30, r: 620 },
      { x: -35, y: 30, r: 620 },
    ].forEach((c) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 215, 110, 0.24)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
    ctx.restore();

    drawCornerOrnaments(ctx, half, half, 450, 740, 'rgba(255, 216, 117, 0.28)', 'rgba(255, 224, 140, 0.42)');
    drawCompassRose(
      ctx,
      half,
      half,
      405,
      'rgba(255, 216, 117, 0.56)',
      'rgba(212, 168, 72, 0.32)',
      'rgba(255, 224, 140, 0.2)',
      'rgba(128, 74, 24, 0.24)'
    );
    drawArcaneRuneRing(
      ctx,
      half,
      half,
      860,
      'rgba(255, 216, 117, 0.58)',
      'rgba(220, 175, 85, 0.38)',
      'roman'
    );
  } else if (surface === 'midnight_felt') {
    for (let s = 0; s < 160; s++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 820;
      const sx = half + Math.cos(angle) * dist;
      const sy = half + Math.sin(angle) * dist;
      const sr = 0.8 + Math.random() * 2.1;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = s % 5 === 0 ? 'rgba(224, 242, 254, 0.52)' : 'rgba(147, 197, 253, 0.3)';
      ctx.fill();
    }

    drawCornerOrnaments(ctx, half, half, 450, 740, 'rgba(186, 214, 255, 0.28)', 'rgba(224, 238, 255, 0.38)');
    drawCompassRose(
      ctx,
      half,
      half,
      405,
      'rgba(210, 228, 255, 0.58)',
      'rgba(125, 175, 255, 0.32)',
      'rgba(210, 230, 255, 0.18)',
      'rgba(45, 78, 130, 0.28)'
    );
    drawArcaneRuneRing(
      ctx,
      half,
      half,
      860,
      'rgba(214, 232, 255, 0.62)',
      'rgba(165, 206, 255, 0.45)',
      'celestial'
    );
  } else if (surface === 'obsidian_stone') {
    ctx.save();
    ctx.translate(half, half);
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 3);
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.26)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-330, -330, 660, 660);
      ctx.restore();
    }
    ctx.restore();

    drawCompassRose(
      ctx,
      half,
      half,
      390,
      'rgba(148, 224, 245, 0.52)',
      'rgba(186, 152, 88, 0.32)',
      'rgba(148, 224, 245, 0.16)',
      'rgba(30, 41, 59, 0.3)'
    );
    drawArcaneRuneRing(
      ctx,
      half,
      half,
      860,
      'rgba(125, 226, 209, 0.56)',
      'rgba(212, 175, 55, 0.4)',
      'obsidian'
    );
  } else {
    drawCornerOrnaments(ctx, half, half, 450, 740, 'rgba(212, 175, 55, 0.26)', 'rgba(235, 200, 108, 0.4)');
    drawCompassRose(
      ctx,
      half,
      half,
      405,
      'rgba(225, 186, 98, 0.56)',
      'rgba(186, 152, 88, 0.3)',
      'rgba(230, 195, 110, 0.2)',
      'rgba(92, 62, 24, 0.26)'
    );
    drawArcaneRuneRing(
      ctx,
      half,
      half,
      860,
      'rgba(225, 186, 98, 0.58)',
      'rgba(186, 152, 88, 0.38)',
      'roman'
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createHammeredBronzeTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#473119';
  cCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Hand-hammered antique bronze dimples & warm patina
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 14;

    const cGrad = cCtx.createRadialGradient(x, y, 1, x, y, r);
    const bright = i % 3 === 0;
    cGrad.addColorStop(0, bright ? 'rgba(138, 98, 46, 0.35)' : 'rgba(32, 20, 10, 0.42)');
    cGrad.addColorStop(1, 'rgba(71, 49, 25, 0)');
    cCtx.fillStyle = cGrad;
    cCtx.beginPath();
    cCtx.arc(x, y, r, 0, Math.PI * 2);
    cCtx.fill();

    const bGrad = bCtx.createRadialGradient(x, y, 1, x, y, r);
    bGrad.addColorStop(0, 'rgba(72, 72, 72, 0.65)');
    bGrad.addColorStop(0.75, 'rgba(155, 155, 155, 0.35)');
    bGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bCtx.fillStyle = bGrad;
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 2);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 2);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.45)');
  grad.addColorStop(0.78, 'rgba(0, 0, 0, 0.14)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createTableWarmPoolTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(255, 166, 68, 0.42)');
  grad.addColorStop(0.35, 'rgba(255, 128, 34, 0.2)');
  grad.addColorStop(0.7, 'rgba(235, 92, 16, 0.06)');
  grad.addColorStop(1.0, 'rgba(200, 60, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFlameHaloTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 240, 198, 0.82)');
  grad.addColorStop(0.24, 'rgba(255, 168, 56, 0.34)');
  grad.addColorStop(0.58, 'rgba(255, 90, 16, 0.09)');
  grad.addColorStop(1, 'rgba(255, 50, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMilledEdgeBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const teeth = 128;
  for (let i = 0; i < w; i++) {
    const wave = Math.sin((i / w) * teeth * Math.PI * 2) * 0.5 + 0.5;
    const v = Math.round(52 + wave * 188);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(i, 0, 1, h);
  }
  // Subtle chamfer darkening along top & bottom coin rim edges
  const edgeGrad = ctx.createLinearGradient(0, 0, 0, h);
  edgeGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
  edgeGrad.addColorStop(0.18, 'rgba(255,255,255,0)');
  edgeGrad.addColorStop(0.82, 'rgba(255,255,255,0)');
  edgeGrad.addColorStop(1, 'rgba(255,255,255,0.45)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createMintedCoinTextures(
  metal: 'gold' | 'silver',
  maxAnisotropy: number
): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const half = size / 2;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const isGold = metal === 'gold';
  const fieldBase = isGold ? '#cfa038' : '#b8c1cc';
  const fieldHi = isGold ? '#f3d474' : '#e4eaf2';
  const fieldPatina = isGold ? '#734d11' : '#4a535e';
  const reliefBright = isGold ? '#ffe89c' : '#f4f8fc';

  // Base metallic field with subtle radial satin sheen
  const cGrad = cCtx.createRadialGradient(half * 0.85, half * 0.82, 16, half, half, half);
  cGrad.addColorStop(0, fieldHi);
  cGrad.addColorStop(0.58, fieldBase);
  cGrad.addColorStop(0.88, isGold ? '#b28222' : '#96a1ae');
  cGrad.addColorStop(1, fieldPatina);
  cCtx.fillStyle = cGrad;
  cCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#7c7c7c';
  bCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = isGold ? '#4e4e4e' : '#585858';
  rCtx.fillRect(0, 0, size, size);

  // Subtle concentric lathe-turned metal grain
  for (let rad = 24; rad < 236; rad += 3) {
    const shade = (rad % 9) * 0.008;
    cCtx.strokeStyle = rad % 6 === 0 ? `rgba(255,255,255,${0.03 + shade})` : `rgba(0,0,0,${0.035 + shade})`;
    cCtx.lineWidth = 1.2;
    cCtx.beginPath();
    cCtx.arc(half, half, rad, 0, Math.PI * 2);
    cCtx.stroke();
  }

  // Tarnished recessed trough right inside outer rim
  cCtx.strokeStyle = fieldPatina;
  cCtx.lineWidth = 22;
  cCtx.beginPath();
  cCtx.arc(half, half, 212, 0, Math.PI * 2);
  cCtx.stroke();

  bCtx.strokeStyle = '#383838';
  bCtx.lineWidth = 22;
  bCtx.beginPath();
  bCtx.arc(half, half, 212, 0, Math.PI * 2);
  bCtx.stroke();

  rCtx.strokeStyle = '#8c8c8c';
  rCtx.lineWidth = 22;
  rCtx.beginPath();
  rCtx.arc(half, half, 212, 0, Math.PI * 2);
  rCtx.stroke();

  // Raised outer burnished collar rim
  cCtx.strokeStyle = reliefBright;
  cCtx.lineWidth = 24;
  cCtx.beginPath();
  cCtx.arc(half, half, 238, 0, Math.PI * 2);
  cCtx.stroke();

  bCtx.strokeStyle = '#f2f2f2';
  bCtx.lineWidth = 24;
  bCtx.beginPath();
  bCtx.arc(half, half, 238, 0, Math.PI * 2);
  bCtx.stroke();

  rCtx.strokeStyle = '#2e2e2e';
  rCtx.lineWidth = 24;
  rCtx.beginPath();
  rCtx.arc(half, half, 238, 0, Math.PI * 2);
  rCtx.stroke();

  // Outer beaded pearls / hammered edge notches
  const pearlCount = isGold ? 52 : 44;
  for (let i = 0; i < pearlCount; i++) {
    const a = (i / pearlCount) * Math.PI * 2;
    const px = half + Math.cos(a) * 204;
    const py = half + Math.sin(a) * 204;
    const pr = isGold ? 4.4 : 4.0;

    cCtx.fillStyle = reliefBright;
    cCtx.beginPath();
    cCtx.arc(px, py, pr, 0, Math.PI * 2);
    cCtx.fill();

    bCtx.fillStyle = '#ebebeb';
    bCtx.beginPath();
    bCtx.arc(px, py, pr, 0, Math.PI * 2);
    bCtx.fill();

    rCtx.fillStyle = '#343434';
    rCtx.beginPath();
    rCtx.arc(px, py, pr, 0, Math.PI * 2);
    rCtx.fill();
  }

  // Engraved inner ring with arcane/Latin legend ticks
  cCtx.strokeStyle = fieldPatina;
  cCtx.lineWidth = 5;
  cCtx.beginPath();
  cCtx.arc(half, half, 178, 0, Math.PI * 2);
  cCtx.stroke();

  bCtx.strokeStyle = '#3e3e3e';
  bCtx.lineWidth = 5;
  bCtx.beginPath();
  bCtx.arc(half, half, 178, 0, Math.PI * 2);
  bCtx.stroke();

  const legendGlyphs = 28;
  for (let i = 0; i < legendGlyphs; i++) {
    const a = (i / legendGlyphs) * Math.PI * 2;
    const x1 = half + Math.cos(a) * 158;
    const y1 = half + Math.sin(a) * 158;
    const x2 = half + Math.cos(a + 0.05) * 170;
    const y2 = half + Math.sin(a + 0.05) * 170;

    cCtx.strokeStyle = i % 7 === 0 ? reliefBright : fieldBase;
    cCtx.lineWidth = i % 7 === 0 ? 5.5 : 4.0;
    cCtx.beginPath();
    cCtx.moveTo(x1, y1);
    cCtx.lineTo(x2, y2);
    cCtx.stroke();

    bCtx.strokeStyle = '#dfdfdf';
    bCtx.lineWidth = 4.5;
    bCtx.beginPath();
    bCtx.moveTo(x1, y1);
    bCtx.lineTo(x2, y2);
    bCtx.stroke();
  }

  // Recessed central medallion bed
  cCtx.fillStyle = isGold ? '#9e7019' : '#6f7985';
  cCtx.beginPath();
  cCtx.arc(half, half, 140, 0, Math.PI * 2);
  cCtx.fill();

  bCtx.fillStyle = '#555555';
  bCtx.beginPath();
  bCtx.arc(half, half, 140, 0, Math.PI * 2);
  bCtx.fill();

  rCtx.fillStyle = '#757575';
  rCtx.beginPath();
  rCtx.arc(half, half, 140, 0, Math.PI * 2);
  rCtx.fill();

  if (isGold) {
    // Gold Sovereign: Royal 8-point Sunburst & Crowned Solar Disc
    drawStarPolygon(cCtx, half, half, 8, 128, 52);
    cCtx.fillStyle = reliefBright;
    cCtx.fill();
    cCtx.strokeStyle = fieldPatina;
    cCtx.lineWidth = 3.5;
    cCtx.stroke();

    drawStarPolygon(bCtx, half, half, 8, 128, 52);
    bCtx.fillStyle = '#e8e8e8';
    bCtx.fill();

    drawStarPolygon(rCtx, half, half, 8, 128, 52);
    rCtx.fillStyle = '#2c2c2c';
    rCtx.fill();

    // Inner crown ring & embossed center solar crest
    cCtx.fillStyle = fieldBase;
    cCtx.beginPath();
    cCtx.arc(half, half, 54, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.strokeStyle = reliefBright;
    cCtx.lineWidth = 7;
    cCtx.stroke();

    bCtx.fillStyle = '#b4b4b4';
    bCtx.beginPath();
    bCtx.arc(half, half, 54, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.strokeStyle = '#ffffff';
    bCtx.lineWidth = 7;
    bCtx.stroke();

    drawStarPolygon(cCtx, half, half, 6, 36, 17);
    cCtx.fillStyle = reliefBright;
    cCtx.fill();
    drawStarPolygon(bCtx, half, half, 6, 36, 17);
    bCtx.fillStyle = '#f5f5f5';
    bCtx.fill();
  } else {
    // Silver Florin: Crescent Moon & Compass Star Crest
    cCtx.save();
    cCtx.fillStyle = reliefBright;
    cCtx.beginPath();
    cCtx.arc(half - 14, half, 94, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.fillStyle = '#6f7985';
    cCtx.beginPath();
    cCtx.arc(half + 20, half - 8, 76, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.restore();

    bCtx.save();
    bCtx.fillStyle = '#ebebeb';
    bCtx.beginPath();
    bCtx.arc(half - 14, half, 94, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.fillStyle = '#555555';
    bCtx.beginPath();
    bCtx.arc(half + 20, half - 8, 76, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.restore();

    rCtx.save();
    rCtx.fillStyle = '#2d2d2d';
    rCtx.beginPath();
    rCtx.arc(half - 14, half, 94, 0, Math.PI * 2);
    rCtx.fill();
    rCtx.fillStyle = '#757575';
    rCtx.beginPath();
    rCtx.arc(half + 20, half - 8, 76, 0, Math.PI * 2);
    rCtx.fill();
    rCtx.restore();

    // 4-point compass star nested in the crescent hollow
    drawStarPolygon(cCtx, half + 40, half - 10, 4, 46, 13);
    cCtx.fillStyle = reliefBright;
    cCtx.fill();
    drawStarPolygon(bCtx, half + 40, half - 10, 4, 46, 13);
    bCtx.fillStyle = '#f5f5f5';
    bCtx.fill();
    drawStarPolygon(rCtx, half + 40, half - 10, 4, 46, 13);
    rCtx.fillStyle = '#2a2a2a';
    rCtx.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, bumpMap, roughnessMap };
}

function createRealisticCompassDialTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 1024;
  const half = size / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Warm aged ivory enamel background with subtle perimeter patina
  const bg = ctx.createRadialGradient(half, half, 40, half, half, half);
  bg.addColorStop(0, '#f5ebd1');
  bg.addColorStop(0.68, '#ead7ad');
  bg.addColorStop(0.92, '#cbb07c');
  bg.addColorStop(1, '#9d7c46');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, size, size);

  // Subtle paper/enamel age flecks
  for (let i = 0; i < 420; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * (half - 24);
    const r = 0.6 + Math.random() * 1.6;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(112, 82, 42, 0.08)' : 'rgba(255, 250, 232, 0.09)';
    ctx.beginPath();
    ctx.arc(half + Math.cos(a) * d, half + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Recessed outer brass & dark sepia chapter rings
  const ringSpecs = [
    { r: 472, w: 8, color: '#261d14', bump: '#484848' },
    { r: 458, w: 3, color: '#8f6524', bump: '#c8c8c8' },
    { r: 418, w: 3.5, color: '#261d14', bump: '#525252' },
    { r: 356, w: 2.5, color: '#3b2d1f', bump: '#626262' },
    { r: 292, w: 4, color: '#9c7129', bump: '#c4c4c4' },
  ];
  ringSpecs.forEach((ring) => {
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.w;
    ctx.beginPath();
    ctx.arc(half, half, ring.r, 0, Math.PI * 2);
    ctx.stroke();

    bCtx.strokeStyle = ring.bump;
    bCtx.lineWidth = ring.w;
    bCtx.beginPath();
    bCtx.arc(half, half, ring.r, 0, Math.PI * 2);
    bCtx.stroke();
  });

  // 180 fine precision degree ticks + crisp serif numerals
  for (let deg = 0; deg < 360; deg += 2) {
    const rad = ((deg - 90) * Math.PI) / 180;
    const is30 = deg % 30 === 0;
    const is10 = deg % 10 === 0;
    const rOuter = 456;
    const rInner = is30 ? 419 : is10 ? 430 : 442;

    ctx.strokeStyle = is30 ? '#7d1f1f' : '#241b12';
    ctx.lineWidth = is30 ? 4.2 : is10 ? 2.6 : 1.4;
    ctx.beginPath();
    ctx.moveTo(half + Math.cos(rad) * rInner, half + Math.sin(rad) * rInner);
    ctx.lineTo(half + Math.cos(rad) * rOuter, half + Math.sin(rad) * rOuter);
    ctx.stroke();

    if (is30) {
      bCtx.strokeStyle = '#555555';
      bCtx.lineWidth = 4;
      bCtx.beginPath();
      bCtx.moveTo(half + Math.cos(rad) * rInner, half + Math.sin(rad) * rInner);
      bCtx.lineTo(half + Math.cos(rad) * rOuter, half + Math.sin(rad) * rOuter);
      bCtx.stroke();

      ctx.save();
      ctx.translate(half + Math.cos(rad) * 388, half + Math.sin(rad) * 388);
      ctx.rotate(rad + Math.PI / 2);
      ctx.font = 'bold 26px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = deg === 0 ? '#8c2222' : '#221a12';
      ctx.fillText(String(deg), 0, 0);
      ctx.restore();
    }
  }

  // 16-point faceted mariner's star compass rose
  const drawFacetedPoint = (
    angleRad: number,
    len: number,
    baseHalfW: number,
    darkHex: string,
    lightHex: string
  ) => {
    const tipX = half + Math.cos(angleRad) * len;
    const tipY = half + Math.sin(angleRad) * len;
    const leftX = half + Math.cos(angleRad - Math.PI / 2) * baseHalfW;
    const leftY = half + Math.sin(angleRad - Math.PI / 2) * baseHalfW;
    const rightX = half + Math.cos(angleRad + Math.PI / 2) * baseHalfW;
    const rightY = half + Math.sin(angleRad + Math.PI / 2) * baseHalfW;

    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fillStyle = lightHex;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = darkHex;
    ctx.fill();

    bCtx.beginPath();
    bCtx.moveTo(half, half);
    bCtx.lineTo(leftX, leftY);
    bCtx.lineTo(tipX, tipY);
    bCtx.lineTo(rightX, rightY);
    bCtx.closePath();
    bCtx.fillStyle = '#c8c8c8';
    bCtx.fill();
  };

  // Secondary 8 points first
  for (let k = 0; k < 8; k++) {
    const angle = ((k * 45 + 22.5 - 90) * Math.PI) / 180;
    drawFacetedPoint(angle, 195, 22, '#7b5b26', '#dfc074');
  }
  // Intercardinal 4 points (NE, SE, SW, NW)
  for (let k = 0; k < 4; k++) {
    const angle = ((k * 90 + 45 - 90) * Math.PI) / 180;
    drawFacetedPoint(angle, 255, 34, '#2f3d56', '#7486a3');
  }
  // Cardinal 4 points (N, E, S, W)
  for (let k = 0; k < 4; k++) {
    const angle = ((k * 90 - 90) * Math.PI) / 180;
    const isNorth = k === 0;
    drawFacetedPoint(
      angle,
      isNorth ? 316 : 292,
      44,
      isNorth ? '#7a1919' : '#182132',
      isNorth ? '#c9433d' : '#4a5a75'
    );
  }

  // Cardinal & intercardinal typography
  const labels = [
    { text: 'N', deg: 0, r: 328, font: 'bold 40px Georgia, serif', color: '#8a1e1e' },
    { text: 'E', deg: 90, r: 325, font: 'bold 34px Georgia, serif', color: '#1f1912' },
    { text: 'S', deg: 180, r: 325, font: 'bold 34px Georgia, serif', color: '#1f1912' },
    { text: 'W', deg: 270, r: 325, font: 'bold 34px Georgia, serif', color: '#1f1912' },
    { text: 'NE', deg: 45, r: 318, font: 'bold 21px Georgia, serif', color: '#3b2e1e' },
    { text: 'SE', deg: 135, r: 318, font: 'bold 21px Georgia, serif', color: '#3b2e1e' },
    { text: 'SW', deg: 225, r: 318, font: 'bold 21px Georgia, serif', color: '#3b2e1e' },
    { text: 'NW', deg: 315, r: 318, font: 'bold 21px Georgia, serif', color: '#3b2e1e' },
  ];
  labels.forEach((lbl) => {
    const rad = ((lbl.deg - 90) * Math.PI) / 180;
    ctx.save();
    ctx.translate(half + Math.cos(rad) * lbl.r, half + Math.sin(rad) * lbl.r);
    ctx.rotate(rad + Math.PI / 2);
    ctx.font = lbl.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = lbl.color;
    ctx.fillText(lbl.text, 0, 0);
    ctx.restore();
  });

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

function createEngravedLidTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const half = size / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(half, half, 20, half, half, half);
  grad.addColorStop(0, '#dcb864');
  grad.addColorStop(0.75, '#bc913d');
  grad.addColorStop(1, '#7a581c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, size, size);

  // Concentric brushed brass lathe grooves & recessed engraving
  for (let r = 24; r < 236; r += 4) {
    ctx.strokeStyle = r % 8 === 0 ? 'rgba(255,244,200,0.06)' : 'rgba(42,26,8,0.06)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(half, half, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  [196, 182, 118].forEach((r, idx) => {
    ctx.strokeStyle = '#5e4012';
    ctx.lineWidth = idx === 0 ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(half, half, r, 0, Math.PI * 2);
    ctx.stroke();

    bCtx.strokeStyle = '#484848';
    bCtx.lineWidth = idx === 0 ? 4 : 2.5;
    bCtx.beginPath();
    bCtx.arc(half, half, r, 0, Math.PI * 2);
    bCtx.stroke();
  });

  drawStarPolygon(ctx, half, half, 8, 92, 26);
  ctx.strokeStyle = '#5e4012';
  ctx.lineWidth = 3;
  ctx.stroke();

  drawStarPolygon(bCtx, half, half, 8, 92, 26);
  bCtx.strokeStyle = '#4c4c4c';
  bCtx.lineWidth = 3;
  bCtx.stroke();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

function createPhotoCandleBodyMaterial(
  map: THREE.Texture,
  flipX: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uFlipX: { value: flipX ? 1.0 : 0.0 },
      uFlicker: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uMap;
      uniform float uFlipX;
      uniform float uFlicker;

      void main() {
        vec2 sampleUv = vec2(uFlipX > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
        vec4 texel = texture2D(uMap, sampleUv);
        if (texel.a < 0.05) discard;

        // Warm living candlelight pulse focused on the upper melted wax rim & amber pool
        float upperMask = smoothstep(0.42, 0.88, vUv.y);
        vec3 baseTint = mix(vec3(0.90, 0.87, 0.84), vec3(1.06, 0.99, 0.92), upperMask);
        vec3 pulse = upperMask * uFlicker * vec3(0.32, 0.16, 0.04);

        gl_FragColor = vec4(texel.rgb * baseTint + pulse, texel.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

function createPhotoFlameMaterial(
  flameMap: THREE.Texture,
  phase: number,
  flipX: boolean
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: flameMap },
      uTime: { value: 0 },
      uPhase: { value: phase },
      uFlipX: { value: flipX ? 1.0 : 0.0 },
      uFlicker: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uPhase;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float h = clamp(uv.y, 0.0, 1.0);
        float t = uTime + uPhase;

        // Keep flame base anchored on wick while upper tip sways organically
        float swayX = (sin(t * 5.2 + h * 3.1) * 0.032 + sin(t * 9.8) * 0.014) * pow(h, 1.35);
        float stretch = 1.0 + (sin(t * 7.4) * 0.075 + cos(t * 12.6) * 0.035) * h;

        pos.x += swayX;
        pos.y *= stretch;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uPhase;
      uniform float uFlipX;
      uniform float uFlicker;

      void main() {
        float h = clamp((vUv.y - 0.044) / 0.90, 0.0, 1.0);
        float t = uTime + uPhase;

        // Subtle fluid wave inside the real photographic flame texture
        float wave = (sin(t * 6.4 + h * 5.2) * 0.036 + sin(t * 11.7 - h * 3.5) * 0.014) * pow(h, 1.25);
        float breathe = 1.0 + sin(t * 8.1) * 0.045 * h;

        float u = uFlipX > 0.5 ? 1.0 - vUv.x : vUv.x;
        u = 0.5 + (u - 0.5) / breathe - wave;
        float v = 0.044 + (vUv.y - 0.044) / (1.0 + sin(t * 6.9) * 0.055 * h);

        vec2 clampedUv = clamp(vec2(u, v), 0.0, 1.0);
        vec3 flame = texture2D(uMap, clampedUv).rgb;

        // Cleanly suppress residual near-black noise for seamless additive blending
        float luma = max(flame.r, max(flame.g, flame.b));
        float mask = smoothstep(0.025, 0.11, luma);
        float edgeFade = smoothstep(0.0, 0.05, clampedUv.x) * smoothstep(1.0, 0.95, clampedUv.x) *
                         smoothstep(0.0, 0.04, clampedUv.y) * smoothstep(1.0, 0.94, clampedUv.y);

        float boost = 1.08 + uFlicker * 1.15;
        gl_FragColor = vec4(flame * boost * mask * edgeFade, mask * edgeFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function getSurfacePBR(surface: TableSurface): { roughness: number; metalness: number } {
  if (surface === 'obsidian_stone') return { roughness: 0.46, metalness: 0.18 };
  if (surface === 'dark_wood') return { roughness: 0.74, metalness: 0.08 };
  return { roughness: 0.88, metalness: 0.03 };
}

export function createTableEnvironment(
  arenaRadius: number,
  initialSurface: TableSurface,
  maxAnisotropy: number
): TableEnvironmentController {
  const group = new THREE.Group();
  const disposableGeoms: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTexs: THREE.Texture[] = [];

  const trackGeom = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeoms.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposableTexs.push(t);
    return t;
  };

  // 1. Full tabletop surface covering the entire scene
  let currentFullTableTex = createFullTableSurfaceTexture(initialSurface, maxAnisotropy);
  const initialPBR = getSurfacePBR(initialSurface);
  const fullTableMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: currentFullTableTex,
      roughness: initialPBR.roughness,
      metalness: initialPBR.metalness,
    })
  );
  const fullTableMesh = new THREE.Mesh(trackGeom(new THREE.PlaneGeometry(130, 130)), fullTableMat);
  fullTableMesh.rotation.x = -Math.PI / 2;
  fullTableMesh.position.y = 0;
  fullTableMesh.receiveShadow = true;
  group.add(fullTableMesh);

  // 2. Central compass rose, realistic moons & arcane rune ring seamlessly blended over the tabletop
  let currentCompassTex = createCompassOverlayTexture(initialSurface, maxAnisotropy);
  const compassOverlayMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: currentCompassTex,
      transparent: true,
      roughness: initialPBR.roughness,
      metalness: initialPBR.metalness,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const compassOverlayMesh = new THREE.Mesh(
    trackGeom(new THREE.CircleGeometry(arenaRadius + 0.15, 72)),
    compassOverlayMat
  );
  compassOverlayMesh.rotation.x = -Math.PI / 2;
  compassOverlayMesh.position.y = 0.008;
  compassOverlayMesh.receiveShadow = true;
  group.add(compassOverlayMesh);

  // 3. Four photorealistic corner candles: true 3D hammered bronze dish flat on y=0 + upright real wax pillar + live flame photo
  const candleRigs: RealisticCandleRig[] = [];
  const textureLoader = new THREE.TextureLoader();

  const waxTex1 = trackTex(textureLoader.load(wax1Url));
  waxTex1.colorSpace = THREE.SRGBColorSpace;
  waxTex1.anisotropy = maxAnisotropy;

  const waxTex2 = trackTex(textureLoader.load(wax2Url));
  waxTex2.colorSpace = THREE.SRGBColorSpace;
  waxTex2.anisotropy = maxAnisotropy;

  const flameTex = trackTex(textureLoader.load(candleFlameUrl));
  flameTex.colorSpace = THREE.SRGBColorSpace;
  flameTex.anisotropy = maxAnisotropy;

  const bronzeTexs = createHammeredBronzeTextures(maxAnisotropy);
  trackTex(bronzeTexs.map);
  trackTex(bronzeTexs.bumpMap);

  const bronzeDishMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: bronzeTexs.map,
      bumpMap: bronzeTexs.bumpMap,
      bumpScale: 0.018,
      roughness: 0.36,
      metalness: 0.86,
    })
  );

  const waxDishPoolMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#dec494',
      emissive: '#381502',
      emissiveIntensity: 0.2,
      roughness: 0.38,
      clearcoat: 0.25,
    })
  );

  const dishProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.56, 0),
    new THREE.Vector2(0.76, 0.055),
    new THREE.Vector2(0.86, 0.125),
    new THREE.Vector2(0.89, 0.16),
    new THREE.Vector2(0.84, 0.178),
    new THREE.Vector2(0.74, 0.115),
    new THREE.Vector2(0.52, 0.072),
    new THREE.Vector2(0, 0.068),
  ];
  const dishGeom = trackGeom(new THREE.LatheGeometry(dishProfile, 44));

  const contactShadowTex = trackTex(createContactShadowTexture());
  const tableWarmPoolTex = trackTex(createTableWarmPoolTexture());
  const haloTexture = trackTex(createFlameHaloTexture());

  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
    })
  );
  const contactShadowGeom = trackGeom(new THREE.CircleGeometry(1.12, 32));
  const tableWarmPoolGeom = trackGeom(new THREE.CircleGeometry(2.9, 32));

  // Four corner positions framing the central compass rose cleanly on desktop and fullscreen viewports
  const candleSpecs = [
    { x: -10.8, z: -8.0, variant: 1 as const, flipX: false, scale: 1.08, phase: 0.2, intensity: 18 }, // Top-left
    { x: 10.8, z: -8.0, variant: 2 as const, flipX: true, scale: 1.04, phase: 1.8, intensity: 18 },    // Top-right
    { x: -6.7, z: 5.3, variant: 2 as const, flipX: false, scale: 0.84, phase: 3.4, intensity: 15 },   // Bottom-left
    { x: 6.7, z: 5.3, variant: 1 as const, flipX: true, scale: 0.86, phase: 5.1, intensity: 15 },     // Bottom-right
  ];

  candleSpecs.forEach((cfg) => {
    const candleGroup = new THREE.Group();
    candleGroup.position.set(cfg.x, 0, cfg.z);

    // Soft contact shadow directly under the 3D saucer on the table
    const shadowMesh = new THREE.Mesh(contactShadowGeom, contactShadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.008;
    shadowMesh.scale.setScalar(cfg.scale);
    candleGroup.add(shadowMesh);

    // Warm candlelight pool cast onto the table surface around the saucer
    const tableGlowMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: tableWarmPoolTex,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const tableGlowMesh = new THREE.Mesh(tableWarmPoolGeom, tableGlowMat);
    tableGlowMesh.rotation.x = -Math.PI / 2;
    tableGlowMesh.position.y = 0.011;
    tableGlowMesh.scale.setScalar(cfg.scale);
    candleGroup.add(tableGlowMesh);

    // True 3D hammered bronze saucer resting 100% flat on y = 0
    const dishMesh = new THREE.Mesh(dishGeom, bronzeDishMat);
    dishMesh.scale.setScalar(cfg.scale);
    dishMesh.castShadow = true;
    dishMesh.receiveShadow = true;
    candleGroup.add(dishMesh);

    // Thin wax pool ring inside the center of the saucer where the wax base rests
    const dishPool = new THREE.Mesh(
      trackGeom(new THREE.CylinderGeometry(0.49 * cfg.scale, 0.52 * cfg.scale, 0.025 * cfg.scale, 32)),
      waxDishPoolMat
    );
    dishPool.position.y = 0.075 * cfg.scale;
    dishPool.receiveShadow = true;
    candleGroup.add(dishPool);

    // Upright World-Y photographic wax pillar seated cleanly inside the 3D bronze dish
    const isVar1 = cfg.variant === 1;
    const waxWidth = (isVar1 ? 0.94 : 0.92) * cfg.scale;
    const waxHeight = waxWidth * (isVar1 ? 483 / 273 : 445 / 262) * 1.12;

    const bodyGeom = trackGeom(new THREE.PlaneGeometry(waxWidth, waxHeight));
    bodyGeom.translate(0, waxHeight * 0.5, 0);

    const activeTex = isVar1 ? waxTex1 : waxTex2;
    const bodyMaterial = trackMat(createPhotoCandleBodyMaterial(activeTex, cfg.flipX));
    const billboard = new THREE.Mesh(bodyGeom, bodyMaterial);
    // Seated cleanly onto the dish center floor above y=0 so zero clipping ever occurs
    billboard.position.set(0, 0.07 * cfg.scale, 0);
    billboard.renderOrder = 2;
    candleGroup.add(billboard);

    // Pin animated real flame photograph directly onto the measured wick ember tip
    const wickU = isVar1 ? 0.0678 : 0.0687;
    const wickV = isVar1 ? 0.7888 : 0.9124;
    const wickLocalX = (cfg.flipX ? -wickU : wickU) * waxWidth;
    const wickLocalY = wickV * waxHeight;

    const flameH = 0.78 * cfg.scale;
    const flameW = 0.68 * cfg.scale;
    const flameGeom = trackGeom(new THREE.PlaneGeometry(flameW, flameH));
    flameGeom.translate(0, flameH * (0.5 - 0.044), 0);

    const flameMaterial = trackMat(createPhotoFlameMaterial(flameTex, cfg.phase, cfg.flipX));
    const flameMesh = new THREE.Mesh(flameGeom, flameMaterial);
    flameMesh.position.set(wickLocalX, wickLocalY - 0.02 * cfg.scale, 0.03);
    flameMesh.renderOrder = 4;
    billboard.add(flameMesh);

    const haloMat = trackMat(
      new THREE.SpriteMaterial({
        map: haloTexture,
        color: '#ffab4c',
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.position.set(wickLocalX, wickLocalY + flameH * 0.38, 0.015);
    haloSprite.scale.set(1.55 * cfg.scale, 1.85 * cfg.scale, 1);
    haloSprite.renderOrder = 3;
    billboard.add(haloSprite);

    const baseLightPos = new THREE.Vector3(0, wickLocalY + 0.42 * cfg.scale, 0);
    const candleLight = new THREE.PointLight('#ff9838', cfg.intensity, 23, 1.75);
    candleLight.position.copy(baseLightPos);
    candleGroup.add(candleLight);

    group.add(candleGroup);
    candleRigs.push({
      worldX: cfg.x,
      worldZ: cfg.z,
      billboard,
      bodyMaterial,
      flameMaterial,
      haloSprite,
      tableGlowMat,
      light: candleLight,
      baseIntensity: cfg.intensity,
      baseLightPos,
      phase: cfg.phase,
    });
  });

  // 4. Museum-grade static 3D antique mariner's brass pocket compass (zero billboarding)
  const compassGroup = new THREE.Group();
  compassGroup.position.set(-8.55, 0, -1.55);
  compassGroup.rotation.y = -0.36;

  // Soft contact shadow elongated slightly to match the open lid
  const compassShadow = new THREE.Mesh(contactShadowGeom, contactShadowMat);
  compassShadow.rotation.x = -Math.PI / 2;
  compassShadow.position.set(-0.22, 0.007, 0);
  compassShadow.scale.set(1.38, 1.18, 1);
  compassGroup.add(compassShadow);

  const compassBrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#cfa34c',
      map: bronzeTexs.map,
      bumpMap: bronzeTexs.bumpMap,
      bumpScale: 0.007,
      roughness: 0.27,
      metalness: 0.91,
    })
  );
  const compassPolishedBrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#e5bf68',
      roughness: 0.18,
      metalness: 0.95,
    })
  );

  // Turned brass lower pocket case resting flush on y = 0
  const caseProfile = [
    new THREE.Vector2(0, 0.002),
    new THREE.Vector2(0.84, 0.002),
    new THREE.Vector2(0.97, 0.032),
    new THREE.Vector2(1.035, 0.092),
    new THREE.Vector2(1.05, 0.145),
    new THREE.Vector2(1.005, 0.17),
    new THREE.Vector2(1.005, 0.205),
    new THREE.Vector2(1.05, 0.232),
    new THREE.Vector2(1.04, 0.298),
    new THREE.Vector2(0.985, 0.316),
    new THREE.Vector2(0.91, 0.316),
    new THREE.Vector2(0.895, 0.232),
    new THREE.Vector2(0, 0.232),
  ];
  const compassCaseMesh = new THREE.Mesh(
    trackGeom(new THREE.LatheGeometry(caseProfile, 64)),
    compassBrassMat
  );
  compassCaseMesh.castShadow = true;
  compassCaseMesh.receiveShadow = true;
  compassGroup.add(compassCaseMesh);

  // Polished upper brass bezel & 48 instanced knurled grip ridges
  const compassBezel = new THREE.Mesh(
    trackGeom(new THREE.TorusGeometry(0.992, 0.044, 16, 64)),
    compassPolishedBrassMat
  );
  compassBezel.rotation.x = Math.PI / 2;
  compassBezel.position.y = 0.305;
  compassBezel.castShadow = true;
  compassBezel.receiveShadow = true;
  compassGroup.add(compassBezel);

  const knurlCount = 48;
  const knurlGeom = trackGeom(new THREE.BoxGeometry(0.024, 0.072, 0.028));
  const knurlInstanced = new THREE.InstancedMesh(knurlGeom, compassPolishedBrassMat, knurlCount);
  const knurlDummy = new THREE.Object3D();
  for (let k = 0; k < knurlCount; k++) {
    const a = (k / knurlCount) * Math.PI * 2;
    knurlDummy.position.set(Math.cos(a) * 1.044, 0.266, Math.sin(a) * 1.044);
    knurlDummy.rotation.set(0, -a, 0);
    knurlDummy.updateMatrix();
    knurlInstanced.setMatrixAt(k, knurlDummy.matrix);
  }
  knurlInstanced.instanceMatrix.needsUpdate = true;
  knurlInstanced.computeBoundingSphere();
  knurlInstanced.castShadow = true;
  compassGroup.add(knurlInstanced);

  // Stepped inner chapter bezel sloping gently down to the engraved dial
  const chapterProfile = [
    new THREE.Vector2(0.915, 0.304),
    new THREE.Vector2(0.865, 0.236),
    new THREE.Vector2(0.898, 0.236),
    new THREE.Vector2(0.92, 0.304),
  ];
  const chapterRing = new THREE.Mesh(
    trackGeom(new THREE.LatheGeometry(chapterProfile, 64)),
    compassPolishedBrassMat
  );
  chapterRing.receiveShadow = true;
  compassGroup.add(chapterRing);

  // Winding stem, turned onion crown & articulated bow ring resting toward the table
  const stemMesh = new THREE.Mesh(
    trackGeom(new THREE.CylinderGeometry(0.078, 0.098, 0.22, 16)),
    compassBrassMat
  );
  stemMesh.rotation.x = Math.PI / 2;
  stemMesh.position.set(0, 0.165, -1.07);
  stemMesh.castShadow = true;
  compassGroup.add(stemMesh);

  const crownProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.095, 0.015),
    new THREE.Vector2(0.145, 0.055),
    new THREE.Vector2(0.135, 0.098),
    new THREE.Vector2(0.075, 0.13),
    new THREE.Vector2(0, 0.136),
  ];
  const crownMesh = new THREE.Mesh(
    trackGeom(new THREE.LatheGeometry(crownProfile, 24)),
    compassPolishedBrassMat
  );
  crownMesh.rotation.x = -Math.PI / 2;
  crownMesh.position.set(0, 0.165, -1.16);
  crownMesh.castShadow = true;
  compassGroup.add(crownMesh);

  const bowPivot = new THREE.Group();
  bowPivot.position.set(0, 0.165, -1.21);
  bowPivot.rotation.x = 0.26;
  const bowMesh = new THREE.Mesh(
    trackGeom(new THREE.TorusGeometry(0.195, 0.034, 14, 32)),
    compassPolishedBrassMat
  );
  bowMesh.rotation.x = Math.PI / 2;
  bowMesh.position.set(0, 0, -0.175);
  bowMesh.castShadow = true;
  bowPivot.add(bowMesh);
  compassGroup.add(bowPivot);

  // Three-knuckle barrel hinge & open hinged brass lid tilted back-left
  const hingeGroup = new THREE.Group();
  hingeGroup.position.set(-1.035, 0.295, 0);
  [-0.14, 0, 0.14].forEach((hz, idx) => {
    const knuckle = new THREE.Mesh(
      trackGeom(new THREE.CylinderGeometry(0.042, 0.042, 0.085, 16)),
      idx === 1 ? compassPolishedBrassMat : compassBrassMat
    );
    knuckle.rotation.x = Math.PI / 2;
    knuckle.position.z = hz;
    knuckle.castShadow = true;
    hingeGroup.add(knuckle);
  });
  compassGroup.add(hingeGroup);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(-1.035, 0.295, 0);
  lidPivot.rotation.z = 1.92; // Open ~110 deg toward back-left

  const lidCenter = new THREE.Group();
  lidCenter.position.set(1.035, 0, 0);

  const lidShellProfile = [
    new THREE.Vector2(1.02, 0),
    new THREE.Vector2(1.02, 0.058),
    new THREE.Vector2(0.95, 0.115),
    new THREE.Vector2(0.65, 0.155),
    new THREE.Vector2(0, 0.172),
    new THREE.Vector2(0, 0.032),
    new THREE.Vector2(0.91, 0.032),
    new THREE.Vector2(0.96, 0),
  ];
  const lidShellMesh = new THREE.Mesh(
    trackGeom(new THREE.LatheGeometry(lidShellProfile, 56)),
    compassBrassMat
  );
  lidShellMesh.castShadow = true;
  lidShellMesh.receiveShadow = true;
  lidCenter.add(lidShellMesh);

  const lidRim = new THREE.Mesh(
    trackGeom(new THREE.TorusGeometry(0.975, 0.032, 12, 56)),
    compassPolishedBrassMat
  );
  lidRim.rotation.x = Math.PI / 2;
  lidRim.position.y = 0.012;
  lidCenter.add(lidRim);

  const engravedLidTexs = createEngravedLidTexture(maxAnisotropy);
  trackTex(engravedLidTexs.map);
  trackTex(engravedLidTexs.bumpMap);
  const innerLidPlate = new THREE.Mesh(
    trackGeom(new THREE.CircleGeometry(0.91, 48)),
    trackMat(
      new THREE.MeshStandardMaterial({
        map: engravedLidTexs.map,
        bumpMap: engravedLidTexs.bumpMap,
        bumpScale: 0.008,
        roughness: 0.28,
        metalness: 0.88,
      })
    )
  );
  innerLidPlate.rotation.x = Math.PI / 2;
  innerLidPlate.position.y = 0.026;
  lidCenter.add(innerLidPlate);

  lidPivot.add(lidCenter);
  compassGroup.add(lidPivot);

  // High-resolution engraved ivory & gold-leaf dial face
  const dialTexs = createRealisticCompassDialTextures(maxAnisotropy);
  trackTex(dialTexs.map);
  trackTex(dialTexs.bumpMap);
  const dialMesh = new THREE.Mesh(
    trackGeom(new THREE.CircleGeometry(0.895, 64)),
    trackMat(
      new THREE.MeshStandardMaterial({
        map: dialTexs.map,
        bumpMap: dialTexs.bumpMap,
        bumpScale: 0.006,
        roughness: 0.56,
        metalness: 0.06,
      })
    )
  );
  dialMesh.rotation.x = -Math.PI / 2;
  dialMesh.position.y = 0.236;
  dialMesh.receiveShadow = true;
  compassGroup.add(dialMesh);

  // True 3D sculpted dual-metal compass needle on center jewel bearing
  const needlePivot = new THREE.Group();
  needlePivot.position.y = 0.264;
  // Counter-rotate slightly so the magnetic needle points convincingly toward tabletop North
  needlePivot.rotation.y = 0.36;

  const northShape = new THREE.Shape();
  northShape.moveTo(0, 0.72);
  northShape.lineTo(0.064, 0.05);
  northShape.lineTo(0, 0);
  northShape.lineTo(-0.064, 0.05);
  northShape.closePath();

  const northGeom = trackGeom(
    new THREE.ExtrudeGeometry(northShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    })
  );
  northGeom.rotateX(-Math.PI / 2);

  const northNeedle = new THREE.Mesh(
    northGeom,
    trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1b3b6f',
        roughness: 0.18,
        metalness: 0.88,
      })
    )
  );
  northNeedle.castShadow = true;
  needlePivot.add(northNeedle);

  const southShape = new THREE.Shape();
  southShape.moveTo(0, -0.66);
  southShape.lineTo(0.058, -0.05);
  southShape.lineTo(0, 0);
  southShape.lineTo(-0.058, -0.05);
  southShape.closePath();

  const southGeom = trackGeom(
    new THREE.ExtrudeGeometry(southShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    })
  );
  southGeom.rotateX(-Math.PI / 2);

  const southNeedle = new THREE.Mesh(
    southGeom,
    trackMat(
      new THREE.MeshStandardMaterial({
        color: '#9b2424',
        roughness: 0.24,
        metalness: 0.65,
      })
    )
  );
  southNeedle.castShadow = true;
  needlePivot.add(southNeedle);

  const spindleMesh = new THREE.Mesh(
    trackGeom(new THREE.CylinderGeometry(0.068, 0.088, 0.048, 20)),
    compassPolishedBrassMat
  );
  spindleMesh.position.y = -0.004;
  needlePivot.add(spindleMesh);

  const jewelCapMesh = new THREE.Mesh(
    trackGeom(new THREE.SphereGeometry(0.044, 18, 14)),
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: '#991b1b',
        emissive: '#330505',
        emissiveIntensity: 0.25,
        roughness: 0.08,
        metalness: 0.1,
        clearcoat: 1,
      })
    )
  );
  jewelCapMesh.position.y = 0.022;
  jewelCapMesh.scale.set(1, 0.55, 1);
  needlePivot.add(jewelCapMesh);

  compassGroup.add(needlePivot);

  // Domed optical crystal glass cover seated smoothly inside the upper bezel
  const glassDomeRadius = 4.2;
  const glassDomeTheta = 0.218;
  const glassDome = new THREE.Mesh(
    trackGeom(new THREE.SphereGeometry(glassDomeRadius, 48, 16, 0, Math.PI * 2, 0, glassDomeTheta)),
    trackMat(
      new THREE.MeshPhysicalMaterial({
        color: '#fffef8',
        roughness: 0.04,
        metalness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      })
    )
  );
  glassDome.position.y = 0.305 - glassDomeRadius * Math.cos(glassDomeTheta);
  glassDome.renderOrder = 2;
  compassGroup.add(glassDome);

  group.add(compassGroup);

  // 5. Realistic static 3D gold & silver minted coins (two organic clusters, zero billboarding)
  const milledBumpTex = trackTex(createMilledEdgeBumpTexture(maxAnisotropy));
  const goldTexs = createMintedCoinTextures('gold', maxAnisotropy);
  trackTex(goldTexs.map);
  trackTex(goldTexs.bumpMap);
  trackTex(goldTexs.roughnessMap);

  const silverTexs = createMintedCoinTextures('silver', maxAnisotropy);
  trackTex(silverTexs.map);
  trackTex(silverTexs.bumpMap);
  trackTex(silverTexs.roughnessMap);

  const goldSideMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#d8a638',
      bumpMap: milledBumpTex,
      bumpScale: 0.014,
      roughness: 0.24,
      metalness: 0.94,
    })
  );
  const goldFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: goldTexs.map,
      bumpMap: goldTexs.bumpMap,
      bumpScale: 0.018,
      roughnessMap: goldTexs.roughnessMap,
      roughness: 1.0,
      metalness: 0.94,
    })
  );
  const goldMats = [goldSideMat, goldFaceMat, goldFaceMat];

  const silverSideMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#c2cbd6',
      bumpMap: milledBumpTex,
      bumpScale: 0.012,
      roughness: 0.27,
      metalness: 0.92,
    })
  );
  const silverFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: silverTexs.map,
      bumpMap: silverTexs.bumpMap,
      bumpScale: 0.016,
      roughnessMap: silverTexs.roughnessMap,
      roughness: 1.0,
      metalness: 0.92,
    })
  );
  const silverMats = [silverSideMat, silverFaceMat, silverFaceMat];

  const goldRadius = 0.295;
  const goldHeight = 0.052;
  const goldCoinGeom = trackGeom(new THREE.CylinderGeometry(goldRadius, goldRadius, goldHeight, 36));

  const silverRadius = 0.265;
  const silverHeight = 0.044;
  const silverCoinGeom = trackGeom(new THREE.CylinderGeometry(silverRadius, silverRadius, silverHeight, 36));

  const addCoinStack = (
    parent: THREE.Group,
    x: number,
    z: number,
    count: number,
    metal: 'gold' | 'silver',
    seed: number
  ) => {
    const geom = metal === 'gold' ? goldCoinGeom : silverCoinGeom;
    const mats = metal === 'gold' ? goldMats : silverMats;
    const h = metal === 'gold' ? goldHeight : silverHeight;
    let curX = x;
    let curZ = z;
    for (let i = 0; i < count; i++) {
      const s1 = Math.sin((seed + i * 17) * 12.9898) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin((seed + i * 31) * 78.233) * 43758.5453;
      const r2 = s2 - Math.floor(s2);
      const s3 = Math.sin((seed + i * 53) * 45.164) * 43758.5453;
      const r3 = s3 - Math.floor(s3);

      curX += (r1 - 0.5) * 0.024;
      curZ += (r2 - 0.5) * 0.024;

      const coin = new THREE.Mesh(geom, mats);
      coin.position.set(curX, h * 0.5 + i * h + 0.002, curZ);
      coin.rotation.y = r3 * Math.PI * 2;
      coin.castShadow = true;
      coin.receiveShadow = true;
      parent.add(coin);
    }
  };

  const addFlatOrTiltedCoin = (
    parent: THREE.Group,
    x: number,
    z: number,
    metal: 'gold' | 'silver',
    yaw: number,
    tilt = 0
  ) => {
    const geom = metal === 'gold' ? goldCoinGeom : silverCoinGeom;
    const mats = metal === 'gold' ? goldMats : silverMats;
    const r = metal === 'gold' ? goldRadius : silverRadius;
    const h = metal === 'gold' ? goldHeight : silverHeight;

    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z);
    pivot.rotation.y = yaw;

    const coin = new THREE.Mesh(geom, mats);
    const absTilt = Math.abs(tilt);
    coin.position.y = r * Math.sin(absTilt) + h * 0.5 * Math.cos(absTilt) + 0.002;
    coin.rotation.x = tilt;
    coin.castShadow = true;
    coin.receiveShadow = true;
    pivot.add(coin);
    parent.add(pivot);
  };

  // 5a. Main Treasure Hoard (Upper-right edge)
  const rightHoard = new THREE.Group();
  rightHoard.position.set(4.35, 0, -8.35);

  const rightShadow = new THREE.Mesh(contactShadowGeom, contactShadowMat);
  rightShadow.rotation.x = -Math.PI / 2;
  rightShadow.position.set(0.05, 0.007, 0.08);
  rightShadow.scale.set(1.55, 1.22, 1);
  rightHoard.add(rightShadow);

  addCoinStack(rightHoard, -0.32, -0.15, 9, 'gold', 1);
  addCoinStack(rightHoard, 0.34, -0.05, 7, 'silver', 2);
  addCoinStack(rightHoard, -0.82, 0.28, 5, 'gold', 3);
  addCoinStack(rightHoard, 0.16, 0.52, 4, 'silver', 4);

  // Leaning coins resting naturally against the stacks
  addFlatOrTiltedCoin(rightHoard, -0.04, 0.14, 'gold', 0.45, 0.48);
  addFlatOrTiltedCoin(rightHoard, 0.63, 0.12, 'silver', -1.15, 0.52);
  addFlatOrTiltedCoin(rightHoard, -0.58, 0.56, 'silver', 0.18, 0.44);
  addFlatOrTiltedCoin(rightHoard, -0.34, -0.45, 'gold', 2.95, 0.42);

  // Organic scattered & slightly overlapping loose coins
  addFlatOrTiltedCoin(rightHoard, 0.85, 0.54, 'gold', 0.8, 0);
  addFlatOrTiltedCoin(rightHoard, 0.58, 0.86, 'silver', 1.9, 0.11);
  addFlatOrTiltedCoin(rightHoard, -0.15, 0.96, 'gold', 2.4, 0);
  addFlatOrTiltedCoin(rightHoard, -0.96, 0.82, 'silver', 0.3, 0);
  addFlatOrTiltedCoin(rightHoard, -1.28, 0.34, 'gold', 1.4, 0.09);
  addFlatOrTiltedCoin(rightHoard, 1.18, -0.22, 'silver', 2.7, 0);
  addFlatOrTiltedCoin(rightHoard, -0.95, -0.58, 'silver', 0.9, 0);
  addFlatOrTiltedCoin(rightHoard, 0.72, -0.58, 'gold', 1.1, 0);

  group.add(rightHoard);

  // 5b. Companion Coin Clump (Upper-left edge)
  const leftHoard = new THREE.Group();
  leftHoard.position.set(-4.4, 0, -8.5);

  const leftShadow = new THREE.Mesh(contactShadowGeom, contactShadowMat);
  leftShadow.rotation.x = -Math.PI / 2;
  leftShadow.position.set(0.04, 0.007, 0.06);
  leftShadow.scale.set(1.28, 1.04, 1);
  leftHoard.add(leftShadow);

  addCoinStack(leftHoard, -0.18, -0.08, 6, 'silver', 11);
  addCoinStack(leftHoard, 0.38, 0.08, 4, 'gold', 12);

  addFlatOrTiltedCoin(leftHoard, 0.10, 0.22, 'gold', -0.42, 0.46);
  addFlatOrTiltedCoin(leftHoard, -0.48, 0.18, 'silver', 1.05, 0.44);

  addFlatOrTiltedCoin(leftHoard, 0.76, 0.38, 'silver', 0.6, 0);
  addFlatOrTiltedCoin(leftHoard, 0.12, 0.74, 'gold', 2.1, 0.10);
  addFlatOrTiltedCoin(leftHoard, -0.62, 0.62, 'gold', 1.3, 0);
  addFlatOrTiltedCoin(leftHoard, -0.82, -0.26, 'silver', 2.8, 0);
  addFlatOrTiltedCoin(leftHoard, 0.56, -0.42, 'gold', 0.2, 0);

  group.add(leftHoard);

  return {
    group,
    updateSurface(surface: TableSurface) {
      const nextPBR = getSurfacePBR(surface);

      const nextFullTex = createFullTableSurfaceTexture(surface, maxAnisotropy);
      if (fullTableMat.map) fullTableMat.map.dispose();
      fullTableMat.map = nextFullTex;
      currentFullTableTex = nextFullTex;
      fullTableMat.roughness = nextPBR.roughness;
      fullTableMat.metalness = nextPBR.metalness;
      fullTableMat.needsUpdate = true;

      const nextCompassTex = createCompassOverlayTexture(surface, maxAnisotropy);
      if (compassOverlayMat.map) compassOverlayMat.map.dispose();
      compassOverlayMat.map = nextCompassTex;
      currentCompassTex = nextCompassTex;
      compassOverlayMat.roughness = nextPBR.roughness;
      compassOverlayMat.metalness = nextPBR.metalness;
      compassOverlayMat.needsUpdate = true;
    },
    updateAnimation(elapsedTime: number, camera?: THREE.Camera) {

      for (let i = 0; i < candleRigs.length; i++) {
        const rig = candleRigs[i];
        if (camera) {
          // Rotate ONLY around World Y so every candle stands strictly vertical on the table
          const dx = camera.position.x - rig.worldX;
          const dz = camera.position.z - rig.worldZ;
          rig.billboard.rotation.set(0, Math.atan2(dx, dz), 0);
        }

        const t = elapsedTime + rig.phase;
        const flicker =
          Math.sin(t * 7.1) * 0.065 +
          Math.sin(t * 13.4 + 1.2) * 0.045 +
          Math.cos(t * 4.3) * 0.035;

        rig.flameMaterial.uniforms.uTime.value = elapsedTime;
        rig.flameMaterial.uniforms.uFlicker.value = flicker;
        rig.bodyMaterial.uniforms.uFlicker.value = flicker;

        rig.haloSprite.material.opacity = 0.25 + flicker * 0.6;
        const haloScale = 1.52 + flicker * 0.45;
        rig.haloSprite.scale.set(haloScale, haloScale * 1.18, 1);

        rig.tableGlowMat.opacity = 0.62 + flicker * 0.85;
        rig.light.intensity = rig.baseIntensity * (1 + flicker * 1.2);
        rig.light.position.set(
          rig.baseLightPos.x + Math.sin(t * 6.2) * 0.035,
          rig.baseLightPos.y + Math.cos(t * 8.1) * 0.025,
          rig.baseLightPos.z + Math.cos(t * 5.4) * 0.035
        );
      }
    },
    dispose() {
      currentFullTableTex.dispose();
      currentCompassTex.dispose();
      disposableGeoms.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      disposableTexs.forEach((t) => t.dispose());
    },
  };
}
