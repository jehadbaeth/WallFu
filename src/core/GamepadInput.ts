import type { Intent } from "./types";
import { emptyIntent } from "./types";

const DEADZONE = 0.35;

// Standard-mapping indices, arranged MK-style: punches on the top face
// buttons, kicks on the bottom ones, and up on the stick/d-pad jumps.
const BTN_LOW_KICK = 0; // A / Cross
const BTN_HIGH_KICK = 1; // B / Circle
const BTN_LOW_PUNCH = 2; // X / Square
const BTN_HIGH_PUNCH = 3; // Y / Triangle
const BTN_DASH = 4; // Left bumper
const BTN_BLOCK = 5; // Right bumper
const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;

/** Polls a single gamepad slot by index and produces an Intent, matching KeyboardIntentSource's contract. */
export class GamepadIntentSource {
  constructor(private index: number) {}

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

    const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;

    const axisX = pad.axes[0] ?? 0;
    if (axisX < -DEADZONE || pressed(BTN_DPAD_LEFT)) intent.moveX = -1;
    else if (axisX > DEADZONE || pressed(BTN_DPAD_RIGHT)) intent.moveX = 1;

    const axisY = pad.axes[1] ?? 0;
    const jumpHeld = axisY < -0.55 || pressed(BTN_DPAD_UP);
    intent.jump = jumpHeld;
    intent.jumpPressed = jumpHeld && !this.prevJump;
    this.prevJump = jumpHeld;

    intent.fastFall = axisY > DEADZONE || pressed(BTN_DPAD_DOWN);

    const hp = pressed(BTN_HIGH_PUNCH);
    intent.highPunch = hp;
    intent.highPunchPressed = hp && !this.prevHighPunch;
    this.prevHighPunch = hp;

    const lp = pressed(BTN_LOW_PUNCH);
    intent.lowPunch = lp;
    intent.lowPunchPressed = lp && !this.prevLowPunch;
    this.prevLowPunch = lp;

    const hk = pressed(BTN_HIGH_KICK);
    intent.highKick = hk;
    intent.highKickPressed = hk && !this.prevHighKick;
    this.prevHighKick = hk;

    const lk = pressed(BTN_LOW_KICK);
    intent.lowKick = lk;
    intent.lowKickPressed = lk && !this.prevLowKick;
    this.prevLowKick = lk;

    intent.block = pressed(BTN_BLOCK);

    const dashHeld = pressed(BTN_DASH);
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
