import { Container, Graphics } from "pixi.js";
import type { MapData, Rect } from "../core/MapTypes";
import { effectiveHazards } from "../core/MapTypes";
import type { Fighter } from "../core/Fighter";
import type { ParticleSystem } from "../effects/Particles";
import type { ShockRingSystem } from "../effects/ShockRing";
import { sound } from "../effects/Sound";

const WHITE = 0xffffff;
const YELLOW = 0xffe14d;
const CYAN = 0x2ee6ff;
const LAVA_ORANGE = 0xff6a1f;
const LAVA_RED = 0xd91c1c;

const CRUMBLE_ARM_TIME = 1.5; // hidden timer: seconds standing on it before it gives way
const CRUMBLE_FALL_TIME = 1.1;
const CRUMBLE_RESPAWN_TIME = 7;

const EVENT_INTERVAL_MIN = 7;
const EVENT_INTERVAL_MAX = 13;

interface CrumbleState {
  rect: Rect;
  state: "idle" | "armed" | "falling" | "gone";
  timer: number;
  fallOffset: number;
  fallSpeed: number;
}

interface Dagger {
  x: number;
  y: number;
  vy: number;
  stuck: boolean;
  stuckTimer: number;
  hit: Set<Fighter>;
}

interface Lightning {
  x: number;
  phase: "warn" | "strike";
  timer: number;
  groundY: number;
  boltSeed: number;
}

interface LavaBurst {
  x: number;
  surfaceY: number;
  phase: "warn" | "erupt";
  timer: number;
  cooldowns: Map<Fighter, number>;
}

export interface HazardHooks {
  addShake(amount: number): void;
  flash(amount: number): void;
}

/**
 * Runtime arena hazards: crumbling platforms plus random events (falling
 * daggers, lightning strikes, lava geysers). Mutates the fight map's platform
 * list when crumbling platforms fall and respawn, so physics stays in sync.
 */
export class HazardSystem {
  readonly view = new Container();
  private g = new Graphics();

  private fightMap: MapData | null = null;
  private fighters: Fighter[] = [];
  private crumbles: CrumbleState[] = [];
  private daggers: Dagger[] = [];
  private lightnings: Lightning[] = [];
  private lavas: LavaBurst[] = [];
  private eventTimer = 5;
  private eventPool: Array<"daggers" | "lightning" | "lava"> = [];
  private time = 0;

  /** When true (projection mode), crumbling platforms are not drawn; events still are. */
  drawGeometry = true;

  constructor(
    private particles: ParticleSystem,
    private shockRings: ShockRingSystem,
    private hooks: HazardHooks,
  ) {
    this.view.addChild(this.g);
  }

  start(fightMap: MapData, fighters: Fighter[]): void {
    this.fightMap = fightMap;
    this.fighters = fighters;
    const cfg = effectiveHazards(fightMap);
    this.eventPool = [
      ...(cfg.daggers ? (["daggers"] as const) : []),
      ...(cfg.lightning ? (["lightning"] as const) : []),
      ...(cfg.lava ? (["lava"] as const) : []),
    ];
    this.crumbles = fightMap.platforms
      .filter((p) => p.crumble)
      .map((rect) => ({ rect, state: "idle" as const, timer: 0, fallOffset: 0, fallSpeed: 0 }));
    this.daggers = [];
    this.lightnings = [];
    this.lavas = [];
    this.eventTimer = 4 + Math.random() * 4;
    this.time = 0;
    this.draw();
  }

  stop(): void {
    this.fightMap = null;
    this.g.clear();
  }

  /** Restores all crumbled platforms (called between rounds). */
  resetRound(): void {
    if (!this.fightMap) return;
    for (const c of this.crumbles) {
      if (c.state !== "idle" && !this.fightMap.platforms.includes(c.rect)) {
        this.fightMap.platforms.push(c.rect);
      }
      c.state = "idle";
      c.timer = 0;
      c.fallOffset = 0;
      c.fallSpeed = 0;
    }
    this.daggers = [];
    this.lightnings = [];
    this.lavas = [];
    this.eventTimer = 4 + Math.random() * 4;
  }

