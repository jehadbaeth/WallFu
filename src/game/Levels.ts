import type { MapData, Rect } from "../core/MapTypes";

/**
 * Built-in levels plus a procedural generator. All builders take the virtual
 * arena size and return a complete MapData. Navigability rule of thumb:
 * a jump reaches ~155px up, jump+air-jump ~290px, so platform rows sit
 * 170-200px apart and everything stays reachable.
 */

export interface LevelDef {
  name: string;
  desc: string;
  build: (w: number, h: number) => MapData;
}

function plat(x: number, y: number, w: number, crumble = false): Rect {
  return { x, y, w, h: 22, ...(crumble ? { crumble: true } : {}) };
}

export const BUILTIN_LEVELS: LevelDef[] = [
  {
    name: "Arena",
    desc: "The classic. No surprises.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "Arena",
        width: w,
        height: h,
        platforms: [
          { x: 0, y: g, w, h: 30 },
          plat(w * 0.18, g - 200, w * 0.2),
          plat(w * 0.62, g - 200, w * 0.2),
          plat(w * 0.4, g - 380, w * 0.2),
        ],
        walls: [
          { x: 0, y: g - h * 0.62, w: 36, h: h * 0.62 },
          { x: w - 36, y: g - h * 0.62, w: 36, h: h * 0.62 },
        ],
        spawn1: { x: w * 0.3, y: g },
        spawn2: { x: w * 0.7, y: g },
        hazards: {},
      };
    },
  },
  {
    name: "Thunder Flats",
    desc: "Wide open ground. The sky is angry.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "Thunder Flats",
        width: w,
        height: h,
        platforms: [{ x: 0, y: g, w, h: 30 }, plat(w * 0.08, g - 190, w * 0.18), plat(w * 0.74, g - 190, w * 0.18)],
        walls: [],
        spawn1: { x: w * 0.3, y: g },
        spawn2: { x: w * 0.7, y: g },
        hazards: { lightning: true },
      };
    },
  },
  {
    name: "The Pit",
    desc: "High ground is safe ground. The pit is not.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "The Pit",
        width: w,
        height: h,
        platforms: [{ x: 0, y: g, w, h: 30 }, plat(w * 0.4, g - 330, w * 0.2)],
        walls: [
          { x: 0, y: g - 240, w: w * 0.22, h: 240 },
          { x: w * 0.78, y: g - 240, w: w * 0.22, h: 240 },
        ],
        spawn1: { x: w * 0.1, y: g - 240 },
        spawn2: { x: w * 0.9, y: g - 240 },
        hazards: { lava: true },
      };
    },
  },
  {
    name: "Dagger Alley",
    desc: "Two towers, one bridge, sharp weather.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "Dagger Alley",
        width: w,
        height: h,
        platforms: [{ x: 0, y: g, w, h: 30 }, plat(w * 0.33, g - 320, w * 0.34)],
        walls: [
          { x: w * 0.28, y: g - 300, w: 60, h: 300 },
          { x: w * 0.72 - 60, y: g - 300, w: 60, h: 300 },
        ],
        spawn1: { x: w * 0.12, y: g },
        spawn2: { x: w * 0.88, y: g },
        hazards: { daggers: true },
      };
    },
  },
  {
    name: "Crumble Crossing",
    desc: "The bridge holds. For a while.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "Crumble Crossing",
        width: w,
        height: h,
        platforms: [
          { x: 0, y: g, w: w * 0.3, h: 30 },
          { x: w * 0.7, y: g, w: w * 0.3, h: 30 },
          plat(w * 0.32, g - 30, w * 0.11, true),
          plat(w * 0.45, g - 30, w * 0.11, true),
          plat(w * 0.58, g - 30, w * 0.11, true),
          plat(w * 0.38, g - 260, w * 0.24),
        ],
        walls: [],
        spawn1: { x: w * 0.14, y: g },
        spawn2: { x: w * 0.86, y: g },
        hazards: {},
      };
    },
  },
  {
    name: "Volcano",
    desc: "King of the hill, if the hill lets you live.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "Volcano",
        width: w,
        height: h,
        platforms: [
          { x: 0, y: g, w, h: 30 },
          plat(w * 0.1, g - 240, w * 0.16, true),
          plat(w * 0.74, g - 240, w * 0.16, true),
        ],
        walls: [],
        polygons: [
          {
            points: [
              { x: w * 0.32, y: g },
              { x: w * 0.5, y: g - 400 },
              { x: w * 0.68, y: g },
            ],
          },
        ],
        spawn1: { x: w * 0.15, y: g },
        spawn2: { x: w * 0.85, y: g },
        hazards: { lava: true },
      };
    },
  },
  {
    name: "The Gauntlet",
    desc: "Everything, everywhere, all at once.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "The Gauntlet",
        width: w,
        height: h,
        platforms: [
          { x: 0, y: g, w, h: 30 },
          plat(w * 0.12, g - 190, w * 0.18),
          plat(w * 0.66, g - 190, w * 0.18),
          plat(w * 0.38, g - 370, w * 0.24, true),
        ],
        walls: [{ x: 0, y: g - h * 0.5, w: 36, h: h * 0.5 }, { x: w - 36, y: g - h * 0.5, w: 36, h: h * 0.5 }],
        spawn1: { x: w * 0.3, y: g },
        spawn2: { x: w * 0.7, y: g },
        hazards: { daggers: true, lightning: true, lava: true },
      };
    },
  },
  {
    name: "Sky Islands",
    desc: "Mind the gaps. They mind you.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "Sky Islands",
        width: w,
        height: h,
        platforms: [
          { x: w * 0.02, y: g, w: w * 0.24, h: 30 },
          { x: w * 0.39, y: g, w: w * 0.22, h: 30 },
          { x: w * 0.74, y: g, w: w * 0.24, h: 30 },
          plat(w * 0.27, g - 190, w * 0.12),
          plat(w * 0.61, g - 190, w * 0.12),
          plat(w * 0.42, g - 370, w * 0.16),
        ],
        walls: [],
        spawn1: { x: w * 0.14, y: g },
        spawn2: { x: w * 0.86, y: g },
        hazards: { daggers: true, lightning: true },
      };
    },
  },
  {
    name: "The Staircase",
    desc: "Climb for advantage, duck the bolts.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "The Staircase",
        width: w,
        height: h,
        platforms: [{ x: 0, y: g, w, h: 30 }, plat(w * 0.05, g - 380, w * 0.15)],
        walls: [
          { x: w * 0.3, y: g - 90, w: w * 0.14, h: 90 },
          { x: w * 0.47, y: g - 180, w: w * 0.14, h: 180 },
          { x: w * 0.64, y: g - 270, w: w * 0.14, h: 270 },
          { x: w * 0.81, y: g - 360, w: w * 0.14, h: 360 },
        ],
        spawn1: { x: w * 0.12, y: g },
        spawn2: { x: w * 0.88, y: g - 360 },
        hazards: { lightning: true },
      };
    },
  },
  {
    name: "The Cage",
    desc: "Sealed box. Knockback has nowhere to go but back at you.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "The Cage",
        width: w,
        height: h,
        platforms: [{ x: 0, y: g, w, h: 30 }, plat(w * 0.28, g - 210, w * 0.44)],
        walls: [
          { x: 0, y: 60, w: 36, h: g - 60 },
          { x: w - 36, y: 60, w: 36, h: g - 60 },
          { x: 0, y: 60, w, h: 30 },
        ],
        spawn1: { x: w * 0.3, y: g },
        spawn2: { x: w * 0.7, y: g },
        hazards: {},
      };
    },
  },
  {
    name: "Twin Towers",
    desc: "Whoever holds the tops holds the match.",
    build: (w, h) => {
      const g = h - 120;
      return {
        name: "Twin Towers",
        width: w,
        height: h,
        platforms: [{ x: 0, y: g, w, h: 30 }, plat(w * 0.41, g - 330, w * 0.18)],
        walls: [
          { x: w * 0.22, y: g - 500, w: 70, h: 500 },
          { x: w * 0.78 - 70, y: g - 500, w: 70, h: 500 },
        ],
        spawn1: { x: w * 0.1, y: g },
        spawn2: { x: w * 0.9, y: g },
        hazards: { daggers: true },
      };
    },
  },
];

