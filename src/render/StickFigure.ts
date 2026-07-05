import { Graphics, Container } from "pixi.js";
import type { Fighter } from "../core/Fighter";
import { ATTACKS, isHeavyKind } from "../core/Combat";
import { buildPose, blendPose, computeSkeleton, HEAD_R, type Pose, type Limb } from "./figurePose";

const STROKE = 6;

interface Ghost {
  x: number;
  y: number;
  facing: 1 | -1;
  phase: number;
  alpha: number;
}

export class StickFigureView {
  readonly view = new Container();
  private body = new Graphics();
  private ghostLayer = new Container();
  private color: number;

  private runPhase = 0;
  private squash = 1; // 1 = normal, <1 = squashed vertically (landing), >1 = stretched (jump takeoff)
  private squashVelocity = 0;
  private ghosts: Ghost[] = [];
  private ghostSpawnTimer = 0;
  private hitFlash = 0;
  private knockLean = 0;
  private knockLeanVelocity = 0;
  private stretchX = 1;
  private stretchXVelocity = 0;
  private stretchY = 1;
  private stretchYVelocity = 0;
  private tumble = 0; // spin while flying from a big hit
  private pose: Pose | null = null; // blended display pose
  private attackVariant = 0; // rerolled each strike so repeats look different
  private punchHand = false; // alternates which arm throws consecutive punches

  constructor(color: number) {
    this.color = color;
    this.view.addChild(this.ghostLayer);
    this.view.addChild(this.body);
    // Rotate the body around the torso center so tumbling reads naturally.
    this.body.pivot.set(0, -70);
    this.body.position.set(0, -70);
  }

  /** renderX/renderY are the interpolated positions; fall back to sim positions. */
  update(fighter: Fighter, dt: number, renderX?: number, renderY?: number): void {
    // Spring the squash factor back toward 1 (bouncy landing/takeoff feel).
    const stiffness = 90;
    const damping = 12;
    const accel = (1 - this.squash) * stiffness - this.squashVelocity * damping;
    this.squashVelocity += accel * dt;
    this.squash += this.squashVelocity * dt;

    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);

    const leanStiffness = 130;
    const leanDamping = 14;
    const leanAccel = -this.knockLean * leanStiffness - this.knockLeanVelocity * leanDamping;
    this.knockLeanVelocity += leanAccel * dt;
    this.knockLean += this.knockLeanVelocity * dt;

    const stretchStiffness = 140;
    const stretchDamping = 13;
    const stretchXAccel = (1 - this.stretchX) * stretchStiffness - this.stretchXVelocity * stretchDamping;
    this.stretchXVelocity += stretchXAccel * dt;
    this.stretchX += this.stretchXVelocity * dt;
    const stretchYAccel = (1 - this.stretchY) * stretchStiffness - this.stretchYVelocity * stretchDamping;
    this.stretchYVelocity += stretchYAccel * dt;
    this.stretchY += this.stretchYVelocity * dt;

    for (const ev of fighter.events) {
      if (ev.type === "attackStart") {
        this.attackVariant = Math.floor(Math.random() * 16);
        // Consecutive punches alternate hands.
        if (ev.kind === "lowPunch" || ev.kind === "highPunch" || ev.kind === "airPunch" || ev.kind === "launcher") {
          this.punchHand = !this.punchHand;
        }
      } else if (ev.type === "jump") {
        this.squash = 1.35;
        this.squashVelocity = 0;
      } else if (ev.type === "airJump") {
        this.squash = 1.25;
        this.squashVelocity = 0;
      } else if (ev.type === "land") {
        const t = Math.min(ev.impactSpeed / 1400, 1);
        this.squash = 1 - 0.4 * t;
        this.squashVelocity = 0;
      } else if (ev.type === "dash") {
        this.squash = 1.2;
        this.squashVelocity = 0;
        this.stretchX = 1.55;
        this.stretchXVelocity = 0;
        this.stretchY = 0.78;
        this.stretchYVelocity = 0;
      } else if (ev.type === "hitTaken") {
        this.hitFlash = 1;
        const heavy = isHeavyKind(ev.kind);
        this.squash = ev.blocked ? 0.92 : heavy ? 0.68 : 0.8;
        this.squashVelocity = 0;
        // World-space knock direction converted into facing-relative lean.
        this.knockLean = ev.blocked ? 0 : Math.sign(ev.knockbackVx || 1) * fighter.facing * (heavy ? 0.5 : 0.3);
        this.knockLeanVelocity = 0;
      } else if (ev.type === "wallJump") {
        this.squash = 1.3;
        this.squashVelocity = 0;
        this.stretchX = 1.3;
        this.stretchXVelocity = 0;
        this.stretchY = 0.85;
        this.stretchYVelocity = 0;
      } else if (ev.type === "wallBounce") {
        this.hitFlash = 1;
        this.squash = 0.7;
        this.squashVelocity = 0;
        this.knockLean = 0.4;
        this.knockLeanVelocity = 0;
      }
    }