  /** Advances simulation; call once per fixed timestep while the round is live. */
  update(dt: number): void {
    if (!this.fightMap) return;
    this.time += dt;
    this.updateCrumbles(dt);
    if (this.eventPool.length) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) {
        this.eventTimer = EVENT_INTERVAL_MIN + Math.random() * (EVENT_INTERVAL_MAX - EVENT_INTERVAL_MIN);
        this.spawnRandomEvent();
      }
    }
    this.updateDaggers(dt);
    this.updateLightning(dt);
    this.updateLava(dt);
  }

  private updateCrumbles(dt: number): void {
    const map = this.fightMap!;
    for (const c of this.crumbles) {
      if (c.state === "idle") {
        if (this.someoneStandsOn(c.rect)) {
          c.state = "armed";
          c.timer = CRUMBLE_ARM_TIME;
        }
      } else if (c.state === "armed") {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = "falling";
          c.timer = CRUMBLE_FALL_TIME;
          c.fallSpeed = 0;
          const idx = map.platforms.indexOf(c.rect);
          if (idx >= 0) map.platforms.splice(idx, 1);
          this.particles.dustPuff(c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h, WHITE, 14);
          this.hooks.addShake(0.15);
          sound.land(0.7);
        }
      } else if (c.state === "falling") {
        c.timer -= dt;
        c.fallSpeed += 2200 * dt;
        c.fallOffset += c.fallSpeed * dt;
        if (c.timer <= 0) {
          c.state = "gone";
          c.timer = CRUMBLE_RESPAWN_TIME;
        }
      } else {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = "idle";
          c.fallOffset = 0;
          map.platforms.push(c.rect);
          this.shockRings.spawn(c.rect.x + c.rect.w / 2, c.rect.y, WHITE, 60, 0.3, 4);
        }
      }
    }
  }

  private someoneStandsOn(rect: Rect): boolean {
    return this.fighters.some(
      (f) =>
        !f.koed &&
        f.grounded &&
        Math.abs(f.y - rect.y) < 3 &&
        f.x + f.radius > rect.x &&
        f.x - f.radius < rect.x + rect.w,
    );
  }

  private spawnRandomEvent(): void {
    const kind = this.eventPool[Math.floor(Math.random() * this.eventPool.length)];
    if (kind === "daggers") this.spawnDaggers();
    else if (kind === "lightning") this.spawnLightning();
    else this.spawnLava();
  }

  private spawnDaggers(): void {
    const map = this.fightMap!;
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      this.daggers.push({
        x: 60 + Math.random() * (map.width - 120),
        y: -60 - Math.random() * 200,
        vy: 950 + Math.random() * 250,
        stuck: false,
        stuckTimer: 0,
        hit: new Set(),
      });
    }
    sound.whoosh(true);
  }

  private spawnLightning(): void {
    const map = this.fightMap!;
    // Bias strikes toward a fighter half the time so dodging matters.
    const target = Math.random() < 0.5 ? this.fighters[Math.floor(Math.random() * this.fighters.length)] : null;
    const x = target
      ? Math.max(50, Math.min(map.width - 50, target.x + (Math.random() * 2 - 1) * 90))
      : 50 + Math.random() * (map.width - 100);
    this.lightnings.push({ x, phase: "warn", timer: 1.0, groundY: this.surfaceYAt(x), boltSeed: Math.random() * 1000 });
  }

  private spawnLava(): void {
    const map = this.fightMap!;
    const x = 60 + Math.random() * (map.width - 120);
    this.lavas.push({ x, surfaceY: this.surfaceYAt(x), phase: "warn", timer: 0.9, cooldowns: new Map() });
  }

  /** Topmost solid surface directly below nothing at this x (fallback: arena bottom). */
  private surfaceYAt(x: number): number {
    const map = this.fightMap!;
    let best = map.height;
    for (const r of [...map.platforms, ...map.walls]) {
      if (x >= r.x && x <= r.x + r.w && r.y < best) best = r.y;
    }
    return best;
  }

  private hurtFighter(f: Fighter, damage: number, kbVx: number, kbVy: number, hitstun: number): void {
    if (f.koed) return;
    const blocked = f.blocking;
    f.takeHit("highPunch", blocked ? damage * 0.25 : damage, blocked ? kbVx * 0.3 : kbVx, blocked ? 0 : kbVy, blocked ? hitstun * 0.4 : hitstun, blocked);
  }

  private updateDaggers(dt: number): void {
    const map = this.fightMap!;
    for (const d of this.daggers) {
      if (d.stuck) {
        d.stuckTimer -= dt;
        continue;
      }
      const prevY = d.y;
      d.y += d.vy * dt;
      // Hit fighters.
      for (const f of this.fighters) {
        if (d.hit.has(f) || f.koed) continue;
        if (Math.abs(d.x - f.x) < f.radius + 8 && d.y > f.y - f.height && d.y < f.y + 6) {
          d.hit.add(f);
          this.hurtFighter(f, 7, (Math.random() * 2 - 1) * 140, -160, 0.24);
          this.particles.burst(d.x, d.y, YELLOW, 10, { speed: 300, spread: Math.PI * 2, gravity: 400, size: 4, glow: true });
          sound.hit(false, f.blocking, false);
          d.stuck = true;
          d.stuckTimer = 0.1;
          break;
        }
      }
      if (d.stuck) continue;
      // Stick into the first surface crossed this frame.
      for (const r of [...map.platforms, ...map.walls]) {
        if (d.x >= r.x && d.x <= r.x + r.w && prevY <= r.y && d.y >= r.y) {
          d.y = r.y + 4;
          d.stuck = true;
          d.stuckTimer = 2;
          this.particles.dustPuff(d.x, r.y, WHITE, 4);
          sound.land(0.25);
          break;
        }
      }
      if (d.y > map.height + 100) {
        d.stuck = true;
        d.stuckTimer = 0;
      }
    }
    this.daggers = this.daggers.filter((d) => !d.stuck || d.stuckTimer > 0);
  }

  private updateLightning(dt: number): void {
    for (const l of this.lightnings) {
      l.timer -= dt;
      if (l.phase === "warn" && l.timer <= 0) {
        l.phase = "strike";
        l.timer = 0.28;
        this.hooks.flash(0.5);
        this.hooks.addShake(0.7);
        sound.thunder();
        this.shockRings.spawn(l.x, l.groundY, CYAN, 140, 0.4, 7);
        this.particles.burst(l.x, l.groundY, CYAN, 24, { speed: 500, spread: Math.PI, gravity: 600, size: 5, glow: true });
        for (const f of this.fighters) {
          if (!f.koed && Math.abs(f.x - l.x) < 50 && f.y > l.groundY - 260) {
            this.hurtFighter(f, 16, Math.sign(f.x - l.x || Math.random() - 0.5) * 320, -540, 0.42);
          }
        }
      }
    }
    this.lightnings = this.lightnings.filter((l) => l.phase === "warn" || l.timer > 0);
  }

  private updateLava(dt: number): void {
    for (const lv of this.lavas) {
      lv.timer -= dt;
      if (lv.phase === "warn") {
        if (Math.random() < 0.4) {
          this.particles.burst(lv.x + (Math.random() * 2 - 1) * 26, lv.surfaceY, LAVA_ORANGE, 3, { speed: 140, spread: 0.7, gravity: 500, size: 4, glow: true });
        }
        if (lv.timer <= 0) {
          lv.phase = "erupt";
          lv.timer = 1.4;
          this.hooks.addShake(0.3);
          sound.lava();
          this.shockRings.spawn(lv.x, lv.surfaceY, LAVA_ORANGE, 90, 0.35, 6);
        }
      } else {
        const height = this.lavaHeight(lv);
        if (Math.random() < 0.7) {
          this.particles.burst(lv.x + (Math.random() * 2 - 1) * 20, lv.surfaceY - height, LAVA_ORANGE, 2, { speed: 220, spread: 0.9, gravity: 700, size: 5, glow: true });
        }
        for (const f of this.fighters) {
          if (f.koed) continue;
          const cd = lv.cooldowns.get(f) ?? 0;
          if (cd > this.time) continue;
          if (Math.abs(f.x - lv.x) < 34 + f.radius && f.y > lv.surfaceY - height - 10 && f.y - f.height < lv.surfaceY) {
            lv.cooldowns.set(f, this.time + 0.6);
            this.hurtFighter(f, 9, Math.sign(f.x - lv.x || Math.random() - 0.5) * 280, -520, 0.34);
            this.particles.burst(f.x, f.y - 40, LAVA_RED, 12, { speed: 320, spread: Math.PI, gravity: 500, size: 5, glow: true });
            sound.hit(true, f.blocking, true);
          }
        }
      }
    }
    this.lavas = this.lavas.filter((lv) => lv.phase === "warn" || lv.timer > 0);
  }

  private lavaHeight(lv: LavaBurst): number {
    // Rises fast, holds, sinks at the end.
    const t = 1 - lv.timer / 1.4;
    const envelope = t < 0.2 ? t / 0.2 : t > 0.75 ? (1 - t) / 0.25 : 1;
    return 240 * envelope;
  }

  /** Redraws all hazard visuals; call once per rendered frame. */
  draw(): void {
    this.g.clear();
    if (!this.fightMap) return;

    if (this.drawGeometry) {
      // Crumbling platforms are indistinguishable from normal ones until they arm:
      // the only tell is the shaking, then the fall.
      for (const c of this.crumbles) {
        if (c.state === "gone") continue;
        const shakeX = c.state === "armed" ? (Math.random() * 2 - 1) * 3.5 * (1 - c.timer / CRUMBLE_ARM_TIME + 0.3) : 0;
        const alpha = c.state === "falling" ? Math.max(0, (c.timer / CRUMBLE_FALL_TIME) * 0.9) : 0.9;
        const y = c.rect.y + c.fallOffset;
        this.g.rect(c.rect.x + shakeX, y, c.rect.w, c.rect.h);
        this.g.fill({ color: WHITE, alpha });
        if (c.state === "falling") {
          // Cracks only appear once it is actually breaking apart.
          for (let cx = c.rect.x + 14; cx < c.rect.x + c.rect.w - 6; cx += 26) {
            this.g.moveTo(cx + shakeX, y + 1);
            this.g.lineTo(cx + 8 + shakeX, y + c.rect.h - 1);
            this.g.stroke({ width: 2, color: 0x000000, alpha: alpha * 0.7 });
          }
        }
      }
    }

    for (const d of this.daggers) {
      const alpha = d.stuck ? Math.min(1, d.stuckTimer / 0.6) : 1;
      this.g.moveTo(d.x, d.y - 26);
      this.g.lineTo(d.x, d.y);
      this.g.stroke({ width: 4, color: WHITE, alpha });
      this.g.circle(d.x, d.y, 3);
      this.g.fill({ color: YELLOW, alpha });
    }

    for (const l of this.lightnings) {
      if (l.phase === "warn") {
        // Flickering warning column.
        if (Math.floor(this.time * 14) % 2 === 0) {
          this.g.rect(l.x - 6, 0, 12, l.groundY);
          this.g.fill({ color: CYAN, alpha: 0.16 });
          this.g.moveTo(l.x, 0);
          this.g.lineTo(l.x, l.groundY);
          this.g.stroke({ width: 2, color: CYAN, alpha: 0.5 });
        }
      } else {
        // Jagged bolt.
        const segments = 9;
        let px = l.x;
        this.g.moveTo(px, 0);
        for (let i = 1; i <= segments; i++) {
          const ny = (l.groundY / segments) * i;
          const nx = i === segments ? l.x : l.x + Math.sin(l.boltSeed + i * 12.9898 + Math.floor(this.time * 30)) * 26;
          this.g.lineTo(nx, ny);
          px = nx;
        }
        this.g.stroke({ width: 10, color: CYAN, alpha: Math.min(1, l.timer / 0.28) * 0.5 });
        this.g.moveTo(l.x, 0);
        let qx = l.x;
        for (let i = 1; i <= segments; i++) {
          const ny = (l.groundY / segments) * i;
          const nx = i === segments ? l.x : qx + Math.sin(l.boltSeed + i * 78.233 + Math.floor(this.time * 30)) * 18;
          this.g.lineTo(nx, ny);
          qx = nx;
        }
        this.g.stroke({ width: 4, color: WHITE, alpha: Math.min(1, l.timer / 0.28) });
      }
    }

    for (const lv of this.lavas) {
      if (lv.phase === "erupt") {
        const h = this.lavaHeight(lv);
        this.g.rect(lv.x - 30, lv.surfaceY - h, 60, h);
        this.g.fill({ color: LAVA_RED, alpha: 0.85 });
        this.g.rect(lv.x - 18, lv.surfaceY - h * 0.92, 36, h * 0.92);
        this.g.fill({ color: LAVA_ORANGE, alpha: 0.95 });
        this.g.circle(lv.x, lv.surfaceY - h, 24);
        this.g.fill({ color: LAVA_ORANGE, alpha: 0.9 });
      } else {
        // Simmering warning puddle.
        this.g.ellipse(lv.x, lv.surfaceY, 34, 7);
        this.g.fill({ color: LAVA_ORANGE, alpha: 0.5 + 0.3 * Math.sin(this.time * 10) });
      }
    }
  }
}
