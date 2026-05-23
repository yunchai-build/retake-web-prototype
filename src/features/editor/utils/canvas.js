/** Resolve after `ms` milliseconds. */
export const delay = (ms) => new Promise(r => setTimeout(r, ms));

export const MAGIC_SELECTION_DASH_CYCLE = 11;

const MAGIC_SELECTION_STROKE = {
  color: 'rgba(255,255,255,0.92)',
  dash: [7, 4],
  width: 2,
};

export function drawMagicSelectionStroke(ctx, {
  points,
  closed = false,
  dashOffset = 0,
  drawPath,
} = {}) {
  if (!ctx) return false;
  if (!drawPath && (!points || points.length < 2)) return false;

  ctx.save();
  ctx.strokeStyle = MAGIC_SELECTION_STROKE.color;
  ctx.lineWidth = MAGIC_SELECTION_STROKE.width;
  ctx.setLineDash(MAGIC_SELECTION_STROKE.dash);
  ctx.lineDashOffset = -dashOffset;
  ctx.beginPath();

  if (drawPath) {
    drawPath(ctx);
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (closed) ctx.closePath();
  }

  ctx.stroke();
  ctx.restore();
  return true;
}

/** Convert a data-URL string to a Blob. */
export function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Get canvas-space [x, y] from a mouse or first-touch event.
 * Accounts for any CSS scaling of the canvas element.
 */
export function getPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return [(src.clientX - rect.left) * scaleX, (src.clientY - rect.top) * scaleY];
}

/** Render an emoji string onto a 120×120 canvas and return a data-URL. */
export function emojiToDataURL(emoji) {
  const c = document.createElement('canvas');
  c.width = 120; c.height = 120;
  const ctx = c.getContext('2d');
  ctx.font = '90px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 60, 66);
  return c.toDataURL();
}

/**
 * Load an image from a src string and resolve to an HTMLImageElement.
 * Rejects after `timeoutMs` (default 3000) if it doesn't load.
 */
export function loadImage(src, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (typeof src === 'string' && /^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    const timer = setTimeout(() => reject(new Error('Image load timeout')), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Image load error')); };
    img.src = src;
  });
}

function getSourceSize(source, fallbackWidth, fallbackHeight) {
  return {
    width: source.videoWidth || source.naturalWidth || source.width || fallbackWidth,
    height: source.videoHeight || source.naturalHeight || source.height || fallbackHeight,
  };
}

/** Sample an image's average visible color, falling back to Retake canvas color. */
export function getAverageImageColor(image, fallback = '#F7F5F2') {
  try {
    const { width, height } = getSourceSize(image, 1, 1);
    if (!width || !height) return fallback;

    const sampleSize = 24;
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, sampleSize, sampleSize);
    ctx.drawImage(image, 0, 0, sampleSize, sampleSize);

    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
    let r = 0, g = 0, b = 0, weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      if (alpha <= 0.04) continue;
      r += data[i] * alpha;
      g += data[i + 1] * alpha;
      b += data[i + 2] * alpha;
      weight += alpha;
    }
    if (!weight) return fallback;
    return `rgb(${Math.round(r / weight)}, ${Math.round(g / weight)}, ${Math.round(b / weight)})`;
  } catch {
    return fallback;
  }
}

function getFitScale(fit, sourceWidth, sourceHeight, width, height) {
  if (fit === 'width') return width / sourceWidth;
  if (fit === 'height') return height / sourceHeight;
  if (fit === 'cover') return Math.max(width / sourceWidth, height / sourceHeight);
  if (fit === 'portrait-height') {
    return sourceHeight > sourceWidth
      ? height / sourceHeight
      : width / sourceWidth;
  }
  return Math.min(width / sourceWidth, height / sourceHeight);
}

