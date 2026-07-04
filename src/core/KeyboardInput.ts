import type { Intent } from "./types";
import { emptyIntent } from "./types";

export interface KeyBindings {
  left: string;
  right: string;
  jump: string;
  fastFall: string;
  light: string;
  heavy: string;
  block: string;
  dash: string;
}

export const P1_BINDINGS: KeyBindings = {
  left: "KeyA",
  right: "KeyD",
  jump: "KeyW",
  fastFall: "KeyS",
  light: "KeyF",
  heavy: "KeyG",
  block: "KeyH",
  dash: "KeyJ",
};

export const P2_BINDINGS: KeyBindings = {
  left: "ArrowLeft",
  right: "ArrowRight",
  jump: "ArrowUp",
  fastFall: "ArrowDown",
  light: "Numpad1",
  heavy: "Numpad2",
  block: "Numpad3",
  dash: "Numpad4",
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
  private prevLight = false;
  private prevHeavy = false;
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

    intent.light = heldKeys.has(b.light);
    intent.lightPressed = intent.light && !this.prevLight;
    this.prevLight = intent.light;

    intent.heavy = heldKeys.has(b.heavy);
    intent.heavyPressed = intent.heavy && !this.prevHeavy;
    this.prevHeavy = intent.heavy;

    intent.block = heldKeys.has(b.block);

    intent.dash = heldKeys.has(b.dash);
    intent.dashPressed = intent.dash && !this.prevDash;
    this.prevDash = intent.dash;

    return intent;
  }
}
