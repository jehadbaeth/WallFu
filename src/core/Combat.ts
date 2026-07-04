import type { Fighter } from "./Fighter";

export type AttackKind = "light" | "heavy";

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
}

export const ATTACKS: Record<AttackKind, AttackData> = {
  light: {
    startup: 0.06,
    active: 0.08,
    recovery: 0.14,
    damage: 7,
    knockback: 360,
    upKnockback: 120,
    hitstun: 0.26,
    range: 58,
    height: 70,
    hitstop: 0.05,
  },
  heavy: {
    startup: 0.15,
    active: 0.1,
    recovery: 0.3,
    damage: 17,
    knockback: 640,
    upKnockback: 280,
    hitstun: 0.42,
    range: 68,
    height: 82,
    hitstop: 0.09,
  },
};

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const HURT_HALF_WIDTH = 26;

function hurtbox(f: Fighter): Rect {
  return {
    minX: f.x - HURT_HALF_WIDTH,
    maxX: f.x + HURT_HALF_WIDTH,
    minY: f.y - f.height,
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
    maxY: f.y - 12,
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

  defender.takeHit(kind, dmg, dir * kb, -upKb, stun, blocked);

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
