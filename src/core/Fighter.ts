import type { Intent } from "./types";
import type { AttackKind } from "./Combat";
import { ATTACKS } from "./Combat";

export type FighterEvent =
  | { type: "jump" }
  | { type: "airJump" }
  | { type: "land"; impactSpeed: number }
  | { type: "dash" }
  | { type: "turn" }
  | { type: "attackStart"; kind: AttackKind }
  | { type: "attackActive"; kind: AttackKind }
  | { type: "hitLanded"; kind: AttackKind; blocked: boolean; x: number; y: number }
  | { type: "hitTaken"; kind: AttackKind; blocked: boolean; knockbackVx: number; knockbackVy: number }
  | { type: "ko" };

// Tuned for a fast, snappy, arcade feel rather than realistic physics.
const MOVE_SPEED = 460; // px/s
const GROUND_ACCEL = 5200; // px/s^2, near-instant direction changes
const GROUND_FRICTION = 4200; // px/s^2 when no input
const AIR_ACCEL = 2600;
const GRAVITY = 2200; // px/s^2
const FAST_FALL_GRAVITY_MULT = 2.4;
const JUMP_VELOCITY = -840;
const AIR_JUMP_VELOCITY = -780;
const DASH_SPEED = 980;
const DASH_DURATION = 0.14; // seconds
const DASH_COOLDOWN = 0.35;
const MAX_FALL_SPEED = 1700;

export type AttackPhase = "startup" | "active" | "recovery" | null;

export class Fighter {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  grounded = false;
  airJumpsUsed = 0;
  maxAirJumps = 1;

  dashTimer = 0;
  dashCooldown = 0;
  dashDirection: 1 | -1 = 1;

  radius = 22; // half-width for collision, feet-to-hip visual scale derives from this
  height = 130;

  // Combat state.
  maxHealth = 100;
  health = 100;
  koed = false;
  blocking = false;

  attackKind: AttackKind | null = null;
  attackPhase: AttackPhase = null;
  attackTimer = 0;
  attackHasHit = false;

  hitstunTimer = 0;

  events: FighterEvent[] = [];

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get isDashing(): boolean {
    return this.dashTimer > 0;
  }

  get isAttacking(): boolean {
    return this.attackPhase !== null;
  }

  get isStunned(): boolean {
    return this.hitstunTimer > 0;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.airJumpsUsed = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.health = this.maxHealth;
    this.koed = false;
    this.blocking = false;
    this.attackKind = null;
    this.attackPhase = null;
    this.attackTimer = 0;
    this.attackHasHit = false;
    this.hitstunTimer = 0;
    this.events.length = 0;
  }

  takeHit(kind: AttackKind, damage: number, knockbackVx: number, knockbackVy: number, hitstun: number, blocked: boolean): void {
    this.health = Math.max(0, this.health - damage);
    this.vx = knockbackVx;
    this.vy = knockbackVy;
    this.hitstunTimer = hitstun;
    this.grounded = false;
    this.attackKind = null;
    this.attackPhase = null;
    this.attackTimer = 0;
    this.events.push({ type: "hitTaken", kind, blocked, knockbackVx, knockbackVy });
    if (this.health <= 0 && !this.koed) {
      this.koed = true;
      this.events.push({ type: "ko" });
    }
  }

  update(dt: number, intent: Intent, groundY: number, worldMinX: number, worldMaxX: number): void {
    this.events.length = 0;

    if (this.koed) {
      this.vy += GRAVITY * dt;
      if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= groundY) {
        this.y = groundY;
        this.vy = 0;
        this.vx = moveToward(this.vx, 0, GROUND_FRICTION * dt);
      }
      return;
    }

    if (this.dashCooldown > 0) this.dashCooldown -= dt;

    if (this.hitstunTimer > 0) {
      this.hitstunTimer -= dt;
      this.blocking = false;
      let gravity = GRAVITY;
      this.vy += gravity * dt;
      if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      this.vx = moveToward(this.vx, 0, GROUND_FRICTION * 0.5 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < worldMinX + this.radius) this.x = worldMinX + this.radius;
      if (this.x > worldMaxX - this.radius) this.x = worldMaxX - this.radius;
      const wasGrounded = this.grounded;
      if (this.y >= groundY) {
        const impactSpeed = this.vy;
        this.y = groundY;
        this.vy = 0;
        this.grounded = true;
        this.airJumpsUsed = 0;
        if (!wasGrounded && impactSpeed > 200) {
          this.events.push({ type: "land", impactSpeed });
        }
      } else {
        this.grounded = false;
      }
      return;
    }

