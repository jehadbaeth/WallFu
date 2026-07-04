export interface Options {
  roundsToWin: number;
  shakeIntensity: number;
}

const STORAGE_KEY = "wallfu.options";

export function defaultOptions(): Options {
  return { roundsToWin: 2, shakeIntensity: 1 };
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
