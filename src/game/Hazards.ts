import { Container, Graphics } from "pixi.js";
import type { MapData, Rect, Portal } from "../core/MapTypes";
import { effectiveHazards, WHEEL_RADIUS, PORTAL_RADIUS } from "../core/MapTypes";
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
  vx: number;
  vy: number;
  stuck: boolean;
  stuckTimer: number;
  hit: Set<Fighter>;
}

const WHEEL_SPIN_SPEED = 1.7; // rad/s
const WHEEL_FIRE_INTERVAL = 1.05;
const WHEEL_DAGGER_SPEED = 720;

interface WheelState {
  x: number;
  y: number;
  angle: number;
  fireTimer: number;
}

const PORTAL_COLORS = [0x9d4dff, 0x2ee6ff, 0xffe14d, 0x35e07c];

interface PortalState {
  def: Portal;
  color: number;
  /** Fighters that just warped: they must leave both ends before warping again. */
  disarmed: Set<Fighter>;
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
  /** A fighter was teleported; the renderer resets interpolation so it doesn't smear. */
  teleported?(f: Fighter): void;
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
  private wheels: WheelState[] = [];
  private portals: PortalState[] = [];
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
    this.wheels = (fightMap.daggerWheels ?? []).map((w, i) => ({
      x: w.x,
      y: w.y,
      angle: i * 1.3, // desync wheels so they don't fire in unison
      fireTimer: 1 + i * 0.4,
    }));
    this.portals = (fightMap.portals ?? []).map((def, i) => ({
      def,
      color: PORTAL_COLORS[i % PORTAL_COLORS.length],
      disarmed: new Set<Fighter>(),
    }));
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
    for (const w of this.wheels) w.fireTimer = 1;
    for (const p of this.portals) p.disarmed.clear();
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
    this.updateWheels(dt);
    this.updatePortals();
    this.updateDaggers(dt);
    this.updateLightning(dt);
    this.updateLava(dt);
  }

  private updateWheels(dt: number): void {
    for (const w of this.wheels) {
      w.angle += WHEEL_SPIN_SPEED * dt;
      w.fireTimer -= dt;
      if (w.fireTimer <= 0) {
        w.fireTimer = WHEEL_FIRE_INTERVAL;
        // Fire along the current blade direction: a rotating spray.
        const cos = Math.cos(w.angle);
        const sin = Math.sin(w.angle);
        this.daggers.push({
          x: w.x + cos * (WHEEL_RADIUS + 6),
          y: w.y + sin * (WHEEL_RADIUS + 6),
          vx: cos * WHEEL_DAGGER_SPEED,
          vy: sin * WHEEL_DAGGER_SPEED,
          stuck: false,
          stuckTimer: 0,
          hit: new Set(),
        });
        this.particles.burst(w.x + cos * WHEEL_RADIUS, w.y + sin * WHEEL_RADIUS, YELLOW, 3, {
          speed: 120,
          spread: 0.5,
          gravity: 0,
          size: 3,
          glow: true,
        });
      }
    }
  }

  private updatePortals(): void {
    for (const ps of this.portals) {
      for (const f of this.fighters) {
        if (f.koed) continue;
        const cx = f.x;
        const cy = f.y - f.height / 2;
        const d1 = Math.hypot(cx - ps.def.x1, cy - ps.def.y1);
        const d2 = Math.hypot(cx - ps.def.x2, cy - ps.def.y2);
        if (ps.disarmed.has(f)) {
          if (d1 > PORTAL_RADIUS + 34 && d2 > PORTAL_RADIUS + 34) ps.disarmed.delete(f);
          continue;
        }
        if (d1 < PORTAL_RADIUS || d2 < PORTAL_RADIUS) {
          const exitX = d1 < PORTAL_RADIUS ? ps.def.x2 : ps.def.x1;
          const exitY = d1 < PORTAL_RADIUS ? ps.def.y2 : ps.def.y1;
          this.shockRings.spawn(cx, cy, ps.color, 80, 0.3, 5);
          this.particles.burst(cx, cy, ps.color, 16, { speed: 300, spread: Math.PI * 2, gravity: 0, size: 4, glow: true });
          f.x = exitX;
          f.y = exitY + f.height / 2;
          f.grounded = false;
          ps.disarmed.add(f);
          this.hooks.teleported?.(f);
          this.shockRings.spawn(exitX, exitY, ps.color, 80, 0.3, 5);
          this.particles.burst(exitX, exitY, ps.color, 16, { speed: 300, spread: Math.PI * 2, gravity: 0, size: 4, glow: true });
          sound.whoosh(true);
        }
      }
    }
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
        vx: 0,
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
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      // Hit fighters.
      for (const f of this.fighters) {
        if (d.hit.has(f) || f.koed) continue;
        if (Math.abs(d.x - f.x) < f.radius + 8 && d.y > f.y - f.height && d.y < f.y + 6) {
          d.hit.add(f);
          // Hazards hit hard: they telegraph, so eating one is on you.
          const kbX = d.vx !== 0 ? Math.sign(d.vx) * 300 : (Math.random() * 2 - 1) * 140;
          this.hurtFighter(f, 13, kbX, -200, 0.28);
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
        const fallingThrough = d.x >= r.x && d.x <= r.x + r.w && prevY <= r.y && d.y >= r.y;
        // Wheel daggers fly in any direction; embed on entering a solid.
        const inside = d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h;
        if (fallingThrough || inside) {
          if (fallingThrough) d.y = r.y + 4;
          d.stuck = true;
          d.stuckTimer = 2;
          this.particles.dustPuff(d.x, d.y, WHITE, 4);
          sound.land(0.25);
          break;
        }
      }
      if (d.y > map.height + 100 || d.y < -300 || d.x < -100 || d.x > map.width + 100) {
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
            this.hurtFighter(f, 30, Math.sign(f.x - l.x || Math.random() - 0.5) * 380, -620, 0.5);
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
            this.hurtFighter(f, 17, Math.sign(f.x - lv.x || Math.random() - 0.5) * 340, -560, 0.4);
            this.particles.burst(f.x, f.y - 40, LAVA_RED, 12, { speed: 320, spread: Math.PI, gravity: 500, size: 5, glow: true });
            sound.hit(true, f.blocking, true);
          }
        }
      }
    }
    this.lavas = this.lavas.filter((lv) => lv.phase === "warn" || lv.timer > 0);
  }

  private drawPortal(x: number, y: number, color: number): void {
    this.strokeRotatedEllipse(x, y, PORTAL_RADIUS * 0.55, PORTAL_RADIUS, this.time * 1.3, 5, color, 0.85);
    this.strokeRotatedEllipse(x, y, PORTAL_RADIUS * 0.34, PORTAL_RADIUS * 0.66, -this.time * 2.1, 3, WHITE, 0.5);
    const pulse = 0.35 + 0.2 * Math.sin(this.time * 5);
    this.g.circle(x, y, PORTAL_RADIUS * 0.3);
    this.g.fill({ color, alpha: pulse });
  }

  private strokeRotatedEllipse(x: number, y: number, rx: number, ry: number, rot: number, width: number, color: number, alpha: number): void {
    const pts: number[] = [];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2;
      const ex = Math.cos(t) * rx;
      const ey = Math.sin(t) * ry;
      pts.push(x + ex * cos - ey * sin, y + ex * sin + ey * cos);
    }
    this.g.poly(pts);
    this.g.stroke({ width, color, alpha });
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
      // Tail trails opposite the flight direction (straight up for falling daggers).
      const len = Math.hypot(d.vx, d.vy) || 1;
      const ux = d.vx / len;
      const uy = d.vy / len || (d.vx === 0 ? 1 : 0);
      this.g.moveTo(d.x - ux * 26, d.y - uy * 26);
      this.g.lineTo(d.x, d.y);
      this.g.stroke({ width: 4, color: WHITE, alpha });
      this.g.circle(d.x, d.y, 3);
      this.g.fill({ color: YELLOW, alpha });
    }

    // Spinning dagger wheels.
    for (const w of this.wheels) {
      this.g.circle(w.x, w.y, WHEEL_RADIUS);
      this.g.stroke({ width: 4, color: YELLOW, alpha: 0.9 });
      this.g.circle(w.x, w.y, 7);
      this.g.fill({ color: YELLOW, alpha: 1 });
      for (let i = 0; i < 4; i++) {
        const a = w.angle + (i / 4) * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        this.g.moveTo(w.x + cos * 8, w.y + sin * 8);
        this.g.lineTo(w.x + cos * WHEEL_RADIUS, w.y + sin * WHEEL_RADIUS);
        this.g.stroke({ width: 4, color: YELLOW, alpha: 0.95 });
        // Blade tip.
        this.g.circle(w.x + cos * (WHEEL_RADIUS - 3), w.y + sin * (WHEEL_RADIUS - 3), 4);
        this.g.fill({ color: WHITE, alpha: 0.95 });
      }
    }

    // Portal swirls: nested counter-rotating ellipses.
    for (const ps of this.portals) {
      this.drawPortal(ps.def.x1, ps.def.y1, ps.color);
      this.drawPortal(ps.def.x2, ps.def.y2, ps.color);
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
