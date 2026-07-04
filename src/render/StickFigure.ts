import { Graphics, Container } from "pixi.js";
import type { Fighter } from "../core/Fighter";
import { ATTACKS, isHeavyKind, type AttackKind } from "../core/Combat";

interface Pose {
  frontLegSwing: number; // positive = forward
  backLegSwing: number;
  frontLegBend: number; // 0 = straight, 1 = fully folded
  backLegBend: number;
  frontArmSwing: number; // positive = forward reach
  backArmSwing: number;
  torsoLean: number; // radians, positive = forward lean
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
        const heavy = isHeavyKind(ev.kind);
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
      drawSkeleton(gg, buildPose(this.runPhase, false, 0, 1, g.facing, null, false, false, 0, 0), g.facing, this.color, g.alpha, true);
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
    drawSkeleton(this.body, pose, fighter.facing, drawColor, 1, false);

    this.view.position.set(fighter.x, fighter.y);
    this.view.scale.set(this.stretchX, this.stretchY);
  }
}

interface AttackPoseConfig {
  lean: number;
  leanGain: number;
  armBase: number;
  armReach: number;
  backArm: number;
  frontLeg: number;
  frontLegBend: number;
  backLeg: number;
  backLegBend: number;
  crouch: number;
}

// Positive swings reach forward (toward facing).
const ATTACK_POSES: Record<AttackKind, AttackPoseConfig> = {
  lowPunch: { lean: 0.12, leanGain: 0.1, armBase: 0.4, armReach: 1.2, backArm: 0.5, frontLeg: 0.15, frontLegBend: 0.1, backLeg: -0.15, backLegBend: 0.1, crouch: 0.05 },
  highPunch: { lean: 0.18, leanGain: 0.15, armBase: 0.4, armReach: 1.7, backArm: 0.3, frontLeg: 0.2, frontLegBend: 0.1, backLeg: -0.2, backLegBend: 0.15, crouch: 0.05 },
  lowKick: { lean: 0.25, leanGain: 0.1, armBase: -0.2, armReach: -0.3, backArm: -0.4, frontLeg: 0.9, frontLegBend: 0.1, backLeg: -0.2, backLegBend: 0.45, crouch: 0.3 },
  highKick: { lean: -0.12, leanGain: -0.06, armBase: -0.3, armReach: -0.3, backArm: -0.5, frontLeg: 1.9, frontLegBend: 0.05, backLeg: -0.15, backLegBend: 0.2, crouch: 0.1 },
  airPunch: { lean: 0.12, leanGain: 0.1, armBase: 0.4, armReach: 1.5, backArm: 0.4, frontLeg: 0.3, frontLegBend: 0.5, backLeg: -0.2, backLegBend: 0.6, crouch: 0 },
  airKick: { lean: 0.1, leanGain: 0.1, armBase: -0.2, armReach: -0.3, backArm: -0.4, frontLeg: 1.7, frontLegBend: 0.05, backLeg: -0.3, backLegBend: 0.6, crouch: 0 },
  diveKick: { lean: 0.55, leanGain: 0.1, armBase: -0.7, armReach: -0.3, backArm: -0.9, frontLeg: 0.85, frontLegBend: 0.05, backLeg: 0.6, backLegBend: 0.1, crouch: 0 },
  launcher: { lean: -0.2, leanGain: -0.1, armBase: 0.8, armReach: 1.4, backArm: -0.4, frontLeg: 0.2, frontLegBend: 0.3, backLeg: -0.2, backLegBend: 0.35, crouch: 0.25 },
  dashAttack: { lean: 0.4, leanGain: 0.1, armBase: 0.5, armReach: 1.6, backArm: -0.7, frontLeg: 0.6, frontLegBend: 0.2, backLeg: -0.4, backLegBend: 0.3, crouch: 0.15 },
};

