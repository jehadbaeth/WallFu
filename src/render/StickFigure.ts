import { Graphics, Container } from "pixi.js";
import type { Fighter } from "../core/Fighter";
import { ATTACKS } from "../core/Combat";

interface Pose {
  legSwing: number; // -1..1
  legBend: number; // 0..1, 0 = straight, 1 = fully tucked
  frontArmSwing: number; // radians-ish, forward reach
  backArmSwing: number;
  torsoLean: number; // radians, forward lean
  crouch: number; // 0..1, lowers hip
  scaleX: number;
  scaleY: number;
}

const HEAD_R = 16;
const TORSO_LEN = 52;
const THIGH_LEN = 30;
const SHIN_LEN = 28;
const UPPER_ARM_LEN = 24;
const FOREARM_LEN = 24;
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

  constructor(color: number) {
    this.color = color;
    this.view.addChild(this.ghostLayer);
    this.view.addChild(this.body);
  }

  update(fighter: Fighter, dt: number): void {
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
      if (ev.type === "jump") {
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
        const heavy = ev.kind === "heavy";
        this.squash = ev.blocked ? 0.92 : heavy ? 0.68 : 0.8;
        this.squashVelocity = 0;
        this.knockLean = ev.blocked ? 0 : Math.sign(ev.knockbackVx || 1) * (heavy ? 0.5 : 0.3);
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
        this.knockLean = Math.sign(fighter.vx || 1) * 0.4;
        this.knockLeanVelocity = 0;
      }
    }

    const speed = Math.abs(fighter.vx);
    if (fighter.grounded && speed > 10 && !fighter.isAttacking && !fighter.blocking) {
      this.runPhase += dt * (6 + speed * 0.012);
    } else if (fighter.grounded) {
      this.runPhase += dt * 2; // idle sway
    }

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

    this.redraw(fighter);
  }

  private redraw(fighter: Fighter): void {
    this.body.clear();
    this.ghostLayer.removeChildren();

    for (const g of this.ghosts) {
      const gg = new Graphics();
      drawSkeleton(gg, buildPose(this.runPhase, false, 0, 1, g.facing, null, false, false, 0, 0), g.facing, this.color, g.alpha);
      gg.position.set(g.x - fighter.x, g.y - fighter.y);
      this.ghostLayer.addChild(gg);
    }

    const grounded = fighter.grounded;
    const speed = Math.abs(fighter.vx);
    const running = grounded && speed > 10 && !fighter.isAttacking && !fighter.blocking;
    const wallSliding =
      !grounded && fighter.touchingWallSide !== 0 && !fighter.isAttacking && !fighter.isStunned && !fighter.blocking;
    const pose = buildPose(
      this.runPhase,
      running,
      fighter.vy,
      this.squash,
      fighter.facing,
      fighter.isAttacking ? fighter.attackKind : null,
      fighter.blocking,
      fighter.isStunned,
      fighter.attackPhase === "startup" && fighter.attackKind
        ? 1 - fighter.attackTimer / ATTACKS[fighter.attackKind].startup
        : fighter.attackPhase === "active"
          ? 1
          : 0,
      this.knockLean,
      wallSliding,
    );
    const drawColor = this.hitFlash > 0.4 ? 0xffffff : this.color;
    drawSkeleton(this.body, pose, fighter.facing, drawColor, 1);

    this.view.position.set(fighter.x, fighter.y);
    this.view.scale.set(this.stretchX, this.stretchY);
  }
}

