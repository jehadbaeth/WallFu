import type { Fighter } from "./Fighter";

export type AttackKind =
  | "highPunch"
  | "lowPunch"
  | "highKick"
  | "lowKick"
  | "spinSweep"
  | "airPunch"
  | "airKick"
  | "diveKick"
  | "launcher"
  | "dashAttack";

export interface AttackData {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  knockback: number;
  upKnockback: number;
  hitstun: number;
  range: number;
  height: number;
  hitstop: number;
  /** How far below the feet the hitbox extends. Defaults to -12 (stops just above the feet). */
  bottomOffset?: number;
  /** Sweeps the defender off their feet: they land and stay down through the hitstun. */
  knockdown?: boolean;
}

// Each move has a distinct job:
//   lowPunch   - fastest poke, tiny knockback, chains into everything
//   highPunch  - stagger setup: long hitstun, short knockback, starts combos
//   lowKick    - ankle sweep: trips them straight UP for juggles
//   highKick   - Liu Kang special: flying fire kick that sends them ACROSS the arena
//   airPunch   - quick air poke that keeps them close
//   airKick    - MK jump kick: diagonal knock-away
//   diveKick   - spikes the opponent DOWN
//   launcher   - uppercut: straight up, the juggle starter
//   dashAttack - shoulder rush: carries both fighters forward
export const ATTACKS: Record<AttackKind, AttackData> = {
  lowPunch: {
    startup: 0.04,
    active: 0.06,
    recovery: 0.08,
    damage: 4,
    knockback: 230,
    upKnockback: 40,
    hitstun: 0.2,
    range: 52,
    height: 74,
    hitstop: 0.03,
  },
  highPunch: {
    startup: 0.07,
    active: 0.08,
    recovery: 0.12,
    damage: 8,
    knockback: 290,
    upKnockback: 80,
    hitstun: 0.36,
    range: 62,
    height: 92,
    hitstop: 0.05,
  },
  lowKick: {
    startup: 0.08,
    active: 0.09,
    recovery: 0.16,
    damage: 7,
    knockback: 170,
    upKnockback: 470,
    hitstun: 0.44,
    range: 68,
    height: 42,
    hitstop: 0.05,
    bottomOffset: 0,
  },
  highKick: {
    startup: 0.12,
    active: 0.1,
    recovery: 0.24,
    damage: 13,
    knockback: 960,
    upKnockback: 240,
    hitstun: 0.55,
    range: 84,
    height: 120,
    hitstop: 0.09,
    bottomOffset: -72, // head-level only: ducking goes clean under it
  },
  // Down+kick: MK sweep. Trips the opponent flat on their back.
  spinSweep: {
    startup: 0.09,
    active: 0.16,
    recovery: 0.24,
    damage: 8,
    knockback: 190,
    upKnockback: 300,
    hitstun: 0.95,
    range: 78,
    height: 44,
    hitstop: 0.06,
    bottomOffset: 0,
    knockdown: true,
  },
  airPunch: {
    startup: 0.04,
    active: 0.1,
    recovery: 0.08,
    damage: 6,
    knockback: 300,
    upKnockback: 200,
    hitstun: 0.24,
    range: 56,
    height: 80,
    hitstop: 0.03,
    bottomOffset: 8,
  },
  airKick: {
    startup: 0.09,
    active: 0.12,
    recovery: 0.16,
    damage: 11,
    knockback: 640,
    upKnockback: 300,
    hitstun: 0.36,
    range: 68,
    height: 90,
    hitstop: 0.065,
    bottomOffset: 10,
  },
  diveKick: {
    startup: 0.06,
    active: 0.35,
    recovery: 0.12,
    damage: 10,
    knockback: 380,
    upKnockback: -380,
    hitstun: 0.34,
    range: 48,
    height: 58,
    hitstop: 0.06,
    bottomOffset: 30,
  },
  // MK uppercut: big damage, launches sky-high.
  launcher: {
    startup: 0.1,
    active: 0.09,
    recovery: 0.26,
    damage: 14,
    knockback: 120,
    upKnockback: 820,
    hitstun: 0.5,
    range: 54,
    height: 100,
    hitstop: 0.08,
  },
  dashAttack: {
    startup: 0.04,
    active: 0.12,
    recovery: 0.16,
    damage: 9,
    knockback: 600,
    upKnockback: 180,
    hitstun: 0.3,
    range: 62,
    height: 74,
    hitstop: 0.05,
  },
};

/** Kinds that should read as "big hits" for effects, sounds, and reactions. */
export function isHeavyKind(kind: AttackKind): boolean {
  return kind === "highKick" || kind === "airKick" || kind === "launcher";
}

/** Kicks get a heavier, lower-pitched impact sound than punches. */
export function isKickKind(kind: AttackKind): boolean {
  return kind === "highKick" || kind === "lowKick" || kind === "spinSweep" || kind === "airKick" || kind === "diveKick";
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const HURT_HALF_WIDTH = 26;

function hurtbox(f: Fighter): Rect {
  // Ducking halves the target: high attacks whiff clean over a crouched fighter.
  const height = f.crouching ? f.height * 0.5 : f.height;
  return {
    minX: f.x - HURT_HALF_WIDTH,
    maxX: f.x + HURT_HALF_WIDTH,
    minY: f.y - height,
    maxY: f.y,
  };
}

function hitbox(f: Fighter): Rect | null {
  if (f.attackPhase !== "active" || !f.attackKind) return null;
  const data = ATTACKS[f.attackKind];
  const originX = f.x + f.facing * 18;
  const nearX = originX;
  const farX = originX + f.facing * data.range;
  return {
    minX: Math.min(nearX, farX),
    maxX: Math.max(nearX, farX),
    minY: f.y - data.height,
    maxY: f.y + (data.bottomOffset ?? -12),
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export interface HitResult {
  attacker: Fighter;
  defender: Fighter;
  kind: AttackKind;
  blocked: boolean;
  x: number;
  y: number;
  hitstop: number;
}

export function resolveCombat(a: Fighter, b: Fighter): HitResult[] {
  const results: HitResult[] = [];
  results.push(...resolveOneWay(a, b));
  results.push(...resolveOneWay(b, a));
  return results;
}

function resolveOneWay(attacker: Fighter, defender: Fighter): HitResult[] {
  if (attacker.koed || defender.koed) return [];
  if (attacker.attackHasHit) return [];
  const hb = hitbox(attacker);
  if (!hb) return [];
  const hurt = hurtbox(defender);
  if (!overlaps(hb, hurt)) return [];

  attacker.attackHasHit = true;
  const kind = attacker.attackKind!;
  const data = ATTACKS[kind];
  const dir = defender.x >= attacker.x ? 1 : -1;

  const blocked = defender.blocking && (defender.facing as number) === -dir;

  const dmg = blocked ? data.damage * 0.15 : data.damage;
  const kb = blocked ? data.knockback * 0.35 : data.knockback;
  const upKb = blocked ? data.upKnockback * 0.2 : data.upKnockback;
  const stun = blocked ? data.hitstun * 0.4 : data.hitstun;

  defender.takeHit(kind, dmg, dir * kb, -upKb, stun, blocked, data.knockdown);

  const hitX = (hb.minX + hb.maxX) / 2;
  const hitY = (hb.minY + hb.maxY) / 2;

  return [
    {
      attacker,
      defender,
      kind,
      blocked,
      x: hitX,
      y: hitY,
      hitstop: data.hitstop,
    },
  ];
}