function clampPortraitHeightTransform({
  fit,
  sourceWidth,
  sourceHeight,
  height,
  drawWidth,
  drawHeight,
  transformScale,
  offsetY,
  rotation,
  allowZoomOut = false,
}) {
  const isPortraitHeightFit = fit === 'portrait-height' && sourceHeight > sourceWidth;
  if (!isPortraitHeightFit) return { scale: transformScale, offsetY };

  const normalizedRotation = Math.abs(((rotation % 360) + 360) % 360);
  const rotationRadians = normalizedRotation * Math.PI / 180;
  const rotatedHeight = (
    Math.abs(drawWidth * Math.sin(rotationRadians))
    + Math.abs(drawHeight * Math.cos(rotationRadians))
  ) || drawHeight;
  // When allowZoomOut is true we leave the user-controlled scale alone so the
  // photo can shrink below the canvas height. The empty area around it then
  // shows the average-color background filled in drawContainedImageWithBackground.
  const effectiveScale = allowZoomOut
    ? transformScale
    : Math.max(transformScale, height / rotatedHeight);

  const verticalOverflow = Math.max(0, (rotatedHeight * effectiveScale - height) / 2);
  // When the photo is smaller than the canvas, also allow vertical offset within
  // the canvas (so the user can drag the photo around its empty backdrop).
  const verticalSlack = allowZoomOut && effectiveScale * rotatedHeight < height
    ? (height - effectiveScale * rotatedHeight) / 2
    : verticalOverflow;
  return {
    scale: effectiveScale,
    offsetY: Math.max(-verticalSlack, Math.min(verticalSlack, offsetY)),
  };
}

/** Draw the source centered inside the canvas, with average-color letterboxing when the selected fit allows it. */
export function drawContainedImageWithBackground(ctx, image, width, height, options = '#F7F5F2') {
  const {
    fallback = '#F7F5F2',
    backgroundColor,
    fit = 'contain',
    transform = {},
    allowZoomOut = false,
  } = typeof options === 'string' ? { fallback: options } : options;
  const {
    scale: transformScale = 1,
    rotation = 0,
    offsetX = 0,
    offsetY = 0,
    mirror = false,
  } = transform;
  const { width: sourceWidth, height: sourceHeight } = getSourceSize(image, width, height);
  const scale = getFitScale(fit, sourceWidth, sourceHeight, width, height);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const dx = (width - drawWidth) / 2;
  const dy = (height - drawHeight) / 2;
  const safeTransform = clampPortraitHeightTransform({
    fit,
    sourceWidth,
    sourceHeight,
    height,
    drawWidth,
    drawHeight,
    transformScale,
    offsetY,
    rotation,
    allowZoomOut,
  });

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = backgroundColor || getAverageImageColor(image, fallback);
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  // Use the highest-quality smoothing browsers offer. Without this, scaling
  // photos down (zoom-out / small thumbnails) produces visible staircase
  // aliasing on near-horizontal lines — especially noticeable on mobile.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(width / 2 + offsetX, height / 2 + safeTransform.offsetY);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale((mirror ? -1 : 1) * safeTransform.scale, safeTransform.scale);
  ctx.drawImage(
    image,
    0,
    0,
    sourceWidth,
    sourceHeight,
    dx - width / 2,
    dy - height / 2,
    drawWidth,
    drawHeight
  );
  ctx.restore();
}

/** Draw a cover-fit media source with user transform applied in canvas space. */
export function drawMediaCoverWithTransform(ctx, source, width, height, transform = {}) {
  const {
    scale = 1,
    rotation = 0,
    offsetX = 0,
    offsetY = 0,
    mirror = false,
  } = transform;
  const { width: sourceWidth, height: sourceHeight } = getSourceSize(source, width, height);
  const baseScale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * baseScale;
  const drawHeight = sourceHeight * baseScale;

  ctx.save();
  // Match the high-quality smoothing used in drawContainedImageWithBackground
  // so the same photo doesn't suddenly alias when re-composed at submit time.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale((mirror ? -1 : 1) * scale, scale);
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}
