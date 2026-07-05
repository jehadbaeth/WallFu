import type { Intent } from "./types";
import type { AttackKind } from "./Combat";
import { ATTACKS } from "./Combat";
import type { MapData } from "./MapTypes";

export type FighterEvent =
  | { type: "jump" }
  | { type: "airJump" }
  | { type: "wallJump" }
  | { type: "wallBounce" }
  | { type: "land"; impactSpeed: number }
  | { type: "dash" }
  | { type: "turn" }
  | { type: "attackStart"; kind: AttackKind }
  | { type: "attackActive"; kind: AttackKind }
  | { type: "hitLanded"; kind: AttackKind; blocked: boolean; x: number; y: number }
  | { type: "hitTaken"; kind: AttackKind; blocked: boolean; knockbackVx: number; knockbackVy: number }
  | { type: "ko" };

// Tuned for a fast, snappy, arcade feel rather than realistic physics.
const MOVE_SPEED = 620; // px/s
const GROUND_ACCEL = 7000; // px/s^2, near-instant direction changes
const GROUND_FRICTION = 5000; // px/s^2 when no input
const AIR_ACCEL = 3600;
const GRAVITY = 2600; // px/s^2
const FAST_FALL_GRAVITY_MULT = 2.6;
const JUMP_VELOCITY = -900;
const AIR_JUMP_VELOCITY = -840;
const DASH_SPEED = 1180;
const DASH_DURATION = 0.12; // seconds
const DASH_COOLDOWN = 0.18;
const MAX_FALL_SPEED = 1950;

const DIVE_KICK_VX = 480;
const DIVE_KICK_VY = 1200;
const DASH_ATTACK_SPEED = 920;
// MK-style jump kick: committing to an air kick tips you into a diagonal descent.
const AIR_KICK_VX = 420;
const AIR_KICK_VY = 360;

// Ground attacks step into the opponent when they go active (One Finger Death Punch lunge).
// The high kick flies forward like a Liu Kang flying kick.
const LUNGE_SPEED: Partial<Record<AttackKind, number>> = {
  lowPunch: 180,
  highPunch: 300,
  lowKick: 240,
  highKick: 560,
  spinSweep: 150,
};

const AERIAL_KINDS: Set<AttackKind> = new Set(["airPunch", "airKick", "diveKick"]);

