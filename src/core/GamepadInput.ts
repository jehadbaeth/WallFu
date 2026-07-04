import type { Intent } from "./types";
import { emptyIntent } from "./types";

const DEADZONE = 0.35;

// Standard-mapping button/axis indices (Xbox/PS/most Bluetooth pads report this layout).
const BTN_JUMP = 0; // A / Cross
const BTN_LIGHT = 2; // X / Square
const BTN_HEAVY = 3; // Y / Triangle
const BTN_DASH = 4; // Left bumper
const BTN_BLOCK = 5; // Right bumper
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;

/** Polls a single gamepad slot by index and produces an Intent, matching KeyboardIntentSource's contract. */
export class GamepadIntentSource {
  constructor(private index: number) {}

  private prevJump = false;
  private prevLight = false;
  private prevHeavy = false;
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

    const axisX = pad.axes[0] ?? 0;
    const dpadLeft = pad.buttons[BTN_DPAD_LEFT]?.pressed ?? false;
    const dpadRight = pad.buttons[BTN_DPAD_RIGHT]?.pressed ?? false;
    if (axisX < -DEADZONE || dpadLeft) intent.moveX = -1;
    else if (axisX > DEADZONE || dpadRight) intent.moveX = 1;

    const jumpHeld = pad.buttons[BTN_JUMP]?.pressed ?? false;
    intent.jump = jumpHeld;
    intent.jumpPressed = jumpHeld && !this.prevJump;
    this.prevJump = jumpHeld;

    const axisY = pad.axes[1] ?? 0;
    const dpadDown = pad.buttons[BTN_DPAD_DOWN]?.pressed ?? false;
    intent.fastFall = axisY > DEADZONE || dpadDown;

    const lightHeld = pad.buttons[BTN_LIGHT]?.pressed ?? false;
    intent.light = lightHeld;
    intent.lightPressed = lightHeld && !this.prevLight;
    this.prevLight = lightHeld;

    const heavyHeld = pad.buttons[BTN_HEAVY]?.pressed ?? false;
    intent.heavy = heavyHeld;
    intent.heavyPressed = heavyHeld && !this.prevHeavy;
    this.prevHeavy = heavyHeld;

    intent.block = pad.buttons[BTN_BLOCK]?.pressed ?? false;

    const dashHeld = pad.buttons[BTN_DASH]?.pressed ?? false;
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
    light: a.light || b.light,
    lightPressed: a.lightPressed || b.lightPressed,
    heavy: a.heavy || b.heavy,
    heavyPressed: a.heavyPressed || b.heavyPressed,
    block: a.block || b.block,
    dash: a.dash || b.dash,
    dashPressed: a.dashPressed || b.dashPressed,
  };
}
