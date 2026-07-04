import type { AttackKind } from "../core/Combat";

// Pure stick-figure pose math, kept free of rendering imports so poses can be
// previewed and tested outside the browser.

export interface Pose {
  frontLegSwing: number; // positive = forward
  backLegSwing: number;
  frontLegBend: number; // 0 = straight, 1 = fully folded
  backLegBend: number;
  frontArmSwing: number; // positive = forward reach
  backArmSwing: number;
  torsoLean: number; // radians of actual torso pitch; positive = head dips toward facing
  crouch: number; // 0..1, lowers hip
  scaleX: number;
  scaleY: number;
}

export const HEAD_R = 16;
export const TORSO_LEN = 52;
export const THIGH_LEN = 30;
export const SHIN_LEN = 28;
export const UPPER_ARM_LEN = 24;
export const FOREARM_LEN = 24;

export interface AttackPoseConfig {
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

// Positive swings reach forward (toward facing). torsoLean is real pitch now:
// 1.0 rad drops the head near hip height.
export const ATTACK_POSES: Record<AttackKind, AttackPoseConfig> = {
  // Punches: One Finger Death Punch style deep lunge, body committed behind the fist.
  lowPunch: { lean: 0.2, leanGain: 0.08, armBase: 0.4, armReach: 1.2, backArm: -0.5, frontLeg: 0.55, frontLegBend: 0.3, backLeg: -0.7, backLegBend: 0.05, crouch: 0.1 },
  highPunch: { lean: 0.3, leanGain: 0.12, armBase: 0.4, armReach: 1.7, backArm: -0.7, frontLeg: 0.7, frontLegBend: 0.35, backLeg: -0.85, backLegBend: 0.05, crouch: 0.12 },
  // Sweep: deep crouch, leg scythes along the ground.
  lowKick: { lean: 0.55, leanGain: 0.1, armBase: -0.3, armReach: -0.3, backArm: -0.5, frontLeg: 1.15, frontLegBend: 0.05, backLeg: -0.3, backLegBend: 0.55, crouch: 0.45 },
  // Liu Kang high kick: torso tips AWAY from the kick so the head ducks low
  // while the straight leg swings up in front, foot above the head.
  highKick: { lean: -1.15, leanGain: -0.05, armBase: -0.9, armReach: -0.3, backArm: -1.3, frontLeg: 3.0, frontLegBend: 0.03, backLeg: 0.0, backLegBend: 0.03, crouch: 0.08 },
  airPunch: { lean: 0.14, leanGain: 0.1, armBase: 0.4, armReach: 1.5, backArm: 0.4, frontLeg: 0.3, frontLegBend: 0.5, backLeg: -0.2, backLegBend: 0.6, crouch: 0 },
  // MK jump kick: leg thrust diagonally down-forward along the falling arc, other leg tucked.
  airKick: { lean: 0.25, leanGain: 0.1, armBase: -0.3, armReach: -0.3, backArm: -0.5, frontLeg: 1.25, frontLegBend: 0.05, backLeg: -0.2, backLegBend: 0.75, crouch: 0 },
  diveKick: { lean: 0.6, leanGain: 0.1, armBase: -0.7, armReach: -0.3, backArm: -0.9, frontLeg: 0.85, frontLegBend: 0.05, backLeg: 0.6, backLegBend: 0.1, crouch: 0 },
  launcher: { lean: -0.3, leanGain: -0.12, armBase: 0.8, armReach: 1.4, backArm: -0.4, frontLeg: 0.2, frontLegBend: 0.3, backLeg: -0.2, backLegBend: 0.35, crouch: 0.25 },
  // Shoulder rush: low, long, head-first lunge.
  dashAttack: { lean: 0.55, leanGain: 0.1, armBase: 0.5, armReach: 1.6, backArm: -0.7, frontLeg: 0.8, frontLegBend: 0.35, backLeg: -0.9, backLegBend: 0.05, crouch: 0.2 },
};

/** Configs whose front leg is the striking limb. */
export function isKickPose(cfg: AttackPoseConfig): boolean {
  return cfg.frontLeg > 0.7;
}

export function buildPose(
  phase: number,
  running: boolean,
  vy: number,
  squash: number,
  _facing: 1 | -1,
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
    torsoLean = -0.35;
    frontArmSwing = -0.5;
    backArmSwing = -0.8;
    frontLegBend = 0.25;
    backLegBend = 0.25;
    frontLegSwing = 0.3;
    backLegSwing = -0.2;
  } else if (attackKind) {
    const cfg = ATTACK_POSES[attackKind];
    const ext = attackProgress; // negative = chambered, 1 = full snap
    const kick = isKickPose(cfg);
    if (ext < 0) {
      // Wind-up: coil the body and chamber the striking limb before the snap.
      const w = Math.min(-ext / 0.45, 1);
      torsoLean = -0.15 * w;
      crouch = cfg.crouch + 0.12 * w;
      if (kick) {
        frontLegSwing = 0.45 * w;
        frontLegBend = 0.9 * w; // knee raised, ready to fire
        backLegSwing = cfg.backLeg;
        backLegBend = cfg.backLegBend;
        frontArmSwing = 0.5;
        backArmSwing = 0.3;
      } else {
        frontArmSwing = cfg.armBase - 0.9 * w; // fist drawn back
        backArmSwing = 0.4;
        frontLegSwing = cfg.frontLeg * 0.4;
        backLegSwing = cfg.backLeg;
        frontLegBend = cfg.frontLegBend;
        backLegBend = cfg.backLegBend;
      }
    } else {
      torsoLean = cfg.lean + ext * cfg.leanGain;
      frontArmSwing = cfg.armBase + cfg.armReach * ext;
      backArmSwing = cfg.backArm;
      frontLegSwing = kick ? cfg.frontLeg * ext : cfg.frontLeg;
      backLegSwing = cfg.backLeg;
      frontLegBend = kick ? cfg.frontLegBend + (1 - ext) * 0.4 : cfg.frontLegBend;
      backLegBend = cfg.backLegBend;
      crouch = cfg.crouch;
    }
  } else if (blocking) {
    frontArmSwing = 1.0;
    backArmSwing = 0.8;
    torsoLean = 0.08;
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
    torsoLean = -0.22;
    crouch = 0.08;
  } else if (running) {
    const s = Math.sin(phase);
    frontLegSwing = s;
    backLegSwing = -s;
    frontLegBend = 0.15 + 0.1 * Math.abs(s);
    backLegBend = 0.15 + 0.1 * Math.abs(s);
    torsoLean = 0.14;
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
      torsoLean = 0.08;
    }
  } else {
    // Fighting-ready idle: staggered stance, loose guard, gentle sway.
    const s = Math.sin(phase) * 0.05;
    frontLegSwing = 0.28 + s;
    backLegSwing = -0.28 + s;
    frontLegBend = 0.18;
    backLegBend = 0.14;
    frontArmSwing = 0.6 + s * 2;
    backArmSwing = 0.35 - s * 2;
    torsoLean = 0.12;
    crouch = 0.08;
  }

  return {
    frontLegSwing,
    backLegSwing,
    frontLegBend,
    backLegBend,
    frontArmSwing,
    backArmSwing,
    torsoLean: torsoLean + knockLean,
    crouch,
    scaleX: 1 / Math.sqrt(squash),
    scaleY: squash,
  };
}

