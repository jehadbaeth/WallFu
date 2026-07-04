export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  platforms: Rect[];
  walls: Rect[];
  spawn1: { x: number; y: number };
  spawn2: { x: number; y: number };
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

export function cloneMap(map: MapData): MapData {
  return {
    name: map.name,
    width: map.width,
    height: map.height,
    platforms: map.platforms.map((r) => ({ ...r })),
    walls: map.walls.map((r) => ({ ...r })),
    spawn1: { ...map.spawn1 },
    spawn2: { ...map.spawn2 },
  };
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
