export interface Options {
  roundsToWin: number;
  shakeIntensity: number;
  soundVolume: number;
  aiDifficulty: "easy" | "medium" | "hard";
  /** Projection mapping mode: map geometry and backgrounds render black so only fighters and effects hit the wall. */
  projectionMode: boolean;
}

const STORAGE_KEY = "wallfu.options";

export function defaultOptions(): Options {
  return { roundsToWin: 2, shakeIntensity: 1, soundVolume: 0.7, aiDifficulty: "medium", projectionMode: false };
}

export function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultOptions(), ...JSON.parse(raw) };
  } catch {
    // ignore malformed storage
  }
  return defaultOptions();
}

export function saveOptions(options: Options): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
}
