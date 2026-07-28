/**
 * Turning an adopted signature into the PNG stamped into the PDF. Everything
 * funnels through a canvas: for the uploaded case that is a SANITIZER — decoding
 * an untrusted file with the browser's image decoder and re-encoding the PIXELS
 * discards EXIF, colour profiles, trailing archives, SVG payloads, polyglots.
 * The server re-checks magic bytes + size regardless. Lifted from tms.
 */
const MAX_W = 1200;
const MAX_H = 400;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function trimToInk(source: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Crop a canvas to its ink and re-encode as PNG. Null when empty. */
export function canvasToTrimmedPng(source: HTMLCanvasElement): string | null {
  const box = trimToInk(source);
  if (!box) return null;
  const scale = Math.min(1, MAX_W / box.w, MAX_H / box.h);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.w * scale));
  out.height = Math.max(1, Math.round(box.h * scale));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** Render typed text in a handwriting face, then crop to the ink. */
export function typedSignatureToPng(text: string, font: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const canvas = document.createElement('canvas');
  canvas.width = MAX_W;
  canvas.height = MAX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#0a1d2e';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let size = 180;
  do {
    ctx.font = `${size}px ${font}`;
    if (ctx.measureText(trimmed).width <= MAX_W - 60) break;
    size -= 6;
  } while (size > 24);
  ctx.fillText(trimmed, MAX_W / 2, MAX_H / 2);
  return canvasToTrimmedPng(canvas);
}

/** Decode an uploaded image and re-encode as pixels only (the sanitizer). */
export async function uploadedFileToPng(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is too large — use one under 5 MB.');
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) throw new Error('Please upload a PNG, JPG, or WebP image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file isn't a readable image."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Couldn't process that image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToTrimmedPng(canvas) ?? canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