function buildPose(
  phase: number,
  running: boolean,
  vy: number,
  squash: number,
  facing: 1 | -1,
  attackKind: AttackKind | null,
  blocking: boolean,
  stunned: boolean,
  attackProgress: number,
  knockLean: number,
  wallSliding = false,
): Pose {
  let frontLegSwing = 0;
  let backLegSwing = 0;
  let frontLegBend = 0;
  let backLegBend = 0;
  let torsoLean = 0;
  let frontArmSwing = 0;
  let backArmSwing = 0;
  let crouch = 0;

  if (stunned) {
    torsoLean = -0.35 * facing;
    frontArmSwing = -0.5;
    backArmSwing = -0.8;
    frontLegBend = 0.25;
    backLegBend = 0.25;
    frontLegSwing = 0.3;
    backLegSwing = -0.2;
  } else if (attackKind) {
    const cfg = ATTACK_POSES[attackKind];
    const p = Math.min(attackProgress * 1.6, 1);
    torsoLean = (cfg.lean + attackProgress * cfg.leanGain) * facing;
    frontArmSwing = cfg.armBase + cfg.armReach * p;
    backArmSwing = cfg.backArm;
    // Kicking legs extend with the attack progress too.
    frontLegSwing = cfg.frontLeg * (cfg.frontLeg > 0.7 ? p : 1);
    backLegSwing = cfg.backLeg;
    frontLegBend = cfg.frontLegBend;
    backLegBend = cfg.backLegBend;
    crouch = cfg.crouch;
  } else if (blocking) {
    frontArmSwing = 1.0;
    backArmSwing = 0.8;
    torsoLean = 0.05 * facing;
    crouch = 0.15;
    frontLegBend = 0.15;
    backLegBend = 0.15;
  } else if (wallSliding) {
    // Braced against a wall: legs bent and pushing off it, torso leaning back away from it.
    frontLegSwing = 0.3;
    backLegSwing = 0.1;
    frontLegBend = 0.5;
    backLegBend = 0.5;
    frontArmSwing = 0.9;
    backArmSwing = 0.6;
    torsoLean = -0.22 * facing;
    crouch = 0.08;
  } else if (running) {
    const s = Math.sin(phase);
    frontLegSwing = s;
    backLegSwing = -s;
    frontLegBend = 0.15 + 0.1 * Math.abs(s);
    backLegBend = 0.15 + 0.1 * Math.abs(s);
    torsoLean = 0.08 * facing;
    frontArmSwing = -s * 0.8;
    backArmSwing = s * 0.8;
  } else if (Math.abs(vy) > 5) {
    // Airborne pose: tuck legs going up, extend going down.
    if (vy < 0) {
      const tuck = Math.min(-vy / 800, 1);
      frontLegBend = tuck;
      backLegBend = tuck * 0.8;
      frontLegSwing = 0.2;
      backLegSwing = -0.1;
      frontArmSwing = 0.6;
      backArmSwing = 0.6;
    } else {
      frontLegBend = 0.15;
      backLegBend = 0.2;
      frontLegSwing = 0.15;
      backLegSwing = -0.15;
      frontArmSwing = -0.3;
      backArmSwing = -0.3;
      torsoLean = 0.05 * facing;
    }
  } else {
    const s = Math.sin(phase) * 0.08;
    frontLegSwing = s;
    backLegSwing = -s;
    frontLegBend = 0.05;
    backLegBend = 0.05;
  }

  return {
    frontLegSwing,
    backLegSwing,
    frontLegBend,
    backLegBend,
    frontArmSwing,
    backArmSwing,
    torsoLean: torsoLean + knockLean * facing,
    crouch,
    scaleX: 1 / Math.sqrt(squash),
    scaleY: squash,
  };
}

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Computes elbow/knee and hand/foot positions for one limb. Positive swing = forward (toward facing). */
function limbPoints(
  originX: number,
  originY: number,
  swing: number,
  bend: number,
  upperLen: number,
  lowerLen: number,
  dir: number,
): { midX: number; midY: number; endX: number; endY: number } {
  const upperAngle = Math.PI / 2 - swing * 0.9;
  const midX = originX + Math.cos(upperAngle) * upperLen * dir;
  const midY = originY + Math.sin(upperAngle) * upperLen;
  const lowerAngle = upperAngle + bend * 1.7;
  const endX = midX + Math.cos(lowerAngle) * lowerLen * dir;
  const endY = midY + Math.sin(lowerAngle) * lowerLen;
  return { midX, midY, endX, endY };
}

