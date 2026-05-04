/** Resolve after `ms` milliseconds. */
export const delay = (ms) => new Promise(r => setTimeout(r, ms));

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
    const timer = setTimeout(() => reject(new Error('Image load timeout')), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Image load error')); };
    img.src = src;
  });
}