    const speed = Math.abs(fighter.vx);
    if (fighter.grounded && speed > 10 && !fighter.isAttacking && !fighter.blocking) {
      this.runPhase += dt * (6 + speed * 0.012);
    } else if (fighter.grounded) {
      this.runPhase += dt * 2; // idle sway
    }

    // Tumble while flying from a heavy hit; spring upright otherwise.
    const flySpeed = Math.hypot(fighter.vx, fighter.vy);
    if (fighter.isStunned && !fighter.grounded && flySpeed > 650) {
      this.tumble += dt * 13 * Math.sign(fighter.vx || 1);
    } else {
      this.tumble *= Math.max(0, 1 - dt * 12);
      if (Math.abs(this.tumble) < 0.02) this.tumble = 0;
    }
    this.body.rotation = this.tumble;

    // Dash afterimage trail.
    if (fighter.isDashing) {
      this.ghostSpawnTimer -= dt;
      if (this.ghostSpawnTimer <= 0) {
        this.ghostSpawnTimer = 0.02;
        this.ghosts.push({ x: fighter.x, y: fighter.y, facing: fighter.facing, phase: this.runPhase, alpha: 0.45 });
      }
    }
    for (const g of this.ghosts) g.alpha -= dt * 2.2;
    this.ghosts = this.ghosts.filter((g) => g.alpha > 0.02);