function drawSkeleton(g: Graphics, pose: Pose, facing: 1 | -1, color: number, alpha: number, ghost: boolean): void {
  const sx = pose.scaleX * facing;
  const sy = pose.scaleY;
  const dir = Math.sign(sx || 1);

  const hipX = 0;
  const hipY = -(THIGH_LEN + SHIN_LEN) * sy * (1 - pose.crouch * 0.3);
  const shoulderX = pose.torsoLean * 20 * dir;
  const shoulderY = hipY - TORSO_LEN * sy;
  const neckY = shoulderY - 4;
  const headCenterX = shoulderX + pose.torsoLean * 8 * dir;
  const headCenterY = neckY - HEAD_R;

  const frontLeg = limbPoints(hipX, hipY, pose.frontLegSwing, pose.frontLegBend, THIGH_LEN * sy, SHIN_LEN * sy, dir);
  const backLeg = limbPoints(hipX, hipY, pose.backLegSwing, pose.backLegBend, THIGH_LEN * sy, SHIN_LEN * sy, dir);
  const frontArm = limbPoints(shoulderX, shoulderY, pose.frontArmSwing, 0.15, UPPER_ARM_LEN * sy, FOREARM_LEN * sy, dir);
  const backArm = limbPoints(shoulderX, shoulderY, pose.backArmSwing, 0.15, UPPER_ARM_LEN * sy, FOREARM_LEN * sy, dir);

  const outline = darken(color, 0.3);

  const strokePass = (strokeColor: number, width: number, passAlpha: number) => {
    g.setStrokeStyle({ width, color: strokeColor, alpha: passAlpha, cap: "round", join: "round" });
    // Torso.
    g.moveTo(hipX, hipY);
    g.lineTo(shoulderX, shoulderY);
    g.stroke();
    // Limbs, back pair first so the front pair reads on top.
    for (const limb of [backLeg, backArm, frontLeg, frontArm]) {
      g.moveTo(limb === backLeg || limb === frontLeg ? hipX : shoulderX, limb === backLeg || limb === frontLeg ? hipY : shoulderY);
      g.lineTo(limb.midX, limb.midY);
      g.lineTo(limb.endX, limb.endY);
      g.stroke();
    }
  };

  // Dark outline underlayer gives the figure weight, then the color layer on top.
  if (!ghost) strokePass(outline, STROKE + 4, alpha);
  strokePass(color, STROKE, alpha);

  // Hands and feet.
  const tipR = STROKE * 0.72;
  for (const limb of [backLeg, backArm, frontLeg, frontArm]) {
    if (!ghost) {
      g.circle(limb.endX, limb.endY, tipR + 2);
      g.fill({ color: outline, alpha });
    }
    g.circle(limb.endX, limb.endY, tipR);
    g.fill({ color, alpha });
  }

  // Head: filled with an outline, plus an eye and a headband for character.
  g.circle(headCenterX, headCenterY, HEAD_R + (ghost ? 0 : 2));
  g.fill({ color: ghost ? color : outline, alpha });
  if (!ghost) {
    g.circle(headCenterX, headCenterY, HEAD_R);
    g.fill({ color, alpha });
    // Headband trailing behind the head.
    g.setStrokeStyle({ width: 3.5, color: 0xffffff, alpha: alpha * 0.9, cap: "round" });
    g.moveTo(headCenterX - HEAD_R * 0.4 * dir, headCenterY - 4);
    g.lineTo(headCenterX - (HEAD_R + 12) * dir, headCenterY - 8);
    g.stroke();
    g.moveTo(headCenterX - HEAD_R * 0.4 * dir, headCenterY - 2);
    g.lineTo(headCenterX - (HEAD_R + 9) * dir, headCenterY + 2);
    g.stroke();
    // Band across the forehead.
    g.setStrokeStyle({ width: 4, color: 0xffffff, alpha, cap: "round" });
    g.moveTo(headCenterX - HEAD_R * 0.85 * dir, headCenterY - 5);
    g.lineTo(headCenterX + HEAD_R * 0.9 * dir, headCenterY - 5);
    g.stroke();
    // Eye.
    g.circle(headCenterX + HEAD_R * 0.45 * dir, headCenterY + 3, 2.6);
    g.fill({ color: 0x0a0a0a, alpha });
  }
}
