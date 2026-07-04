export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Platforms only: shakes and falls away shortly after someone stands on it. */
  crumble?: boolean;
}

export interface PolyPoint {
  x: number;
  y: number;
}

/** Freeform solid shape drawn point by point; sliced into thin wall strips for collision. */
export interface Polygon {
  points: PolyPoint[];
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  platforms: Rect[];
  walls: Rect[];
  polygons?: Polygon[];
  spawn1: { x: number; y: number };
  spawn2: { x: number; y: number };
  /** Optional background image as a data URL, stretched across the arena. */
  backgroundImage?: string;
  /** Enables random arena hazards (daggers, lightning, lava) on this map. */
  hazardsEnabled?: boolean;
}

export function defaultMap(width: number, height: number): MapData {
  const groundY = height - 120;
  // Side walls make wall-slides, wall-jumps, and wall-bounces part of every match,
  // and the floating platforms give aerial play somewhere to go.
  return {
    name: "Arena",
    width,
    height,
    platforms: [
      { x: 0, y: groundY, w: width, h: 30 },
      { x: width * 0.18, y: groundY - 200, w: width * 0.2, h: 20 },
      { x: width * 0.62, y: groundY - 200, w: width * 0.2, h: 20 },
      { x: width * 0.4, y: groundY - 380, w: width * 0.2, h: 20 },
    ],
    walls: [
      { x: 0, y: groundY - height * 0.62, w: 36, h: height * 0.62 },
      { x: width - 36, y: groundY - height * 0.62, w: 36, h: height * 0.62 },
    ],
    spawn1: { x: width * 0.3, y: groundY },
    spawn2: { x: width * 0.7, y: groundY },
  };
}

/** Rescales a map into the target coordinate space. Needed for maps saved before the virtual-resolution change. */
export function fitMapTo(map: MapData, width: number, height: number): MapData {
  if (map.width === width && map.height === height) return cloneMap(map);
  const sx = width / map.width;
  const sy = height / map.height;
  const scaleRect = (r: Rect): Rect => ({ x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy, ...(r.crumble ? { crumble: true } : {}) });
  return {
    name: map.name,
    width,
    height,
    platforms: map.platforms.map(scaleRect),
    walls: map.walls.map(scaleRect),
    polygons: map.polygons?.map((p) => ({ points: p.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy })) })),
    spawn1: { x: map.spawn1.x * sx, y: map.spawn1.y * sy },
    spawn2: { x: map.spawn2.x * sx, y: map.spawn2.y * sy },
    backgroundImage: map.backgroundImage,
    hazardsEnabled: map.hazardsEnabled,
  };
}

export function cloneMap(map: MapData): MapData {
  return {
    name: map.name,
    width: map.width,
    height: map.height,
    platforms: map.platforms.map((r) => ({ ...r })),
    walls: map.walls.map((r) => ({ ...r })),
    polygons: map.polygons?.map((p) => ({ points: p.points.map((pt) => ({ ...pt })) })),
    spawn1: { ...map.spawn1 },
    spawn2: { ...map.spawn2 },
    backgroundImage: map.backgroundImage,
    hazardsEnabled: map.hazardsEnabled,
  };
}

/**
 * Slices a polygon into thin horizontal wall strips so the rectangle-only
 * physics can collide with freeform shapes. Works for concave polygons.
 */
export function polygonToStrips(points: PolyPoint[], stripHeight = 14): Rect[] {
  if (points.length < 3) return [];
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const strips: Rect[] = [];
  for (let y = minY; y < maxY; y += stripHeight) {
    const rowTop = y;
    const rowH = Math.min(stripHeight, maxY - y);
    const mid = y + rowH / 2;
    // Even-odd scanline: collect x crossings of the row's center line.
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a.y === b.y) continue;
      if ((a.y <= mid && b.y > mid) || (b.y <= mid && a.y > mid)) {
        xs.push(a.x + ((mid - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w >= 4) strips.push({ x: xs[i], y: rowTop, w, h: rowH });
    }
  }
  return strips;
}

/** Point-in-polygon test (even-odd rule), used by the editor's erase tool. */
export function pointInPolygon(x: number, y: number, points: PolyPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

const STORAGE_PREFIX = "wallfu.map.";

export function listSavedMaps(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) names.push(key.slice(STORAGE_PREFIX.length));
  }
  return names.sort();
}

export function saveMapToStorage(map: MapData): void {
  localStorage.setItem(STORAGE_PREFIX + map.name, JSON.stringify(map));
}

export function loadMapFromStorage(name: string): MapData | null {
  const raw = localStorage.getItem(STORAGE_PREFIX + name);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MapData;
  } catch {
    return null;
  }
}

export function deleteMapFromStorage(name: string): void {
  localStorage.removeItem(STORAGE_PREFIX + name);
}
