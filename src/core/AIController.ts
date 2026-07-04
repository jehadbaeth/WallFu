import type { Intent } from "./types";
import { emptyIntent } from "./types";
import type { Fighter } from "./Fighter";
import type { MapData } from "./MapTypes";

export type AIDifficulty = "easy" | "medium" | "hard";

export const AI_DIFFICULTIES: AIDifficulty[] = ["easy", "medium", "hard"];

interface AIParams {
  /** Seconds between decisions. Lower = faster reactions. */
  reactionTime: number;
  /** Chance to attack when in range (per decision). */
  aggression: number;
  /** Chance to block when the opponent is attacking nearby. */
  blockChance: number;
  /** Chance to close distance with a dash. */
  dashChance: number;
  /** Chance to take a jump when approaching. */
  jumpChance: number;
  /** Chance to make a random unhelpful move instead of the smart one. */
  mistakeChance: number;
  /** Whether launchers, dive kicks, and juggle follow-ups are used. */
  advancedMoves: boolean;
}

const PARAMS: Record<AIDifficulty, AIParams> = {
  easy: { reactionTime: 0.4, aggression: 0.45, blockChance: 0.08, dashChance: 0.06, jumpChance: 0.18, mistakeChance: 0.35, advancedMoves: false },
  medium: { reactionTime: 0.2, aggression: 0.7, blockChance: 0.3, dashChance: 0.22, jumpChance: 0.32, mistakeChance: 0.14, advancedMoves: true },
  hard: { reactionTime: 0.09, aggression: 0.9, blockChance: 0.55, dashChance: 0.4, jumpChance: 0.45, mistakeChance: 0.03, advancedMoves: true },
};

const ATTACK_RANGE = 90;

type PressAction = "jump" | "dash" | "light" | "heavy";

/**
 * Produces an Intent per fixed-timestep frame for a CPU-controlled fighter.
 * Decisions happen every reactionTime seconds; held inputs (movement, block)
 * persist between decisions, button presses fire for exactly one frame.
 */
export class AIController {
  private params: AIParams;
  private decisionTimer = 0;

  private heldMoveX: -1 | 0 | 1 = 0;
  private heldBlock = false;
  private heldFastFall = false;
  private pressQueue: PressAction[] = [];

  constructor(difficulty: AIDifficulty) {
    this.params = PARAMS[difficulty];
  }

  reset(): void {
    this.decisionTimer = 0;
    this.heldMoveX = 0;
    this.heldBlock = false;
    this.heldFastFall = false;
    this.pressQueue.length = 0;
  }

  poll(dt: number, self: Fighter, opponent: Fighter, map: MapData): Intent {
    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.params.reactionTime * (0.7 + Math.random() * 0.6);
      this.decide(self, opponent, map);
    }

    const intent = emptyIntent();
    intent.moveX = this.heldMoveX;
    intent.block = this.heldBlock;
    intent.fastFall = this.heldFastFall;

    const press = this.pressQueue.shift();
    if (press === "jump") {
      intent.jump = true;
      intent.jumpPressed = true;
    } else if (press === "dash") {
      intent.dash = true;
      intent.dashPressed = true;
    } else if (press === "light") {
      intent.light = true;
      intent.lightPressed = true;
    } else if (press === "heavy") {
      intent.heavy = true;
      intent.heavyPressed = true;
    }
    return intent;
  }

  private decide(self: Fighter, opponent: Fighter, map: MapData): void {
    const p = this.params;
    this.heldMoveX = 0;
    this.heldBlock = false;
    this.heldFastFall = false;

    if (self.koed || self.isStunned) return;

    const dx = opponent.x - self.x;
    const adx = Math.abs(dx);
    const dy = opponent.y - self.y; // negative = opponent above
    const toward = (dx > 0 ? 1 : -1) as 1 | -1;

    // Wall-jump out of a wall cling regardless of anything else.
    if (!self.grounded && self.touchingWallSide !== 0) {
      this.pressQueue.push("jump");
      this.heldMoveX = (-self.touchingWallSide) as 1 | -1;
      return;
    }

    // Occasional deliberate mistake keeps lower difficulties beatable.
    if (Math.random() < p.mistakeChance) {
      const r = Math.random();
      if (r < 0.4) this.heldMoveX = (Math.random() < 0.5 ? -1 : 1) as 1 | -1;
      else if (r < 0.6 && self.grounded) this.pressQueue.push("jump");
      // else: just stand there for a beat
      return;
    }

    // Defend when the opponent is swinging in range.
    if (opponent.isAttacking && adx < 140 && Math.random() < p.blockChance) {
      if (self.grounded) {
        this.heldBlock = true;
      } else {
        this.heldFastFall = true; // get down fast, then block next decision
      }
      return;
    }

    if (adx > ATTACK_RANGE) {
      // Approach.
      this.heldMoveX = toward;
      if (adx > 240 && self.grounded && Math.random() < p.dashChance) {
        this.pressQueue.push("dash");
      }
      // Chase an airborne opponent or hop platforms.
      if (self.grounded && (dy < -90 || Math.random() < p.jumpChance * 0.25)) {
        this.pressQueue.push("jump");
      }
      // Dive kick down onto a grounded opponent from above.
      if (p.advancedMoves && !self.grounded && dy > 60 && adx < 160 && Math.random() < 0.5) {
        this.heldFastFall = true;
        this.pressQueue.push("light");
      }
      return;
    }

    // In range: attack, juggle, or reposition.
    if (Math.random() < p.aggression) {
      if (p.advancedMoves && self.grounded && dy < -50) {
        // Opponent above: launch them higher or jump after them.
        if (Math.random() < 0.6) {
          this.heldFastFall = true;
          this.pressQueue.push("heavy"); // launcher
        } else {
          this.pressQueue.push("jump", Math.random() < 0.5 ? "light" : "heavy");
        }
      } else if (p.advancedMoves && self.grounded && opponent.isStunned && Math.random() < 0.45) {
        // Combo starter on a stunned opponent: launch into juggle.
        this.heldFastFall = true;
        this.pressQueue.push("heavy");
      } else {
        this.pressQueue.push(Math.random() < 0.6 ? "light" : "heavy");
      }
      this.heldMoveX = toward;
    } else {
      // Reposition: back off or jump over.
      if (Math.random() < 0.5) {
        this.heldMoveX = (-toward) as 1 | -1;
      } else if (self.grounded) {
        this.pressQueue.push("jump");
        this.heldMoveX = toward;
      }
    }

    // Never idle off the map edge.
    if (self.x < 60) this.heldMoveX = 1;
    else if (self.x > map.width - 60) this.heldMoveX = -1;
  }
}
