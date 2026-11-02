/** Boş kenarı alınmış afiş. Aynı adres oturum boyunca bir kez işlenir. */
const cache = new Map<string, string>();

const SCAN = 180;
const OUT_WIDTH = 640;

type Box = { x: number; y: number; w: number; h: number };

function contentBox(image: HTMLImageElement): Box | null {
  const scale = Math.min(1, SCAN / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));
  const scan = document.createElement('canvas');
  scan.width = w;
  scan.height = h;
  const ctx = scan.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 20) continue;
      if (data[i] > 246 && data[i + 1] > 246 && data[i + 2] > 246) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) return null;
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const sx = image.naturalWidth / w;
  const sy = image.naturalHeight / h;
  return {
    x: Math.floor(minX * sx),
    y: Math.floor(minY * sy),
    w: Math.max(1, Math.ceil((maxX - minX + 1) * sx)),
    h: Math.max(1, Math.ceil((maxY - minY + 1) * sy)),
  };
}

function cropToContent(image: HTMLImageElement, src: string): string {
  const box = contentBox(image);
  if (!box) return src;
  const nw = image.naturalWidth;
  const nh = image.naturalHeight;
  if (box.w > nw * 0.94 && box.h > nh * 0.94) return src;
  const out = document.createElement('canvas');
  out.width = Math.min(OUT_WIDTH, box.w);
  out.height = Math.max(1, Math.round(out.width * (box.h / box.w)));
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export function fitPoster(src: string): Promise<string> {
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const next = cropToContent(image, src);
        cache.set(src, next);
        resolve(next);
      } catch {
        cache.set(src, src);
        resolve(src);
      }
    };
    image.onerror = () => reject(new Error('poster'));
    image.src = src;
  });
}