/**
 * Procedural map: guaranteed ground, platform rows spaced within jump reach,
 * random walls/hills, random crumble platforms, and a random hazard mix.
 */
export function randomMap(w: number, h: number): MapData {
  const g = h - 120;
  const platforms: Rect[] = [];
  const walls: Rect[] = [];
  const polygons: MapData["polygons"] = [];

  // Ground: mostly a full floor, sometimes islands with ring-out gaps.
  const islandMode = Math.random() < 0.3;
  let groundPieces: Rect[];
  if (islandMode) {
    groundPieces = [
      { x: w * 0.02, y: g, w: w * (0.2 + Math.random() * 0.08), h: 30 },
      { x: w * (0.38 + Math.random() * 0.04), y: g, w: w * (0.18 + Math.random() * 0.06), h: 30 },
      { x: w * (0.72 + Math.random() * 0.03), y: g, w: w * 0.24, h: 30 },
    ];
  } else {
    groundPieces = [{ x: 0, y: g, w, h: 30 }];
  }
  platforms.push(...groundPieces);

  // Platform rows within double-jump reach of each other.
  const rowYs = [g - 190, g - 370, g - 550];
  const rows = 1 + Math.floor(Math.random() * 3); // 1-3 rows
  for (let r = 0; r < rows; r++) {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const pw = w * (0.1 + Math.random() * 0.14);
      const px = Math.min(w - pw - 40, 40 + Math.random() * (w - pw - 80));
      const crumble = Math.random() < 0.22;
      platforms.push(plat(px, rowYs[r] + (Math.random() * 2 - 1) * 20, pw, crumble));
    }
  }

  // Structure: side walls, a center tower, or nothing.
  const structureRoll = Math.random();
  if (structureRoll < 0.35) {
    const wallH = h * (0.45 + Math.random() * 0.25);
    walls.push({ x: 0, y: g - wallH, w: 36, h: wallH }, { x: w - 36, y: g - wallH, w: 36, h: wallH });
  } else if (structureRoll < 0.55 && !islandMode) {
    const tw = 60 + Math.random() * 40;
    const th = 260 + Math.random() * 240;
    walls.push({ x: w / 2 - tw / 2, y: g - th, w: tw, h: th });
  }

  // Sometimes a polygon hill on solid ground.
  if (!islandMode && Math.random() < 0.35) {
    const cx = w * (0.3 + Math.random() * 0.4);
    const halfBase = w * (0.08 + Math.random() * 0.08);
    const peak = 180 + Math.random() * 220;
    polygons.push({
      points: [
        { x: cx - halfBase, y: g },
        { x: cx + (Math.random() * 2 - 1) * halfBase * 0.4, y: g - peak },
        { x: cx + halfBase, y: g },
      ],
    });
  }

  // Spawns on the widest ground piece.
  const widest = groundPieces.reduce((a, b) => (b.w > a.w ? b : a));
  const spawn1 = { x: widest.x + widest.w * 0.25, y: widest.y };
  const spawn2 = { x: widest.x + widest.w * 0.75, y: widest.y };

  return {
    name: `Random ${100 + Math.floor(Math.random() * 900)}`,
    width: w,
    height: h,
    platforms,
    walls,
    polygons,
    spawn1,
    spawn2,
    hazards: {
      daggers: Math.random() < 0.4,
      lightning: Math.random() < 0.4,
      lava: Math.random() < 0.4,
    },
  };
}