    this.redraw(fighter, dt, renderX ?? fighter.x, renderY ?? fighter.y);
  }

  private redraw(fighter: Fighter, dt: number, x: number, y: number): void {
    this.body.clear();
    this.ghostLayer.removeChildren();

    for (const g of this.ghosts) {
      const gg = new Graphics();
      const ghostPose = buildPose(g.phase, true, 0, g.facing, null, false, false, 0, 0);
      drawSkeleton(gg, ghostPose, g.facing, this.color, g.alpha, true);
      gg.position.set(g.x - x, g.y - y);
      this.ghostLayer.addChild(gg);
    }

    const grounded = fighter.grounded;
    const speed = Math.abs(fighter.vx);
    const running = grounded && speed > 10 && !fighter.isAttacking && !fighter.blocking;
    const wallSliding =
      !grounded && fighter.touchingWallSide !== 0 && !fighter.isAttacking && !fighter.isStunned && !fighter.blocking;
    // Extension drives the strike: negative = chambered wind-up, 1 = full snap, partial = retracting.
    let attackExt = 0;
    if (fighter.attackKind && fighter.attackPhase === "startup") {
      attackExt = -0.45 * (1 - fighter.attackTimer / ATTACKS[fighter.attackKind].startup);
    } else if (fighter.attackPhase === "active") {
      attackExt = 1;
    } else if (fighter.attackPhase === "recovery") {
      attackExt = 0.55;
    }
    const target = buildPose(
      this.runPhase,
      running,
      fighter.vy,
      fighter.facing,
      fighter.isAttacking ? fighter.attackKind : null,
      fighter.blocking,
      fighter.isStunned,
      attackExt,
      this.knockLean,
      wallSliding,
      this.attackVariant,
      fighter.crouching,
    );
    // Alternate punching hands: swap arm targets so the other fist fires while
    // the first returns to guard.
    if (this.punchHand) {
      const hand = target.frontHand;
      target.frontHand = target.backHand;
      target.backHand = hand;
      const side = target.frontElbowSide;
      target.frontElbowSide = target.backElbowSide;
      target.backElbowSide = side;
    }
    // Blend toward the target pose so limbs flow between states instead of teleporting.
    // Strikes blend fast to keep the chamber/snap punch.
    const rate = fighter.attackPhase === "active" ? 55 : fighter.isAttacking || fighter.isDashing ? 34 : 16;
    const t = 1 - Math.exp(-dt * rate);
    this.pose = this.pose ? blendPose(this.pose, target, t) : target;

    const drawColor = this.hitFlash > 0.4 ? 0xffffff : this.color;
    drawSkeleton(this.body, this.pose, fighter.facing, drawColor, 1, false);

    this.view.position.set(x, y);
    // Squash/stretch composes with the dash stretch springs.
    const squash = Math.max(0.4, this.squash);
    this.view.scale.set(this.stretchX / Math.sqrt(squash), this.stretchY * squash);
  }
}

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function drawSkeleton(g: Graphics, pose: Pose, facing: 1 | -1, color: number, alpha: number, ghost: boolean): void {
  const sk = computeSkeleton(pose, facing);
  const dir = facing;
  const outline = darken(color, 0.3);

  const limbs: Limb[] = [sk.backLeg, sk.backArm, sk.frontLeg, sk.frontArm];

  const strokePass = (strokeColor: number, width: number, passAlpha: number) => {
    g.setStrokeStyle({ width, color: strokeColor, alpha: passAlpha, cap: "round", join: "round" });
    // Torso.
    g.moveTo(sk.hip.x, sk.hip.y);
    g.lineTo(sk.shoulder.x, sk.shoulder.y);
    g.stroke();
    // Limbs, back pair first so the front pair reads on top.
    for (const limb of limbs) {
      g.moveTo(limb.origin.x, limb.origin.y);
      g.lineTo(limb.mid.x, limb.mid.y);
      g.lineTo(limb.end.x, limb.end.y);
      g.stroke();
    }
  };

  // Dark outline underlayer gives the figure weight, then the color layer on top.
  if (!ghost) strokePass(outline, STROKE + 4, alpha);
  strokePass(color, STROKE, alpha);

  // Hands and feet.
  const tipR = STROKE * 0.72;
  for (const limb of limbs) {
    if (!ghost) {
      g.circle(limb.end.x, limb.end.y, tipR + 2);
      g.fill({ color: outline, alpha });
    }
    g.circle(limb.end.x, limb.end.y, tipR);
    g.fill({ color, alpha });
  }

  // Head: filled with an outline, plus an eye and a headband for character.
  const hx = sk.headCenter.x;
  const hy = sk.headCenter.y;
  g.circle(hx, hy, HEAD_R + (ghost ? 0 : 2));
  g.fill({ color: ghost ? color : outline, alpha });
  if (!ghost) {
    g.circle(hx, hy, HEAD_R);
    g.fill({ color, alpha });
    // Headband trailing behind the head.
    g.setStrokeStyle({ width: 3.5, color: 0xffffff, alpha: alpha * 0.9, cap: "round" });
    g.moveTo(hx - HEAD_R * 0.4 * dir, hy - 4);
    g.lineTo(hx - (HEAD_R + 12) * dir, hy - 8);
    g.stroke();
    g.moveTo(hx - HEAD_R * 0.4 * dir, hy - 2);
    g.lineTo(hx - (HEAD_R + 9) * dir, hy + 2);
    g.stroke();
    // Band across the forehead.
    g.setStrokeStyle({ width: 4, color: 0xffffff, alpha, cap: "round" });
    g.moveTo(hx - HEAD_R * 0.85 * dir, hy - 5);
    g.lineTo(hx + HEAD_R * 0.9 * dir, hy - 5);
    g.stroke();
    // Eye.
    g.circle(hx + HEAD_R * 0.45 * dir, hy + 3, 2.6);
    g.fill({ color: 0x0a0a0a, alpha });
  }
}
