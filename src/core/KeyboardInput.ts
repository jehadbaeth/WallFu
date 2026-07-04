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
export const P1_BINDINGS: KeyBindings = {
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

export const P2_BINDINGS: KeyBindings = {
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
