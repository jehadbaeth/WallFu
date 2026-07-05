import type { AttackKind } from "../core/Combat";

// Stick-figure pose model, rebuilt around inverse kinematics: poses declare
// WHERE hands and feet should be, and elbows/knees solve themselves. Kept free
// of rendering imports so poses can be previewed and tested outside the browser.
//
// Conventions (before mirroring by facing):
//  - Local space origin at the feet, y negative = up, x positive = forward.
//  - Foot targets are absolute in local space (ground is y=0).
//  - Hand targets are relative to the SHOULDER, so guards track the torso.

export interface Pt {
  x: number;
  y: number;
}

export interface Pose {
  torsoPitch: number; // radians; positive = head dips toward facing
  crouch: number; // 0..1, lowers hip
  frontHand: Pt; // relative to shoulder
  backHand: Pt;
  frontFoot: Pt; // absolute local space
  backFoot: Pt;
  frontElbowSide: 1 | -1; // which side of the shoulder->hand line the elbow pops out
  backElbowSide: 1 | -1;
  frontKneeSide: 1 | -1;
  backKneeSide: 1 | -1;
}

export const HEAD_R = 16;
export const TORSO_LEN = 52;
export const THIGH_LEN = 30;
export const SHIN_LEN = 28;
export const UPPER_ARM_LEN = 28;
export const FOREARM_LEN = 28;
const LEG_LEN = THIGH_LEN + SHIN_LEN;

// Boxer guard: fists chambered by the chin (relative to shoulder).
const GUARD_FRONT: Pt = { x: 17, y: -7 };
const GUARD_BACK: Pt = { x: 11, y: -3 };
// Striking hand fully chambered before the punch fires.
const CHAMBER_HAND: Pt = { x: 8, y: -2 };
// Kick chamber: knee up, foot cocked near the standing knee.
const CHAMBER_FOOT: Pt = { x: 22, y: -34 };

function pt(x: number, y: number): Pt {
  return { x, y };
}

export interface AttackPoseConfig {
  pitch: number; // torso pitch at full extension
  pitchGain: number; // extra pitch as ext goes 0->1
  crouch: number;
  kick: boolean; // striking limb: front foot (kick) or front hand (punch)
  strike: Pt; // strike target at full extension (hand: rel shoulder; foot: absolute)
  offHand: Pt; // non-striking hand, rel shoulder
  stanceFront: Pt; // absolute feet; for kicks stanceFront is ignored (foot strikes)
  stanceBack: Pt;
  elbowSide?: 1 | -1;
  kneeSide?: 1 | -1;
}

