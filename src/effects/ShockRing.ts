import { Graphics, Container } from "pixi.js";

interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  maxRadius: number;
  color: number;
  width: number;
}

export class ShockRingSystem {
  readonly view = new Container();
  private g = new Graphics();
  private rings: Ring[] = [];

  constructor() {
    this.g.blendMode = "add";
    this.view.addChild(this.g);
  }

  spawn(x: number, y: number, color: number, maxRadius = 90, life = 0.32, width = 6): void {
    this.rings.push({ x, y, life, maxLife: life, maxRadius, color, width });
  }

  update(dt: number): void {
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);

    this.g.clear();
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      const radius = r.maxRadius * (0.2 + t * 0.8);
      const alpha = 1 - t;
      this.g.circle(r.x, r.y, radius);
      this.g.stroke({ width: r.width * (1 - t * 0.6), color: r.color, alpha });
    }
  }
}
