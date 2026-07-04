import { Graphics, Container } from "pixi.js";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  gravity: number;
  glow: boolean;
  streak: boolean;
}

export class ParticleSystem {
  readonly view = new Container();
  private particles: Particle[] = [];
  private g = new Graphics();
  private gGlow = new Graphics();

  constructor() {
    this.gGlow.blendMode = "add";
    this.view.addChild(this.g);
    this.view.addChild(this.gGlow);
  }

  burst(
    x: number,
    y: number,
    color: number,
    count: number,
    opts?: { speed?: number; spread?: number; gravity?: number; size?: number; glow?: boolean; angle?: number },
  ): void {
    const speed = opts?.speed ?? 260;
    const spread = opts?.spread ?? Math.PI * 2;
    const gravity = opts?.gravity ?? 900;
    const baseSize = opts?.size ?? 4;
    const baseAngle = opts?.angle ?? -Math.PI / 2;
    const glow = opts?.glow ?? false;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle - spread / 2 + Math.random() * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      const life = 0.25 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life,
        maxLife: life,
        size: baseSize * (0.6 + Math.random() * 0.8),
        color,
        gravity,
        glow,
        streak: false,
      });
    }
  }

  dustPuff(x: number, y: number, color = 0xffffff, count = 10): void {
    this.burst(x, y, color, count, { speed: 180, spread: Math.PI * 0.9, gravity: 300, size: 5 });
  }

  streakBurst(x: number, y: number, color: number, count: number, opts: { angle: number; speed?: number; spread?: number; size?: number }): void {
    const speed = opts.speed ?? 500;
    const spread = opts.spread ?? 0.5;
    for (let i = 0; i < count; i++) {
      const angle = opts.angle - spread / 2 + Math.random() * spread;
      const s = speed * (0.6 + Math.random() * 0.7);
      const life = 0.12 + Math.random() * 0.1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life,
        maxLife: life,
        size: opts.size ?? 4,
        color,
        gravity: 0,
        glow: true,
        streak: true,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.g.clear();
    this.gGlow.clear();
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const target = p.glow ? this.gGlow : this.g;
      if (p.streak) {
        const len = p.size * 3 * t + 2;
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const dx = (p.vx / speed) * len;
        const dy = (p.vy / speed) * len;
        target.moveTo(p.x - dx, p.y - dy);
        target.lineTo(p.x, p.y);
        target.stroke({ width: Math.max(1.5, p.size * t), color: p.color, alpha: t, cap: "round" });
      } else {
        target.circle(p.x, p.y, p.size * t);
        target.fill({ color: p.color, alpha: t });
      }
    }
  }
}