// Every attack has multiple pose variants, picked randomly per strike so
// repeated hits never look identical (One Finger Death Punch style).
export const ATTACK_POSES: Record<AttackKind, AttackPoseConfig[]> = {
  lowPunch: [
    // Straight jab from the chin: OFDP lunge, low hips, full split.
    { pitch: 0.18, pitchGain: 0.08, crouch: 0.4, kick: false, strike: pt(60, -4), offHand: GUARD_FRONT, stanceFront: pt(30, 0), stanceBack: pt(-30, 0) },
    // Backfist snapping up beside the head.
    { pitch: 0.06, pitchGain: 0.06, crouch: 0.25, kick: false, strike: pt(50, -30), offHand: GUARD_FRONT, stanceFront: pt(24, 0), stanceBack: pt(-24, 0) },
    // Body hook: elbow stays flared through the arc.
    { pitch: 0.3, pitchGain: 0.08, crouch: 0.4, kick: false, strike: pt(48, 10), offHand: GUARD_FRONT, stanceFront: pt(28, 0), stanceBack: pt(-28, 0), elbowSide: -1 },
  ],
  highPunch: [
    // Long cross off a deep OFDP split lunge.
    { pitch: 0.32, pitchGain: 0.12, crouch: 0.55, kick: false, strike: pt(68, -6), offHand: GUARD_FRONT, stanceFront: pt(38, 0), stanceBack: pt(-38, 0) },
    // Overhand looping down onto the head.
    { pitch: 0.42, pitchGain: 0.1, crouch: 0.5, kick: false, strike: pt(58, -26), offHand: GUARD_FRONT, stanceFront: pt(34, 0), stanceBack: pt(-34, 0), elbowSide: -1 },
    // Rising straight to the jaw.
    { pitch: 0.1, pitchGain: 0.08, crouch: 0.4, kick: false, strike: pt(60, -20), offHand: GUARD_FRONT, stanceFront: pt(28, 0), stanceBack: pt(-32, 0) },
  ],
  lowKick: [
    // Deep squat sweep, leg scything just above the ground.
    { pitch: 0.5, pitchGain: 0.08, crouch: 0.85, kick: true, strike: pt(54, -4), offHand: pt(-14, 8), stanceFront: pt(0, 0), stanceBack: pt(-14, 0) },
    // Snapping shin kick, guard kept up.
    { pitch: 0.24, pitchGain: 0.08, crouch: 0.3, kick: true, strike: pt(52, -20), offHand: GUARD_FRONT, stanceFront: pt(0, 0), stanceBack: pt(-14, 0) },
    // Dropped sweep, body folded low and long.
    { pitch: 0.8, pitchGain: 0.06, crouch: 1.0, kick: true, strike: pt(58, -2), offHand: pt(-18, 12), stanceFront: pt(0, 0), stanceBack: pt(-16, 0) },
  ],
  // Liu Kang high kick: torso tips away so the head ducks low while the
  // straight leg swings up in front, foot above the head.
  highKick: [
    { pitch: -1.15, pitchGain: -0.05, crouch: 0.08, kick: true, strike: pt(16, -112), offHand: pt(-16, 14), stanceFront: pt(0, 0), stanceBack: pt(-4, 0) },
  ],
  airPunch: [
    { pitch: 0.14, pitchGain: 0.08, crouch: 0, kick: false, strike: pt(54, -2), offHand: GUARD_FRONT, stanceFront: pt(16, -28), stanceBack: pt(-12, -22) },
    { pitch: 0.3, pitchGain: 0.08, crouch: 0, kick: false, strike: pt(48, -24), offHand: GUARD_FRONT, stanceFront: pt(14, -30), stanceBack: pt(-14, -24), elbowSide: -1 },
  ],
  // MK jump kick: flying kick silhouette, long leg driving down-forward,
  // other leg tucked hard, arms trailing behind.
  airKick: [
    { pitch: 0.32, pitchGain: 0.08, crouch: 0, kick: true, strike: pt(52, -12), offHand: pt(-20, -4), stanceFront: pt(0, 0), stanceBack: pt(-18, -34) },
  ],
  // Down+kick spin sweep: body drops into a full spin at ankle height.
  spinSweep: [
    { pitch: 0.7, pitchGain: 0.06, crouch: 1.0, kick: true, strike: pt(56, -2), offHand: pt(-18, 10), stanceFront: pt(0, 0), stanceBack: pt(-14, 0) },
  ],
  // Dive kick: body pitched into the plunge, both legs trailing into the strike.
  diveKick: [
    { pitch: 0.6, pitchGain: 0.08, crouch: 0, kick: true, strike: pt(40, 6), offHand: pt(-18, 4), stanceFront: pt(0, 0), stanceBack: pt(-26, -20) },
  ],
  // Uppercut: fist rips upward, elbow staying low, torso arched back.
  launcher: [
    { pitch: -0.3, pitchGain: -0.1, crouch: 0.22, kick: false, strike: pt(30, -34), offHand: GUARD_FRONT, stanceFront: pt(18, 0), stanceBack: pt(-20, 0), elbowSide: -1 },
  ],
  // Shoulder rush: low head-first lunge, lead fist driving.
  dashAttack: [
    { pitch: 0.55, pitchGain: 0.08, crouch: 0.2, kick: false, strike: pt(50, 4), offHand: pt(-16, 8), stanceFront: pt(34, 0), stanceBack: pt(-34, 0) },
  ],
};

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function buildPose(
  phase: number,
  running: boolean,
  vy: number,
  _facing: 1 | -1,
  attackKind: AttackKind | null,
  blocking: boolean,
  stunned: boolean,
  attackProgress: number,
  knockLean: number,
  wallSliding = false,
  attackVariant = 0,
  crouching = false,
  downed = false,
  sliding = false,
  rolling = false,
): Pose {
  const pose: Pose = {
    torsoPitch: 0.12,
    crouch: 0.08,
    frontHand: GUARD_FRONT,
    backHand: GUARD_BACK,
    frontFoot: pt(16, 0),
    backFoot: pt(-16, 0),
    frontElbowSide: 1,
    backElbowSide: 1,
    // Knees pop forward/up (side -1 in y-down space), like real knees.
    frontKneeSide: -1,
    backKneeSide: -1,
  };

  if (stunned && downed) {
    // Swept: flat on the back, legs kicked out, arms sprawled.
    pose.torsoPitch = -1.42;
    pose.crouch = 1.5;
    pose.frontFoot = pt(34, -4);
    pose.backFoot = pt(24, -2);
    pose.frontHand = pt(-8, 14);
    pose.backHand = pt(-14, 10);
  } else if (stunned) {
    pose.torsoPitch = -0.35;
    pose.frontHand = pt(-12, 8);
    pose.backHand = pt(-18, 14);
    pose.frontFoot = pt(20, -8);
    pose.backFoot = pt(-14, -4);
    pose.crouch = 0.12;
  } else if (attackKind) {
    const variants = ATTACK_POSES[attackKind];
    const cfg = variants[Math.abs(attackVariant) % variants.length];
    const ext = attackProgress; // negative = chambered wind-up, 1 = full snap
    pose.crouch = cfg.crouch;
    if (cfg.elbowSide) pose.frontElbowSide = cfg.elbowSide;
    if (cfg.kneeSide) pose.frontKneeSide = cfg.kneeSide;
    if (ext < 0) {
      // Wind-up: coil back and chamber the striking limb.
      const w = Math.min(-ext / 0.45, 1);
      pose.torsoPitch = -0.15 * w;
      pose.crouch = cfg.crouch + 0.12 * w;
      pose.frontHand = cfg.kick ? GUARD_FRONT : lerpPt(GUARD_FRONT, CHAMBER_HAND, w);
      pose.backHand = GUARD_BACK;
      pose.frontFoot = cfg.kick ? lerpPt(pt(16, 0), CHAMBER_FOOT, w) : cfg.stanceFront;
      pose.backFoot = cfg.stanceBack;
    } else {
      const e = Math.min(ext, 1);
      pose.torsoPitch = cfg.pitch + cfg.pitchGain * e;
      if (cfg.kick) {
        // Active snaps to the strike target; recovery steps the foot back down
        // toward the ground instead of floating through the chamber.
        pose.frontFoot = lerpPt(pt(20, 0), cfg.strike, e);
        pose.backFoot = cfg.stanceBack;
        pose.frontHand = cfg.offHand;
        pose.backHand = pt(cfg.offHand.x - 6, cfg.offHand.y + 6);
      } else {
        // Fist travels chin chamber -> strike target.
        pose.frontHand = lerpPt(CHAMBER_HAND, cfg.strike, e);
        pose.backHand = cfg.offHand;
        pose.frontFoot = cfg.stanceFront;
        pose.backFoot = cfg.stanceBack;
      }
    }
  } else if (blocking) {
    pose.torsoPitch = 0.08;
    pose.crouch = 0.16;
    pose.frontHand = pt(20, -16);
    pose.backHand = pt(15, -20);
    pose.frontFoot = pt(14, 0);
    pose.backFoot = pt(-14, 0);
  } else if (rolling) {
    // Landing roll: curled into a ball; the renderer spins the whole body.
    pose.torsoPitch = 0.75;
    pose.crouch = 1.35;
    pose.frontFoot = pt(30, -2);
    pose.backFoot = pt(20, 0);
    pose.frontHand = pt(-6, 28);
    pose.backHand = pt(-12, 26);
  } else if (sliding) {
    // Momentum slide: leaning back low, lead leg speared forward along the
    // ground, trailing arm planted behind for balance.
    pose.torsoPitch = -0.55;
    pose.crouch = 1.15;
    pose.frontFoot = pt(42, 0);
    pose.backFoot = pt(10, -8);
    pose.frontHand = pt(30, -6);
    pose.backHand = pt(-12, 44);
  } else if (crouching) {
    // Duck: deep squat under high attacks, guard tight at the chin.
    pose.torsoPitch = 0.18;
    pose.crouch = 1.0;
    pose.frontHand = pt(16, -10);
    pose.backHand = pt(11, -6);
    pose.frontFoot = pt(20, 0);
    pose.backFoot = pt(-18, 0);
  } else if (wallSliding) {
    pose.torsoPitch = -0.22;
    pose.crouch = 0.1;
    pose.frontHand = pt(24, -4);
    pose.backHand = pt(18, -12);
    pose.frontFoot = pt(18, -22);
    pose.backFoot = pt(10, -30);
  } else if (running) {
    const s = Math.sin(phase);
    const lift = Math.max(0, Math.sin(phase + Math.PI / 2));
    pose.torsoPitch = 0.16;
    // Lower hips so the full stride stays within leg reach (no floating feet).
    pose.crouch = 0.3;
    pose.frontFoot = pt(s * 28, -Math.max(0, s) * 16);
    pose.backFoot = pt(-s * 28, -Math.max(0, -s) * 16 - lift * 4);
    // Arms pump opposite the legs, elbows staying bent.
    pose.frontHand = pt(12 - s * 22, -2 + Math.abs(s) * 4);
    pose.backHand = pt(12 + s * 22, -2 + Math.abs(s) * 4);
  } else if (Math.abs(vy) > 5) {
    if (vy < 0) {
      // Rising: legs tucked, guard up.
      const tuck = Math.min(-vy / 800, 1);
      pose.frontFoot = pt(14, -18 - tuck * 22);
      pose.backFoot = pt(-10, -14 - tuck * 18);
      pose.frontHand = pt(20, -12);
      pose.backHand = pt(14, -8);
    } else {
      // Falling: legs reaching for the ground.
      pose.torsoPitch = 0.08;
      pose.frontFoot = pt(16, -10);
      pose.backFoot = pt(-14, -4);
      pose.frontHand = pt(24, 4);
      pose.backHand = pt(16, 8);
    }
  } else {
    // Fighting-ready idle: staggered stance, fists at the chin, gentle sway.
    // Crouch keeps the stance width within leg reach so feet stay planted.
    const s = Math.sin(phase) * 3;
    pose.frontFoot = pt(17, 0);
    pose.backFoot = pt(-15, 0);
    pose.frontHand = pt(GUARD_FRONT.x + s, GUARD_FRONT.y + s * 0.6);
    pose.backHand = pt(GUARD_BACK.x - s * 0.5, GUARD_BACK.y + s * 0.6);
    pose.crouch = 0.15 + Math.sin(phase) * 0.012;
  }

  pose.torsoPitch += knockLean;
  return pose;
}

