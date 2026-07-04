import { Container, Graphics } from "pixi.js";
import type { MapData } from "../core/MapTypes";
import type { Fighter } from "../core/Fighter";
import type { ParticleSystem } from "../effects/Particles";
import type { ShockRingSystem } from "../effects/ShockRing";
import { sound } from "../effects/Sound";

export type WeaponKind = "spear" | "sword";

const WHITE = 0xffffff;
const YELLOW = 0xffe14d;
const STEEL = 0xbfd4e0;

const SPAWN_INTERVAL_MIN = 11;
const SPAWN_INTERVAL_MAX = 18;

interface GroundWeapon {
  kind: WeaponKind;
  x: number;
  y: number;
  vy: number;
  settled: boolean;
}

interface Projectile {
  kind: WeaponKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  owner: Fighter;
  dead: boolean;
  stuckTimer: number;
}

/**
 * Random throwable weapon drops. Weapons fall from the sky, pull whoever walks
 * over them into "armed" state, and throwing (the high punch button while
 * armed) launches them as a projectile: spears fly flat and fast, swords spin
 * in an arc and hit harder.
 */
export class WeaponSystem {
  readonly view = new Container();
  private g = new Graphics();

  private fightMap: MapData | null = null;
  private fighters: Fighter[] = [];
  private held = new Map<Fighter, WeaponKind>();
  private drops: GroundWeapon[] = [];
  private projectiles: Projectile[] = [];
  private spawnTimer = 6;
  private enabled = true;
  private time = 0;

  constructor(
    private particles: ParticleSystem,
    private shockRings: ShockRingSystem,
    private hooks: { addShake(amount: number): void },
  ) {
    this.view.addChild(this.g);
  }

  start(fightMap: MapData, fighters: Fighter[], enabled: boolean): void {
    this.fightMap = fightMap;
    this.fighters = fighters;
    this.enabled = enabled;
    this.held.clear();
    this.drops = [];
    this.projectiles = [];
    this.spawnTimer = 5 + Math.random() * 5;
    this.time = 0;
    this.draw();
  }

  resetRound(): void {
    this.held.clear();
    this.drops = [];
    this.projectiles = [];
    this.spawnTimer = 5 + Math.random() * 5;
  }

  stop(): void {
    this.fightMap = null;
    this.g.clear();
  }

  holding(f: Fighter): WeaponKind | undefined {
    return this.held.get(f);
  }

  /** Throws the held weapon in the fighter's facing direction. Returns true if something was thrown. */
  tryThrow(f: Fighter): boolean {
    const kind = this.held.get(f);
    if (!kind || f.koed) return false;
    this.held.delete(f);
    const speed = kind === "spear" ? 1250 : 980;
    this.projectiles.push({
      kind,
      x: f.x + f.facing * 30,
      y: f.y - f.height * 0.62,
      vx: f.facing * speed,
      vy: kind === "spear" ? -30 : -220,
      rotation: 0,
      owner: f,
      dead: false,
      stuckTimer: 0,
    });
    sound.whoosh(true);
    this.particles.streakBurst(f.x + f.facing * 30, f.y - f.height * 0.6, WHITE, 6, {
      angle: f.facing > 0 ? 0 : Math.PI,
      speed: 400,
      spread: 0.4,
      size: 4,
    });
    return true;
  }

  update(dt: number): void {
    if (!this.fightMap) return;
    this.time += dt;

    if (this.enabled) {
      this.spawnTimer -= dt;
      const unclaimed = this.drops.filter((d) => d.settled).length;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
        if (unclaimed < 2) this.spawnDrop();
      }
    }

    // Drops fall and settle.
    for (const d of this.drops) {
      if (d.settled) continue;
      d.vy += 1800 * dt;
      const prevY = d.y;
      d.y += d.vy * dt;
      const surface = this.surfaceBelow(d.x, prevY, d.y);
      if (surface !== null) {
        d.y = surface;
        d.settled = true;
        this.particles.dustPuff(d.x, d.y, WHITE, 6);
        sound.land(0.3);
      }
    }

    // Pickup: walk over a settled weapon while grounded and empty-handed.
    for (const f of this.fighters) {
      if (f.koed || this.held.has(f) || !f.grounded) continue;
      for (const d of this.drops) {
        if (!d.settled) continue;
        if (Math.abs(f.x - d.x) < f.radius + 22 && Math.abs(f.y - d.y) < 30) {
          this.held.set(f, d.kind);
          d.settled = false;
          this.drops = this.drops.filter((x) => x !== d);
          this.shockRings.spawn(d.x, d.y - 30, YELLOW, 50, 0.25, 4);
          sound.confirm();
          break;
        }
      }
    }

