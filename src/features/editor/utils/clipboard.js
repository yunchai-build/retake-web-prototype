function readFileAsDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || image.width || null,
      height: image.naturalHeight || image.height || null,
    });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = src;
  });
}

async function imageFileToClipboardImage(file) {
  const src = await readFileAsDataUrl(file);
  if (!src) return null;
  const { width, height } = await getImageDimensions(src);
  return { src, width, height };
}

function findImageFile(data) {
  const files = Array.from(data?.files || []);
  const file = files.find(item => item.type?.startsWith('image/'));
  if (file) return file;

  const items = Array.from(data?.items || []);
  const imageItem = items.find(item => item.type?.startsWith('image/'));
  return imageItem?.getAsFile?.() || null;
}

function isUsableImageSrc(src) {
  return (
    typeof src === 'string'
    && /^(data:image\/|blob:|https?:\/\/)/i.test(src.trim())
  );
}

function extractImageSrcFromHtml(html) {
  if (!html) return null;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgSrc = doc.querySelector('img[src]')?.getAttribute('src');
  if (isUsableImageSrc(imgSrc)) return imgSrc.trim();

  const sourceSrc = doc.querySelector('source[srcset], img[srcset]')?.getAttribute('srcset');
  const firstSrcsetUrl = sourceSrc?.split(',')?.[0]?.trim()?.split(/\s+/)?.[0];
  if (isUsableImageSrc(firstSrcsetUrl)) return firstSrcsetUrl.trim();

  const styleUrl = html.match(/url\((['"]?)(.*?)\1\)/i)?.[2];
  return isUsableImageSrc(styleUrl) ? styleUrl.trim() : null;
}

async function externalImageToDataUrl(src) {
  if (!/^https?:\/\//i.test(src)) return src;

  try {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) return src;
    const blob = await response.blob();
    if (!blob.type?.startsWith('image/')) return src;
    return await readFileAsDataUrl(blob);
  } catch {
    return src;
  }
}

async function srcToClipboardImage(src) {
  if (!isUsableImageSrc(src)) return null;
  const normalizedSrc = await externalImageToDataUrl(src.trim());
  const { width, height } = await getImageDimensions(normalizedSrc);
  return { src: normalizedSrc, width, height };
}

export async function getClipboardImage(data) {
  const file = findImageFile(data);
  if (file) return imageFileToClipboardImage(file);

  const html = data?.getData?.('text/html');
  const htmlSrc = extractImageSrcFromHtml(html);
  if (htmlSrc) return srcToClipboardImage(htmlSrc);

  const text = data?.getData?.('text/plain')?.trim();
  if (isUsableImageSrc(text)) return srcToClipboardImage(text);

  return null;
}

export function hasClipboardImage(data) {
  if (findImageFile(data)) return true;
  if (extractImageSrcFromHtml(data?.getData?.('text/html'))) return true;
  return isUsableImageSrc(data?.getData?.('text/plain')?.trim());
}

export function isEditablePasteTarget(target) {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  return !!(
    target?.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]')
    || active?.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]')
  );
}
