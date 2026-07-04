import type { Intent } from "./types";
import { emptyIntent } from "./types";

const DEADZONE = 0.35;

const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;

/** Rebindable gamepad button assignments (standard-mapping button indices). -1 = unbound. */
export interface PadBindings {
  highPunch: number;
  lowPunch: number;
  highKick: number;
  lowKick: number;
  block: number;
  dash: number;
  /** Extra jump button; up on the stick or d-pad always jumps too. */
  jump: number;
}

// MK-style defaults: punches on the top face buttons, kicks on the bottom
// ones, bumpers for dash/block, and up on the stick/d-pad jumps.
export function defaultPadBindings(): PadBindings {
  return { highPunch: 3, lowPunch: 2, highKick: 1, lowKick: 0, dash: 4, block: 5, jump: -1 };
}

export const PAD_ACTIONS: Array<{ key: keyof PadBindings; label: string }> = [
  { key: "highPunch", label: "High Punch" },
  { key: "lowPunch", label: "Low Punch" },
  { key: "highKick", label: "High Kick" },
  { key: "lowKick", label: "Low Kick" },
  { key: "block", label: "Block" },
  { key: "dash", label: "Dash" },
  { key: "jump", label: "Jump (extra)" },
];

const PAD_BINDINGS_STORAGE_KEY = "wallfu.padbindings";

export function loadPadBindings(): { p1: PadBindings; p2: PadBindings } {
  const result = { p1: defaultPadBindings(), p2: defaultPadBindings() };
  try {
    const raw = localStorage.getItem(PAD_BINDINGS_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { p1?: Partial<PadBindings>; p2?: Partial<PadBindings> };
      Object.assign(result.p1, saved.p1);
      Object.assign(result.p2, saved.p2);
    }
  } catch {
    // ignore malformed storage
  }
  return result;
}

export function savePadBindings(bindings: { p1: PadBindings; p2: PadBindings }): void {
  localStorage.setItem(PAD_BINDINGS_STORAGE_KEY, JSON.stringify(bindings));
}

/** Human-readable name for a standard-mapping button index. */
export function padButtonLabel(index: number): string {
  if (index < 0) return "—";
  const names: Record<number, string> = {
    0: "A/✕",
    1: "B/◯",
    2: "X/▢",
    3: "Y/△",
    4: "LB",
    5: "RB",
    6: "LT",
    7: "RT",
    8: "Select",
    9: "Start",
    10: "LS",
    11: "RS",
    12: "D-Up",
    13: "D-Down",
    14: "D-Left",
    15: "D-Right",
  };
  return names[index] ?? `B${index}`;
}

/** Polls a single gamepad slot by index and produces an Intent, matching KeyboardIntentSource's contract. */
export class GamepadIntentSource {
  constructor(
    private index: number,
    private bindings: PadBindings,
  ) {}

  private prevJump = false;
  private prevHighPunch = false;
  private prevLowPunch = false;
  private prevHighKick = false;
  private prevLowKick = false;
  private prevDash = false;

  get connected(): boolean {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return !!pads[this.index];
  }

  poll(): Intent {
    const intent = emptyIntent();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[this.index];
    if (!pad) return intent;

    const pressed = (i: number) => (i >= 0 ? (pad.buttons[i]?.pressed ?? false) : false);
    const b = this.bindings;

    const axisX = pad.axes[0] ?? 0;
    if (axisX < -DEADZONE || pressed(BTN_DPAD_LEFT)) intent.moveX = -1;
    else if (axisX > DEADZONE || pressed(BTN_DPAD_RIGHT)) intent.moveX = 1;

    const axisY = pad.axes[1] ?? 0;
    const jumpHeld = axisY < -0.55 || pressed(BTN_DPAD_UP) || pressed(b.jump);
    intent.jump = jumpHeld;
    intent.jumpPressed = jumpHeld && !this.prevJump;
    this.prevJump = jumpHeld;

    intent.fastFall = axisY > DEADZONE || pressed(BTN_DPAD_DOWN);

    const hp = pressed(b.highPunch);
    intent.highPunch = hp;
    intent.highPunchPressed = hp && !this.prevHighPunch;
    this.prevHighPunch = hp;

    const lp = pressed(b.lowPunch);
    intent.lowPunch = lp;
    intent.lowPunchPressed = lp && !this.prevLowPunch;
    this.prevLowPunch = lp;

    const hk = pressed(b.highKick);
    intent.highKick = hk;
    intent.highKickPressed = hk && !this.prevHighKick;
    this.prevHighKick = hk;

    const lk = pressed(b.lowKick);
    intent.lowKick = lk;
    intent.lowKickPressed = lk && !this.prevLowKick;
    this.prevLowKick = lk;

    intent.block = pressed(b.block);

    const dashHeld = pressed(b.dash);
    intent.dash = dashHeld;
    intent.dashPressed = dashHeld && !this.prevDash;
    this.prevDash = dashHeld;

    return intent;
  }
}

/** Combines two intents (e.g. keyboard + gamepad) so either input source can drive a player. */
export function mergeIntents(a: Intent, b: Intent): Intent {
  return {
    moveX: (a.moveX !== 0 ? a.moveX : b.moveX) as -1 | 0 | 1,
    jump: a.jump || b.jump,
    jumpPressed: a.jumpPressed || b.jumpPressed,
    fastFall: a.fastFall || b.fastFall,
    highPunch: a.highPunch || b.highPunch,
    highPunchPressed: a.highPunchPressed || b.highPunchPressed,
    lowPunch: a.lowPunch || b.lowPunch,
    lowPunchPressed: a.lowPunchPressed || b.lowPunchPressed,
    highKick: a.highKick || b.highKick,
    highKickPressed: a.highKickPressed || b.highKickPressed,
    lowKick: a.lowKick || b.lowKick,
    lowKickPressed: a.lowKickPressed || b.lowKickPressed,
    block: a.block || b.block,
    dash: a.dash || b.dash,
    dashPressed: a.dashPressed || b.dashPressed,
  };
}
