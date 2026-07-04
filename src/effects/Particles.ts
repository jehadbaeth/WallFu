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
}

export class ParticleSystem {
  readonly view = new Container();
  private particles: Particle[] = [];
  private g = new Graphics();

  constructor() {
    this.view.addChild(this.g);
  }

  burst(x: number, y: number, color: number, count: number, opts?: { speed?: number; spread?: number; gravity?: number; size?: number }): void {
    const speed = opts?.speed ?? 260;
    const spread = opts?.spread ?? Math.PI * 2;
    const gravity = opts?.gravity ?? 900;
    const baseSize = opts?.size ?? 4;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 - spread / 2 + Math.random() * spread;
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
      });
    }
  }

  dustPuff(x: number, y: number, color = 0xffffff, count = 10): void {
    this.burst(x, y, color, count, { speed: 180, spread: Math.PI * 0.9, gravity: 300, size: 5 });
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
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      this.g.circle(p.x, p.y, p.size * t);
      this.g.fill({ color: p.color, alpha: t });
    }
  }
}