const WALL_SLIDE_MAX_FALL = 260; // capped fall speed while pressed against a wall
const WALL_JUMP_VX = 640;
const WALL_JUMP_VY = -860;
const WALL_BOUNCE_MIN_SPEED = 260; // knockback speed needed to bounce off a wall instead of just stopping
const WALL_BOUNCE_DAMPING = 0.55;
const WALL_BOUNCE_POP = 140; // small upward pop on bounce for extra juice

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

  /** -1 = wall to the left, 1 = wall to the right, 0 = no wall contact. Updated once per frame from the previous physics step. */
  touchingWallSide: -1 | 0 | 1 = 0;

  /** Ducking: holding down while grounded. Shrinks the hurtbox so high attacks whiff. */
  crouching = false;

  /** Swept off the feet: lying on the ground for the rest of the hitstun. */
  downed = false;

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
    this.touchingWallSide = 0;
    this.crouching = false;
    this.downed = false;
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

  takeHit(kind: AttackKind, damage: number, knockbackVx: number, knockbackVy: number, hitstun: number, blocked: boolean, knockdown = false): void {
    this.health = Math.max(0, this.health - damage);
    this.vx = knockbackVx;
    this.vy = knockbackVy;
    this.hitstunTimer = hitstun;
    this.downed = knockdown && !blocked;
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

  private tryStartAttack(intent: Intent): void {
    const punchPressed = intent.highPunchPressed || intent.lowPunchPressed;
    const kickPressed = intent.highKickPressed || intent.lowKickPressed;
    if (!punchPressed && !kickPressed) return;
    // Treat "still crouched" as down-held so duck moves never drop the input.
    const down = intent.fastFall || this.crouching;
    let kind: AttackKind;
    if (this.isDashing) {
      kind = "dashAttack";
    } else if (!this.grounded) {
      // In the air: punches jab, kicks swing big, down+kick dives.
      if (kickPressed && intent.fastFall) kind = "diveKick";
      else if (punchPressed) kind = "airPunch";
      else kind = "airKick";
    } else if (punchPressed && down) {
      // Classic MK duck+punch uppercut.
      kind = "launcher";
    } else if (kickPressed && down) {
      // Duck+kick: ankle sweep that knocks down.
      kind = "spinSweep";
    } else if (intent.highPunchPressed) {
      kind = "highPunch";
    } else if (intent.lowPunchPressed) {
      kind = "lowPunch";
    } else if (intent.highKickPressed) {
      kind = "highKick";
    } else {
      kind = "lowKick";
    }
    this.attackKind = kind;
    this.attackPhase = "startup";
    this.attackTimer = ATTACKS[kind].startup;
    this.attackHasHit = false;
    this.dashTimer = 0;
    this.events.push({ type: "attackStart", kind });
  }

  update(dt: number, intent: Intent, map: MapData): void {
    this.events.length = 0;
    const worldMinX = 0;
    const worldMaxX = map.width;

    if (this.koed) {
      this.vy += GRAVITY * dt;
      if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      const prevY = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const ground = resolveGround(this, map, prevY);
      if (ground.grounded) {
        this.vx = moveToward(this.vx, 0, GROUND_FRICTION * dt);
      }
      return;
    }

    if (this.dashCooldown > 0) this.dashCooldown -= dt;

    if (this.hitstunTimer > 0) {
      this.hitstunTimer -= dt;
      if (this.hitstunTimer <= 0) this.downed = false;
      this.blocking = false;
      this.crouching = false;
      let gravity = GRAVITY;
      this.vy += gravity * dt;
      if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      this.vx = moveToward(this.vx, 0, GROUND_FRICTION * 0.5 * dt);
      const prevY = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < worldMinX + this.radius) this.x = worldMinX + this.radius;
      if (this.x > worldMaxX - this.radius) this.x = worldMaxX - this.radius;
      const wasGrounded = this.grounded;
      const ground = resolveGround(this, map, prevY);
      this.grounded = ground.grounded;
      this.touchingWallSide = ground.wallHit;
      if (ground.grounded) {
        this.airJumpsUsed = 0;
        if (!wasGrounded && ground.impactSpeed > 200) {
          this.events.push({ type: "land", impactSpeed: ground.impactSpeed });
        }
      }
      if (ground.wallHit !== 0 && Math.abs(ground.wallImpactSpeed) > WALL_BOUNCE_MIN_SPEED) {
        this.vx = -ground.wallImpactSpeed * WALL_BOUNCE_DAMPING;
        this.vy = Math.min(this.vy, -WALL_BOUNCE_POP);
        this.events.push({ type: "wallBounce" });
      }
      this.checkBlastZone(map);
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
        const lunge = LUNGE_SPEED[kind];
        if (kind === "launcher" && this.grounded) {
          // MK uppercut: the whole body rises with the punch.
          this.vy = -380;
          this.grounded = false;
          this.vx = this.facing * 120;
        } else if (lunge && this.grounded) {
          this.vx = this.facing * lunge;
        } else if (kind === "airKick") {
          this.vx = this.facing * Math.max(Math.abs(this.vx), AIR_KICK_VX);
          this.vy = Math.max(this.vy, AIR_KICK_VY);
        }
      } else if (this.attackPhase === "active" && this.attackTimer <= 0) {
        this.attackPhase = "recovery";
        this.attackTimer = data.recovery;
      } else if (this.attackPhase === "recovery" && this.attackTimer <= 0) {
        this.attackPhase = null;
        this.attackKind = null;
      }
      // Per-move root motion.
      if (kind === "diveKick" && this.attackPhase === "active") {
        this.vx = this.facing * DIVE_KICK_VX;
        this.vy = DIVE_KICK_VY;
      } else if (kind === "airKick" && !this.grounded) {
        // MK jump kick: fully committed to the diagonal descent until landing.
        this.vx = this.facing * Math.max(Math.abs(this.vx), AIR_KICK_VX);
        if (this.vy < AIR_KICK_VY * 0.6) this.vy = AIR_KICK_VY * 0.6;
      } else if (kind === "dashAttack" && this.attackPhase !== "recovery") {
        this.vx = this.facing * DASH_ATTACK_SPEED;
      } else if (this.grounded) {
        // Grounded attacks: heavily damped movement. Aerials keep their momentum.
        this.vx = moveToward(this.vx, 0, GROUND_FRICTION * 0.6 * dt);
      }
      this.blocking = false;

      // Hit-confirm chaining: after connecting, recovery cancels into the next attack.
      if (this.attackPhase === "recovery" && this.attackHasHit) {
        this.tryStartAttack(intent);
      }
    } else {
      this.blocking = this.grounded && intent.block;
      this.crouching = this.grounded && intent.fastFall && !this.blocking && !this.isDashing;

      if (!this.blocking && intent.dashPressed && this.dashCooldown <= 0 && !this.isDashing) {
        this.dashTimer = DASH_DURATION;
        this.dashCooldown = DASH_COOLDOWN;
        this.dashDirection = intent.moveX !== 0 ? (intent.moveX as 1 | -1) : this.facing;
        this.events.push({ type: "dash" });
      }

      if (!this.blocking) this.tryStartAttack(intent);
    }

    if (this.isDashing) {
      this.dashTimer -= dt;
      this.vx = this.dashDirection * DASH_SPEED;
      this.vy = 0;
    } else if (!this.attackPhase) {
      const wasFacing = this.facing;
      if (intent.moveX !== 0 && !this.blocking) this.facing = intent.moveX;
      if (wasFacing !== this.facing) this.events.push({ type: "turn" });

      const targetVx = this.blocking || this.crouching ? 0 : intent.moveX * MOVE_SPEED;
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
        } else if (this.touchingWallSide !== 0) {
          this.vx = -this.touchingWallSide * WALL_JUMP_VX;
          this.vy = WALL_JUMP_VY;
          this.facing = -this.touchingWallSide as 1 | -1;
          this.airJumpsUsed = 0;
          this.touchingWallSide = 0;
          this.events.push({ type: "wallJump" });
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

      // Wall-slide: cap fall speed while airborne and holding into a wall, for wall-climb-style play.
      if (!this.grounded && this.touchingWallSide !== 0 && intent.moveX === this.touchingWallSide && this.vy > WALL_SLIDE_MAX_FALL) {
        this.vy = WALL_SLIDE_MAX_FALL;
      }
    } else {
      // Attacking: keep applying gravity if airborne.
      if (!this.grounded) {
        this.vy += GRAVITY * dt;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      }
    }

    const prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < worldMinX + this.radius) this.x = worldMinX + this.radius;
    if (this.x > worldMaxX - this.radius) this.x = worldMaxX - this.radius;

    const wasGrounded = this.grounded;
    const ground = resolveGround(this, map, prevY);
    this.grounded = ground.grounded;
    this.touchingWallSide = ground.grounded ? 0 : ground.wallHit;
    if (ground.grounded) {
      this.airJumpsUsed = 0;
      if (!wasGrounded && ground.impactSpeed > 200) {
        this.events.push({ type: "land", impactSpeed: ground.impactSpeed });
      }
      // Landing cancels aerial moves so play keeps flowing.
      if (!wasGrounded && this.attackPhase && AERIAL_KINDS.has(this.attackKind!)) {
        this.attackPhase = null;
        this.attackKind = null;
        this.attackTimer = 0;
      }
    }
    this.checkBlastZone(map);
  }

  checkBlastZone(map: MapData): void {
    if (!this.koed && this.y > map.height + 400) {
      this.health = 0;
      this.koed = true;
      this.events.push({ type: "ko" });
    }
  }
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/** Resolves solid walls (blocks all sides) and one-way platforms (land-on-top only). */
function resolveGround(
  f: Fighter,
  map: MapData,
  prevY: number
): { grounded: boolean; impactSpeed: number; wallHit: -1 | 0 | 1; wallImpactSpeed: number } {
  let grounded = false;
  let impactSpeed = 0;
  let wallHit: -1 | 0 | 1 = 0;
  let wallImpactSpeed = 0;

  for (const w of map.walls) {
    const left = f.x - f.radius;
    const right = f.x + f.radius;
    const top = f.y - f.height;
    const bottom = f.y;
    const wLeft = w.x;
    const wRight = w.x + w.w;
    const wTop = w.y;
    const wBottom = w.y + w.h;

    const overlapX = Math.min(right, wRight) - Math.max(left, wLeft);
    const overlapY = Math.min(bottom, wBottom) - Math.max(top, wTop);
    if (overlapX <= 0 || overlapY <= 0) continue;

    const fromLeft = right - wLeft;
    const fromRight = wRight - left;
    const fromTop = bottom - wTop;
    const fromBottom = wBottom - top;
    const minPen = Math.min(fromLeft, fromRight, fromTop, fromBottom);

    if (minPen === fromTop) {
      f.y = wTop;
      impactSpeed = Math.max(impactSpeed, f.vy);
      f.vy = 0;
      grounded = true;
    } else if (minPen === fromBottom) {
      f.y = wBottom + f.height;
      if (f.vy < 0) f.vy = 0;
    } else if (minPen === fromLeft) {
      f.x = wLeft - f.radius;
      if (f.vx > 0) {
        wallHit = 1;
        wallImpactSpeed = f.vx;
        f.vx = 0;
      }
    } else {
      f.x = wRight + f.radius;
      if (f.vx < 0) {
        wallHit = -1;
        wallImpactSpeed = f.vx;
        f.vx = 0;
      }
    }
  }

  if (f.vy >= 0) {
    for (const p of map.platforms) {
      const withinX = f.x + f.radius > p.x && f.x - f.radius < p.x + p.w;
      if (!withinX) continue;
      if (prevY <= p.y + 0.5 && f.y >= p.y) {
        f.y = p.y;
        impactSpeed = Math.max(impactSpeed, f.vy);
        f.vy = 0;
        grounded = true;
      }
    }
  }

  return { grounded, impactSpeed, wallHit, wallImpactSpeed };
}
