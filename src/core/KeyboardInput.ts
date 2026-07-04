import type { Intent } from "./types";
import { emptyIntent } from "./types";

export interface KeyBindings {
  left: string;
  right: string;
  jump: string;
  fastFall: string;
  highPunch: string;
  lowPunch: string;
  highKick: string;
  lowKick: string;
  block: string;
  dash: string;
}

// MK3-style button grid: punches on the top row, kicks below them.
export function defaultP1Bindings(): KeyBindings {
  return {
    left: "KeyA",
    right: "KeyD",
    jump: "KeyW",
    fastFall: "KeyS",
    highPunch: "KeyF",
    lowPunch: "KeyV",
    highKick: "KeyG",
    lowKick: "KeyB",
    block: "KeyH",
    dash: "KeyJ",
  };
}

export function defaultP2Bindings(): KeyBindings {
  return {
    left: "ArrowLeft",
    right: "ArrowRight",
    jump: "ArrowUp",
    fastFall: "ArrowDown",
    highPunch: "Numpad4",
    lowPunch: "Numpad1",
    highKick: "Numpad5",
    lowKick: "Numpad2",
    block: "Numpad6",
    dash: "Numpad3",
  };
}

/** Action list with labels, in the order shown by the key-binding UI. */
export const BINDING_ACTIONS: Array<{ key: keyof KeyBindings; label: string }> = [
  { key: "left", label: "Move Left" },
  { key: "right", label: "Move Right" },
  { key: "jump", label: "Jump" },
  { key: "fastFall", label: "Down / Fast-Fall" },
  { key: "highPunch", label: "High Punch" },
  { key: "lowPunch", label: "Low Punch" },
  { key: "highKick", label: "High Kick" },
  { key: "lowKick", label: "Low Kick" },
  { key: "block", label: "Block" },
  { key: "dash", label: "Dash" },
];

const BINDINGS_STORAGE_KEY = "wallfu.keybindings";

export function loadBindings(): { p1: KeyBindings; p2: KeyBindings } {
  const result = { p1: defaultP1Bindings(), p2: defaultP2Bindings() };
  try {
    const raw = localStorage.getItem(BINDINGS_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { p1?: Partial<KeyBindings>; p2?: Partial<KeyBindings> };
      Object.assign(result.p1, saved.p1);
      Object.assign(result.p2, saved.p2);
    }
  } catch {
    // ignore malformed storage
  }
  return result;
}

export function saveBindings(bindings: { p1: KeyBindings; p2: KeyBindings }): void {
  localStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(bindings));
}

/** Human-readable key name for the binding UI, e.g. "KeyA" -> "A", "Numpad4" -> "Num4". */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  if (code.startsWith("Arrow")) return { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" }[code] ?? code;
  return code;
}

const heldKeys = new Set<string>();

window.addEventListener("keydown", (e) => {
  heldKeys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  heldKeys.delete(e.code);
});

export class KeyboardIntentSource {
  private bindings: KeyBindings;
  private prevJump = false;
  private prevHighPunch = false;
  private prevLowPunch = false;
  private prevHighKick = false;
  private prevLowKick = false;
  private prevDash = false;

  constructor(bindings: KeyBindings) {
    this.bindings = bindings;
  }

  poll(): Intent {
    const intent = emptyIntent();
    const b = this.bindings;

    const left = heldKeys.has(b.left);
    const right = heldKeys.has(b.right);
    if (left && !right) intent.moveX = -1;
    else if (right && !left) intent.moveX = 1;

    intent.jump = heldKeys.has(b.jump);
    intent.jumpPressed = intent.jump && !this.prevJump;
    this.prevJump = intent.jump;

    intent.fastFall = heldKeys.has(b.fastFall);

    intent.highPunch = heldKeys.has(b.highPunch);
    intent.highPunchPressed = intent.highPunch && !this.prevHighPunch;
    this.prevHighPunch = intent.highPunch;

    intent.lowPunch = heldKeys.has(b.lowPunch);
    intent.lowPunchPressed = intent.lowPunch && !this.prevLowPunch;
    this.prevLowPunch = intent.lowPunch;

    intent.highKick = heldKeys.has(b.highKick);
    intent.highKickPressed = intent.highKick && !this.prevHighKick;
    this.prevHighKick = intent.highKick;

    intent.lowKick = heldKeys.has(b.lowKick);
    intent.lowKickPressed = intent.lowKick && !this.prevLowKick;
    this.prevLowKick = intent.lowKick;

    intent.block = heldKeys.has(b.block);

    intent.dash = heldKeys.has(b.dash);
    intent.dashPressed = intent.dash && !this.prevDash;
    this.prevDash = intent.dash;

    return intent;
  }
}