/** Linear pose blend for animation smoothing. */
export function blendPose(from: Pose, to: Pose, t: number): Pose {
  return {
    torsoPitch: from.torsoPitch + (to.torsoPitch - from.torsoPitch) * t,
    crouch: from.crouch + (to.crouch - from.crouch) * t,
    frontHand: lerpPt(from.frontHand, to.frontHand, t),
    backHand: lerpPt(from.backHand, to.backHand, t),
    frontFoot: lerpPt(from.frontFoot, to.frontFoot, t),
    backFoot: lerpPt(from.backFoot, to.backFoot, t),
    frontElbowSide: to.frontElbowSide,
    backElbowSide: to.backElbowSide,
    frontKneeSide: to.frontKneeSide,
    backKneeSide: to.backKneeSide,
  };
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

/**
 * Two-bone analytic IK: places the joint so origin->mid->end reaches toward
 * the target, clamping when out of range. `side` picks the bend direction.
 */
function solveLimb(origin: Pt, target: Pt, l1: number, l2: number, side: 1 | -1): Limb {
  let dx = target.x - origin.x;
  let dy = target.y - origin.y;
  let d = Math.hypot(dx, dy);
  const minD = Math.abs(l1 - l2) + 0.5;
  const maxD = l1 + l2 - 0.5;
  if (d < 1e-4) {
    dx = 0;
    dy = 1;
    d = 1;
  }
  const clamped = Math.max(minD, Math.min(maxD, d));
  const ux = dx / d;
  const uy = dy / d;
  const end: Pt = { x: origin.x + ux * clamped, y: origin.y + uy * clamped };
  // Law of cosines for the joint.
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + clamped * clamped - l2 * l2) / (2 * l1 * clamped))));
  const base = Math.atan2(end.y - origin.y, end.x - origin.x);
  const jointAngle = base + a * side;
  const mid: Pt = { x: origin.x + Math.cos(jointAngle) * l1, y: origin.y + Math.sin(jointAngle) * l1 };
  // Copy the origin: limbs share hip/shoulder objects and mirroring must not double-flip.
  return { origin: { x: origin.x, y: origin.y }, mid, end };
}

