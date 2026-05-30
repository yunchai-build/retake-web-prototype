import { polyContains } from '../utils/imageProcessing.js';

export const DEFAULT_SELECTION_BRUSH_RADIUS = 16;
export const MIN_SELECTION_BRUSH_RADIUS = 4;
export const MAX_SELECTION_BRUSH_RADIUS = 48;
export const MIN_SMART_SELECTION_POINTS = 5;

export function cloneMask(mask) {
  return mask ? new Uint8Array(mask) : null;
}

export function countMask(mask) {
  if (!mask) return 0;
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) count += 1;
  }
  return count;
}

export function maskIsUseful(mask, total, { allowFull = true } = {}) {
  if (!mask || !total) return false;
  const count = countMask(mask);
  if (count < total * 0.01) return false;
  if (!allowFull && count > total * 0.92) return false;
  return true;
}

export function createEmptyMask(width, height) {
  return new Uint8Array(width * height);
}

export function createFullMask(width, height) {
  const mask = createEmptyMask(width, height);
  mask.fill(1);
  return mask;
}

export function mergeMasks(base, addition) {
  if (!base && addition) return cloneMask(addition);
  if (!base || !addition) return base;
  const next = cloneMask(base);
  for (let i = 0; i < next.length; i += 1) {
    if (addition[i]) next[i] = 1;
  }
  return next;
}

export function subtractMasks(base, subtraction) {
  if (!base) return base;
  if (!subtraction) return cloneMask(base);
  const next = cloneMask(base);
  for (let i = 0; i < next.length; i += 1) {
    if (subtraction[i]) next[i] = 0;
  }
  return next;
}

export function applyMaskOperation(base, change, operation) {
  return operation === 'erase'
    ? subtractMasks(base, change)
    : mergeMasks(base, change);
}

export function buildCenterSmartPolygon(width, height) {
  return [
    [width * 0.14, height * 0.08],
    [width * 0.86, height * 0.08],
    [width * 0.94, height * 0.9],
    [width * 0.06, height * 0.9],
  ];
}

export function buildPolyMask(width, height, points) {
  if (!points || points.length < 3) return null;
  const poly = points.map(point => [point.x, point.y]);
  const mask = createEmptyMask(width, height);
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  poly.forEach(([x, y]) => {
    minX = Math.min(minX, Math.floor(x));
    maxX = Math.max(maxX, Math.ceil(x));
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  });
  minX = Math.max(0, minX);
  maxX = Math.min(width - 1, maxX);
  minY = Math.max(0, minY);
  maxY = Math.min(height - 1, maxY);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (polyContains(x + 0.5, y + 0.5, poly)) mask[y * width + x] = 1;
    }
  }
  return mask;
}

export function paintMaskCircle(mask, width, height, point, radius, value) {
  if (!mask || !point) return;
  const r = Math.max(1, radius);
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(point.x - r));
  const x1 = Math.min(width - 1, Math.ceil(point.x + r));
  const y0 = Math.max(0, Math.floor(point.y - r));
  const y1 = Math.min(height - 1, Math.ceil(point.y + r));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - point.x;
      const dy = y - point.y;
      if (dx * dx + dy * dy <= r2) mask[y * width + x] = value;
    }
  }
}

export function paintMaskLine(mask, width, height, from, to, radius, value) {
  if (!from || !to) return;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(2, radius * 0.45)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    paintMaskCircle(
      mask,
      width,
      height,
      {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      },
      radius,
      value
    );
  }
}

export function shapeBounds(a, b) {
  if (!a || !b) return null;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  if (width < 4 || height < 4) return null;
  return { x, y, width, height };
}

export function drawShapePath(ctx, shape, bounds) {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  if (shape === 'circle') {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    return;
  }

  if (shape === 'square') {
    ctx.rect(x, y, width, height);
    return;
  }

  if (shape === 'star') {
    const points = 5;
    for (let i = 0; i < points * 2; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / points;
      const scale = i % 2 === 0 ? 1 : 0.42;
      const px = cx + Math.cos(angle) * rx * scale;
      const py = cy + Math.sin(angle) * ry * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }

  const petals = 6;
  for (let i = 0; i < petals; i += 1) {
    const angle = (i / petals) * Math.PI * 2;
    const px = cx + Math.cos(angle) * rx * 0.42;
    const py = cy + Math.sin(angle) * ry * 0.42;
    ctx.moveTo(px + Math.cos(angle) * rx * 0.36, py + Math.sin(angle) * ry * 0.36);
    ctx.ellipse(px, py, rx * 0.34, ry * 0.22, angle, 0, Math.PI * 2);
  }
  ctx.moveTo(cx + rx * 0.22, cy);
  ctx.ellipse(cx, cy, rx * 0.22, ry * 0.22, 0, 0, Math.PI * 2);
}

export function buildShapeMask(width, height, shape, bounds) {
  if (!bounds) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  drawShapePath(ctx, shape, bounds);
  ctx.fill('nonzero');
  const alpha = ctx.getImageData(0, 0, width, height).data;
  const mask = createEmptyMask(width, height);
  for (let i = 0; i < mask.length; i += 1) {
    if (alpha[i * 4 + 3] > 0) mask[i] = 1;
  }
  return mask;
}

export function maskBounds(mask, width, height) {
  if (!mask) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function exportMaskedPng(sourceCanvas, mask, sourceWidth, sourceHeight) {
  const bounds = maskBounds(mask, sourceWidth, sourceHeight);
  if (!sourceCanvas || !bounds) return null;

  const out = document.createElement('canvas');
  out.width = bounds.width;
  out.height = bounds.height;
  const outCtx = out.getContext('2d', { willReadFrequently: true });
  outCtx.drawImage(
    sourceCanvas,
    bounds.minX,
    bounds.minY,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );

  const id = outCtx.getImageData(0, 0, bounds.width, bounds.height);
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const maskIdx = (bounds.minY + y) * sourceWidth + bounds.minX + x;
      if (!mask[maskIdx]) id.data[(y * bounds.width + x) * 4 + 3] = 0;
    }
  }
  outCtx.putImageData(id, 0, 0);
  return {
    src: out.toDataURL('image/png'),
    width: bounds.width,
    height: bounds.height,
    bounds,
  };
}