    // Attack state machine.
    if (this.attackPhase) {
      this.attackTimer -= dt;
      const kind = this.attackKind!;
      const data = ATTACKS[kind];
      if (this.attackPhase === "startup" && this.attackTimer <= 0) {
        this.attackPhase = "active";
        this.attackTimer = data.active;
        this.attackHasHit = false;
        this.events.push({ type: "attackActive", kind });
      } else if (this.attackPhase === "active" && this.attackTimer <= 0) {
        this.attackPhase = "recovery";
        this.attackTimer = data.recovery;
      } else if (this.attackPhase === "recovery" && this.attackTimer <= 0) {
        this.attackPhase = null;
        this.attackKind = null;
      }
      // Root motion: heavily damped movement while attacking.
      this.vx = moveToward(this.vx, 0, GROUND_FRICTION * 0.6 * dt);
      this.blocking = false;
    } else {
      this.blocking = this.grounded && intent.block;

      if (!this.blocking && intent.dashPressed && this.dashCooldown <= 0 && !this.isDashing) {
        this.dashTimer = DASH_DURATION;
        this.dashCooldown = DASH_COOLDOWN;
        this.dashDirection = intent.moveX !== 0 ? (intent.moveX as 1 | -1) : this.facing;
        this.events.push({ type: "dash" });
      }

      if (!this.blocking && (intent.lightPressed || intent.heavyPressed)) {
        const kind: AttackKind = intent.heavyPressed ? "heavy" : "light";
        this.attackKind = kind;
        this.attackPhase = "startup";
        this.attackTimer = ATTACKS[kind].startup;
        this.attackHasHit = false;
        this.dashTimer = 0;
        this.events.push({ type: "attackStart", kind });
      }
    }

    if (this.isDashing) {
      this.dashTimer -= dt;
      this.vx = this.dashDirection * DASH_SPEED;
      this.vy = 0;
    } else if (!this.attackPhase) {
      const wasFacing = this.facing;
      if (intent.moveX !== 0 && !this.blocking) this.facing = intent.moveX;
      if (wasFacing !== this.facing) this.events.push({ type: "turn" });

      const targetVx = this.blocking ? 0 : intent.moveX * MOVE_SPEED;
      const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
      if (targetVx !== 0) {
        this.vx = moveToward(this.vx, targetVx, accel * dt);
      } else if (this.grounded) {
        this.vx = moveToward(this.vx, 0, GROUND_FRICTION * dt);
      }

      if (!this.blocking && intent.jumpPressed) {
        if (this.grounded) {
          this.vy = JUMP_VELOCITY;
          this.grounded = false;
          this.events.push({ type: "jump" });
        } else if (this.airJumpsUsed < this.maxAirJumps) {
          this.vy = AIR_JUMP_VELOCITY;
          this.airJumpsUsed++;
          this.events.push({ type: "airJump" });
        }
      }

      let gravity = GRAVITY;
      if (!this.grounded && intent.fastFall && this.vy > 0) {
        gravity *= FAST_FALL_GRAVITY_MULT;
      }
      this.vy += gravity * dt;
      if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
    } else {
      // Attacking: keep applying gravity if airborne.
      if (!this.grounded) {
        this.vy += GRAVITY * dt;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < worldMinX + this.radius) this.x = worldMinX + this.radius;
    if (this.x > worldMaxX - this.radius) this.x = worldMaxX - this.radius;

    const wasGrounded = this.grounded;
    if (this.y >= groundY) {
      const impactSpeed = this.vy;
      this.y = groundY;
      this.vy = 0;
      this.grounded = true;
      this.airJumpsUsed = 0;
      if (!wasGrounded && impactSpeed > 200) {
        this.events.push({ type: "land", impactSpeed });
      }
    } else {
      this.grounded = false;
    }
  }
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
