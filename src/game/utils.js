import * as THREE from 'three';

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const randRange = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(randRange(min, max + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const TAU = Math.PI * 2;

/** Returns true when `a` is within `threshold` radians of `b` (shortest path). */
export function angleWithin(a, b, threshold) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return Math.abs(d) <= threshold;
}

/** Squared distance on the XZ plane — cheaper than Vector3.distanceTo for comparisons. */
export function dist2XZ(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Builds a billboard sprite with text drawn on a canvas — used for the
 * cost badges on build pads ("40") and the wave banner.
 */
export function makeLabelSprite(text, opts = {}) {
  const {
    color = '#ffffff',
    background = null,
    border = null,
    font = 'bold',
    fontSize = 64,
    padding = 28,
    radius = 26,
    worldHeight = 1.6,
  } = opts;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSpec = `${font} ${fontSize}px "Trebuchet MS", "Verdana", sans-serif`;

  ctx.font = fontSpec;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + padding * 2);
  const h = Math.ceil(fontSize * 1.5 + padding * 0.6);
  canvas.width = w;
  canvas.height = h;

  ctx.font = fontSpec;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (background || border) {
    const r = Math.min(radius, h / 2);
    roundRect(ctx, padding * 0.35, padding * 0.3, w - padding * 0.7, h - padding * 0.6, r);
    if (background) {
      ctx.fillStyle = background;
      ctx.fill();
    }
    if (border) {
      ctx.lineWidth = 10;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
  }

  // Chunky cartoon outline, matching the reference typography.
  ctx.lineWidth = 12;
  ctx.strokeStyle = opts.outline ?? 'rgba(0,0,0,0.55)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((w / h) * worldHeight, worldHeight, 1);
  sprite.userData.isLabel = true;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Shared standard material factory so the whole scene stays in one art style. */
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true,
    ...opts,
  });
}

/** Adds a mesh to `parent` and wires up shadow flags in one call. */
export function add(parent, mesh, { cast = true, receive = false } = {}) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

/** Deterministic pseudo-random generator — keeps the map layout stable per seed. */
export function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