    // Projectiles fly, spin, and hit.
    for (const p of this.projectiles) {
      if (p.dead) {
        p.stuckTimer -= dt;
        continue;
      }
      const gravity = p.kind === "spear" ? 220 : 900;
      p.vy += gravity * dt;
      const prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation = p.kind === "sword" ? p.rotation + dt * 16 * Math.sign(p.vx) : Math.atan2(p.vy, p.vx);

      for (const f of this.fighters) {
        if (f === p.owner || f.koed) continue;
        if (Math.abs(p.x - f.x) < f.radius + 14 && p.y > f.y - f.height - 10 && p.y < f.y + 8) {
          const heavy = p.kind === "sword";
          const dir = Math.sign(p.vx) || 1;
          const blocked = f.blocking && (f.facing as number) === -dir;
          const dmg = heavy ? 14 : 11;
          f.takeHit("highPunch", blocked ? dmg * 0.2 : dmg, blocked ? dir * 140 : dir * 520, blocked ? 0 : -300, blocked ? 0.15 : 0.38, blocked);
          this.particles.burst(p.x, p.y, YELLOW, heavy ? 22 : 14, { speed: 460, spread: Math.PI * 1.5, gravity: 500, size: 5, glow: true });
          this.shockRings.spawn(p.x, p.y, WHITE, heavy ? 100 : 70, 0.3, 6);
          this.hooks.addShake(heavy ? 0.4 : 0.25);
          sound.hit(heavy, blocked, false);
          p.dead = true;
          p.stuckTimer = 0;
          break;
        }
      }
      if (p.dead) continue;

      // Stick into surfaces.
      const surface = this.surfaceBelow(p.x, prevY, p.y);
      const inWall = this.insideWall(p.x, p.y);
      if (surface !== null || inWall) {
        if (surface !== null) p.y = surface;
        p.dead = true;
        p.stuckTimer = 1.6;
        this.particles.dustPuff(p.x, p.y, WHITE, 4);
        sound.land(0.3);
      } else if (p.x < -80 || p.x > this.fightMap.width + 80 || p.y > this.fightMap.height + 100) {
        p.dead = true;
        p.stuckTimer = 0;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead || p.stuckTimer > 0);
  }

  private spawnDrop(): void {
    const map = this.fightMap!;
    this.drops.push({
      kind: Math.random() < 0.5 ? "spear" : "sword",
      x: 80 + Math.random() * (map.width - 160),
      y: -40,
      vy: 0,
      settled: false,
    });
  }

  /** Y of the first surface crossed between prevY and y at this x, or null. */
  private surfaceBelow(x: number, prevY: number, y: number): number | null {
    const map = this.fightMap!;
    let best: number | null = null;
    for (const r of [...map.platforms, ...map.walls]) {
      if (x >= r.x && x <= r.x + r.w && prevY <= r.y && y >= r.y) {
        if (best === null || r.y < best) best = r.y;
      }
    }
    return best;
  }

  private insideWall(x: number, y: number): boolean {
    return this.fightMap!.walls.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  draw(): void {
    this.g.clear();
    if (!this.fightMap) return;

    for (const d of this.drops) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 6);
      this.g.circle(d.x, d.y - 16, 24);
      this.g.stroke({ width: 2, color: YELLOW, alpha: d.settled ? pulse * 0.6 : 0 });
      this.drawWeapon(d.kind, d.x, d.y - 16, d.kind === "spear" ? -Math.PI / 3 : Math.PI / 8, 1);
    }

    for (const p of this.projectiles) {
      const alpha = p.dead ? Math.min(1, p.stuckTimer / 0.6) : 1;
      this.drawWeapon(p.kind, p.x, p.y, p.rotation, alpha);
    }

    // Held weapon floats behind the carrier's head.
    for (const [f, kind] of this.held) {
      this.drawWeapon(kind, f.x - f.facing * 26, f.y - f.height - 14, f.facing > 0 ? -Math.PI / 5 : Math.PI + Math.PI / 5, 0.95);
    }
  }

  private drawWeapon(kind: WeaponKind, x: number, y: number, rotation: number, alpha: number): void {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    if (kind === "spear") {
      const half = 34;
      this.g.moveTo(x - cos * half, y - sin * half);
      this.g.lineTo(x + cos * half, y + sin * half);
      this.g.stroke({ width: 4, color: STEEL, alpha });
      // Tip.
      this.g.poly([
        x + cos * half,
        y + sin * half,
        x + cos * (half - 12) - sin * 5,
        y + sin * (half - 12) + cos * 5,
        x + cos * (half - 12) + sin * 5,
        y + sin * (half - 12) - cos * 5,
      ]);
      this.g.fill({ color: WHITE, alpha });
    } else {
      const half = 26;
      // Blade.
      this.g.moveTo(x - cos * (half * 0.45), y - sin * (half * 0.45));
      this.g.lineTo(x + cos * half, y + sin * half);
      this.g.stroke({ width: 6, color: STEEL, alpha });
      // Crossguard.
      this.g.moveTo(x - cos * (half * 0.45) - sin * 10, y - sin * (half * 0.45) + cos * 10);
      this.g.lineTo(x - cos * (half * 0.45) + sin * 10, y - sin * (half * 0.45) - cos * 10);
      this.g.stroke({ width: 4, color: YELLOW, alpha });
      // Grip.
      this.g.moveTo(x - cos * (half * 0.45), y - sin * (half * 0.45));
      this.g.lineTo(x - cos * (half * 0.85), y - sin * (half * 0.85));
      this.g.stroke({ width: 4, color: 0x8a5a2b, alpha });
    }
  }
}