/** Linear pose blend for animation smoothing. */
export function blendPose(from: Pose, to: Pose, t: number): Pose {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    frontLegSwing: lerp(from.frontLegSwing, to.frontLegSwing),
    backLegSwing: lerp(from.backLegSwing, to.backLegSwing),
    frontLegBend: lerp(from.frontLegBend, to.frontLegBend),
    backLegBend: lerp(from.backLegBend, to.backLegBend),
    frontArmSwing: lerp(from.frontArmSwing, to.frontArmSwing),
    backArmSwing: lerp(from.backArmSwing, to.backArmSwing),
    torsoLean: lerp(from.torsoLean, to.torsoLean),
    crouch: lerp(from.crouch, to.crouch),
    scaleX: lerp(from.scaleX, to.scaleX),
    scaleY: lerp(from.scaleY, to.scaleY),
  };
}

export interface Pt {
  x: number;
  y: number;
}

export interface Limb {
  origin: Pt;
  mid: Pt;
  end: Pt;
}

export interface Skeleton {
  hip: Pt;
  shoulder: Pt;
  headCenter: Pt;
  frontLeg: Limb;
  backLeg: Limb;
  frontArm: Limb;
  backArm: Limb;
}

/** Computes elbow/knee and hand/foot positions for one limb. Positive swing = forward. */
function limbPoints(origin: Pt, swing: number, bend: number, upperLen: number, lowerLen: number, dir: number): Limb {
  const upperAngle = Math.PI / 2 - swing * 0.9;
  const mid = {
    x: origin.x + Math.cos(upperAngle) * upperLen * dir,
    y: origin.y + Math.sin(upperAngle) * upperLen,
  };
  const lowerAngle = upperAngle + bend * 1.7;
  const end = {
    x: mid.x + Math.cos(lowerAngle) * lowerLen * dir,
    y: mid.y + Math.sin(lowerAngle) * lowerLen,
  };
  return { origin, mid, end };
}

/**
 * Full skeleton in feet-origin local space (y up = negative). The torso
 * genuinely pitches with torsoLean, so a big lean drops the head.
 */
export function computeSkeleton(pose: Pose, facing: 1 | -1): Skeleton {
  const sy = pose.scaleY;
  const dir = facing;
  const lean = Math.max(-1.45, Math.min(1.45, pose.torsoLean));

  const hip: Pt = { x: 0, y: -(THIGH_LEN + SHIN_LEN) * sy * (1 - pose.crouch * 0.3) };
  const shoulder: Pt = {
    x: hip.x + Math.sin(lean) * TORSO_LEN * sy * dir,
    y: hip.y - Math.cos(lean) * TORSO_LEN * sy,
  };
  const headDist = HEAD_R + 4;
  const headCenter: Pt = {
    x: shoulder.x + Math.sin(lean) * headDist * dir,
    y: shoulder.y - Math.cos(lean) * headDist,
  };

  return {
    hip,
    shoulder,
    headCenter,
    frontLeg: limbPoints(hip, pose.frontLegSwing, pose.frontLegBend, THIGH_LEN * sy, SHIN_LEN * sy, dir),
    backLeg: limbPoints(hip, pose.backLegSwing, pose.backLegBend, THIGH_LEN * sy, SHIN_LEN * sy, dir),
    frontArm: limbPoints(shoulder, pose.frontArmSwing, 0.15, UPPER_ARM_LEN * sy, FOREARM_LEN * sy, dir),
    backArm: limbPoints(shoulder, pose.backArmSwing, 0.15, UPPER_ARM_LEN * sy, FOREARM_LEN * sy, dir),
  };
}
