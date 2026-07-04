export interface Options {
  roundsToWin: number;
  shakeIntensity: number;
  soundVolume: number;
}

const STORAGE_KEY = "wallfu.options";

export function defaultOptions(): Options {
  return { roundsToWin: 2, shakeIntensity: 1, soundVolume: 0.7 };
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