function buildPose(
  phase: number,
  running: boolean,
  vy: number,
  squash: number,
  facing: 1 | -1,
  attackKind: "light" | "heavy" | null,
  blocking: boolean,
  stunned: boolean,
  attackProgress: number,
  knockLean: number,
  wallSliding = false,
): Pose {
  let legSwing = 0;
  let armSwing = 0;
  let legBend = 0;
  let torsoLean = 0;
  let frontArmSwing = 0;
  let backArmSwing = 0;
  let crouch = 0;

  if (stunned) {
    torsoLean = -0.35 * facing;
    frontArmSwing = -0.4;
    backArmSwing = -0.7;
    legBend = 0.2;
  } else if (attackKind) {
    const reach = attackKind === "heavy" ? 1.9 : 1.5;
    torsoLean = (0.15 + attackProgress * 0.15) * facing;
    frontArmSwing = 0.3 + reach * Math.min(attackProgress * 1.6, 1);
    backArmSwing = -0.5;
    legBend = attackKind === "heavy" ? 0.3 : 0.15;
    crouch = attackKind === "heavy" ? 0.1 : 0;
  } else if (blocking) {
    frontArmSwing = 1.1;
    backArmSwing = 0.9;
    torsoLean = 0.05 * facing;
    crouch = 0.15;
  } else if (running) {
    legSwing = Math.sin(phase);
    armSwing = -Math.sin(phase);
    torsoLean = 0.08 * facing;
    frontArmSwing = armSwing;
    backArmSwing = -armSwing;
  } else if (wallSliding) {
    // Braced against a wall: legs bent and pushing off it, torso leaning back away from it.
    legBend = 0.5;
    legSwing = 0.25;
    frontArmSwing = 0.9;
    backArmSwing = 0.6;
    torsoLean = -0.22 * facing;
    crouch = 0.08;
  } else if (Math.abs(vy) > 5) {
    // Airborne pose: tuck legs going up, extend going down.
    if (vy < 0) {
      legBend = Math.min(-vy / 800, 1);
      frontArmSwing = 0.6;
      backArmSwing = 0.6;
    } else {
      legBend = 0.15;
      frontArmSwing = -0.3;
      backArmSwing = -0.3;
      torsoLean = 0.05 * facing;
    }
  } else {
    legSwing = Math.sin(phase) * 0.08;
    frontArmSwing = 0;
    backArmSwing = 0;
  }

  return {
    legSwing,
    legBend,
    frontArmSwing,
    backArmSwing,
    torsoLean: torsoLean + knockLean * facing,
    crouch,
    scaleX: 1 / Math.sqrt(squash),
    scaleY: squash,
  };
}

function drawSkeleton(g: Graphics, pose: Pose, facing: 1 | -1, color: number, alpha: number): void {
  const sx = pose.scaleX * facing;
  const sy = pose.scaleY;

  const hipX = 0;
  const hipY = -(THIGH_LEN + SHIN_LEN) * sy * (1 - pose.crouch * 0.3);
  const shoulderX = pose.torsoLean * 20;
  const shoulderY = hipY - TORSO_LEN * sy;
  const neckY = shoulderY - 4;
  const headCenterY = neckY - HEAD_R;

  g.setStrokeStyle({ width: STROKE, color, alpha, cap: "round", join: "round" });

  // Torso.
  g.moveTo(hipX * sx, hipY);
  g.lineTo(shoulderX * sx, shoulderY);
  g.stroke();

  // Head.
  g.circle(shoulderX * sx, headCenterY, HEAD_R);
  g.stroke();

  // Legs: front and back leg offset by phase for a running scissor motion.
  drawLimb(g, hipX * sx, hipY, pose.legSwing, pose.legBend, THIGH_LEN * sy, SHIN_LEN * sy, sx, color, alpha, true);
  drawLimb(g, hipX * sx, hipY, -pose.legSwing, pose.legBend, THIGH_LEN * sy, SHIN_LEN * sy, sx, color, alpha, true);

  // Arms: front arm reaches toward facing direction, back arm trails.
  drawLimb(g, shoulderX * sx, shoulderY, pose.frontArmSwing, 0, UPPER_ARM_LEN * sy, FOREARM_LEN * sy, sx, color, alpha, false);
  drawLimb(g, shoulderX * sx, shoulderY, pose.backArmSwing, 0, UPPER_ARM_LEN * sy, FOREARM_LEN * sy, sx, color, alpha, false);
}

function drawLimb(
  g: Graphics,
  originX: number,
  originY: number,
  swing: number,
  bend: number,
  upperLen: number,
  lowerLen: number,
  sx: number,
  color: number,
  alpha: number,
  isLeg: boolean,
): void {
  const baseAngle = isLeg ? Math.PI / 2 : Math.PI / 2;
  const swingAngle = swing * 0.9;
  const upperAngle = baseAngle + swingAngle - bend * 0.9;
  const kneeX = originX + Math.cos(upperAngle) * upperLen * Math.sign(sx || 1);
  const kneeY = originY + Math.sin(upperAngle) * upperLen;

  const lowerAngle = upperAngle + bend * 1.6 - swingAngle * 0.4;
  const footX = kneeX + Math.cos(lowerAngle) * lowerLen * Math.sign(sx || 1);
  const footY = kneeY + Math.sin(lowerAngle) * lowerLen;

  g.setStrokeStyle({ width: STROKE, color, alpha, cap: "round", join: "round" });
  g.moveTo(originX, originY);
  g.lineTo(kneeX, kneeY);
  g.lineTo(footX, footY);
  g.stroke();
}
