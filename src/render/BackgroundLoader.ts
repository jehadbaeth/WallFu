import { Texture, Sprite, Container } from "pixi.js";

const cache = new Map<string, Texture>();

async function loadTexture(dataUrl: string): Promise<Texture> {
  const cached = cache.get(dataUrl);
  if (cached) return cached;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const tex = Texture.from(img);
  cache.clear(); // only ever keep the latest background; data URLs are big
  cache.set(dataUrl, tex);
  return tex;
}

/**
 * Fills `layer` with the map's background image stretched to the given size,
 * or clears it when the map has none. Safe to call repeatedly; only reloads on change.
 */
export function applyBackground(layer: Container, url: string | undefined, width: number, height: number, alpha = 0.85): void {
  const current = (layer as Container & { __bgUrl?: string }).__bgUrl;
  if (current === url) return;
  (layer as Container & { __bgUrl?: string }).__bgUrl = url;
  layer.removeChildren();
  if (!url) return;
  void loadTexture(url).then((tex) => {
    // The background may have changed again while loading.
    if ((layer as Container & { __bgUrl?: string }).__bgUrl !== url) return;
    const sprite = new Sprite(tex);
    sprite.width = width;
    sprite.height = height;
    sprite.alpha = alpha;
    layer.removeChildren();
    layer.addChild(sprite);
  });
}

/** Reads an image file, downscales it to fit the arena, and returns a compact JPEG data URL. */
export async function fileToBackgroundDataUrl(file: File, maxW: number, maxH: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(maxW / bitmap.width, maxH / bitmap.height);
  const w = Math.round(bitmap.width * Math.min(scale, 1));
  const h = Math.round(bitmap.height * Math.min(scale, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(w, maxW * 1.2);
  canvas.height = Math.min(h, maxH * 1.2);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