/**
 * Full skeleton in feet-origin local space (y up = negative), mirrored by
 * facing. Hands/feet land on their targets via IK, so elbows and knees bend
 * naturally: a fist by the chin folds the arm, an extended punch straightens it.
 */
export function computeSkeleton(pose: Pose, facing: 1 | -1): Skeleton {
  const pitch = Math.max(-1.45, Math.min(1.45, pose.torsoPitch));
  // crouch 1 puts the hip at roughly half leg height for deep ducks and sweeps.
  const hip: Pt = { x: 0, y: -LEG_LEN * (1 - pose.crouch * 0.5) };
  const shoulder: Pt = {
    x: hip.x + Math.sin(pitch) * TORSO_LEN,
    y: hip.y - Math.cos(pitch) * TORSO_LEN,
  };
  const headDist = HEAD_R + 4;
  const headCenter: Pt = {
    x: shoulder.x + Math.sin(pitch) * headDist,
    y: shoulder.y - Math.cos(pitch) * headDist,
  };

  const frontHandTarget: Pt = { x: shoulder.x + pose.frontHand.x, y: shoulder.y + pose.frontHand.y };
  const backHandTarget: Pt = { x: shoulder.x + pose.backHand.x, y: shoulder.y + pose.backHand.y };

  const sk: Skeleton = {
    hip,
    shoulder,
    headCenter,
    frontLeg: solveLimb(hip, pose.frontFoot, THIGH_LEN, SHIN_LEN, pose.frontKneeSide),
    backLeg: solveLimb(hip, pose.backFoot, THIGH_LEN, SHIN_LEN, pose.backKneeSide),
    // Elbow side default: elbows hang below/behind the punch line.
    frontArm: solveLimb(shoulder, frontHandTarget, UPPER_ARM_LEN, FOREARM_LEN, pose.frontElbowSide),
    backArm: solveLimb(shoulder, backHandTarget, UPPER_ARM_LEN, FOREARM_LEN, pose.backElbowSide),
  };

  if (facing === -1) {
    const flip = (p: Pt) => (p.x = -p.x);
    flip(sk.hip);
    flip(sk.shoulder);
    flip(sk.headCenter);
    for (const limb of [sk.frontLeg, sk.backLeg, sk.frontArm, sk.backArm]) {
      flip(limb.origin);
      flip(limb.mid);
      flip(limb.end);
    }
  }
  return sk;
}
