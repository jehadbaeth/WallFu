import { Application, Container, Graphics } from "pixi.js";
import type { MapData, Rect } from "../core/MapTypes";
import { cloneMap } from "../core/MapTypes";
import { applyBackground } from "../render/BackgroundLoader";

export type EditorTool = "platform" | "wall" | "spawn1" | "spawn2" | "erase";

const WHITE = 0xffffff;
const CYAN = 0x2ee6ff;
const MAGENTA = 0xff2e88;

export class MapEditor {
  private app: Application;
  private layer = new Container();
  private bgLayer = new Container();
  private g = new Graphics();
  private map: MapData;
  private tool: EditorTool = "platform";
  private dragStart: { x: number; y: number } | null = null;
  private dragCurrent: { x: number; y: number } | null = null;
  private active = false;
  private toWorld: (x: number, y: number) => { x: number; y: number };

  private onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);

  constructor(app: Application, parent: Container, initialMap: MapData, toWorld?: (x: number, y: number) => { x: number; y: number }) {
    this.app = app;
    this.map = cloneMap(initialMap);
    this.toWorld = toWorld ?? ((x, y) => ({ x, y }));
    this.layer.addChild(this.bgLayer);
    this.layer.addChild(this.g);
    parent.addChild(this.layer);
    this.layer.visible = false;
  }

  activate(map: MapData): void {
    this.map = cloneMap(map);
    this.active = true;
    this.layer.visible = true;
    this.app.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.app.canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.redraw();
  }

  deactivate(): void {
    this.active = false;
    this.layer.visible = false;
    this.app.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.app.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
  }

  getMap(): MapData {
    return cloneMap(this.map);
  }

  setMap(map: MapData): void {
    this.map = cloneMap(map);
    this.redraw();
  }

  undo(): void {
    if (this.tool === "wall") this.map.walls.pop();
    else this.map.platforms.pop();
    this.redraw();
  }

  clear(): void {
    this.map.platforms = [];
    this.map.walls = [];
    this.redraw();
  }

  private localPoint(e: PointerEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.active) return;
    const p = this.localPoint(e);
    if (this.tool === "spawn1") {
      this.map.spawn1 = { x: p.x, y: p.y };
      this.redraw();
      return;
    }
    if (this.tool === "spawn2") {
      this.map.spawn2 = { x: p.x, y: p.y };
      this.redraw();
      return;
    }
    if (this.tool === "erase") {
      this.eraseAt(p.x, p.y);
      return;
    }
    this.dragStart = p;
    this.dragCurrent = p;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.active || !this.dragStart) return;
    this.dragCurrent = this.localPoint(e);
    this.redraw();
  }

  private handlePointerUp(_e: PointerEvent): void {
    if (!this.active || !this.dragStart || !this.dragCurrent) {
      this.dragStart = null;
      this.dragCurrent = null;
      return;
    }
    const rect = normalizeRect(this.dragStart, this.dragCurrent);
    this.dragStart = null;
    this.dragCurrent = null;
    if (rect.w < 8 || rect.h < 8) {
      this.redraw();
      return;
    }
    if (this.tool === "wall") this.map.walls.push(rect);
    else if (this.tool === "platform") this.map.platforms.push(rect);
    this.redraw();
  }

  private eraseAt(x: number, y: number): void {
    const hit = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    for (let i = this.map.walls.length - 1; i >= 0; i--) {
      if (hit(this.map.walls[i])) {
        this.map.walls.splice(i, 1);
        this.redraw();
        return;
      }
    }
    for (let i = this.map.platforms.length - 1; i >= 0; i--) {
      if (hit(this.map.platforms[i])) {
        this.map.platforms.splice(i, 1);
        this.redraw();
        return;
      }
    }
  }

  private redraw(): void {
    applyBackground(this.bgLayer, this.map.backgroundImage, this.map.width, this.map.height, 0.6);
    this.g.clear();

    for (const p of this.map.platforms) {
      this.g.rect(p.x, p.y, p.w, p.h);
      this.g.fill({ color: WHITE, alpha: 0.85 });
    }
    for (const w of this.map.walls) {
      this.g.rect(w.x, w.y, w.w, w.h);
      this.g.fill({ color: WHITE, alpha: 0.5 });
      this.g.rect(w.x, w.y, w.w, w.h);
      this.g.stroke({ width: 3, color: WHITE, alpha: 0.9 });
    }

    if (this.dragStart && this.dragCurrent) {
      const rect = normalizeRect(this.dragStart, this.dragCurrent);
      this.g.rect(rect.x, rect.y, rect.w, rect.h);
      this.g.fill({ color: this.tool === "wall" ? MAGENTA : CYAN, alpha: 0.3 });
      this.g.rect(rect.x, rect.y, rect.w, rect.h);
      this.g.stroke({ width: 2, color: this.tool === "wall" ? MAGENTA : CYAN, alpha: 0.9 });
    }

    this.g.circle(this.map.spawn1.x, this.map.spawn1.y, 14);
    this.g.stroke({ width: 3, color: CYAN, alpha: 1 });
    this.g.circle(this.map.spawn2.x, this.map.spawn2.y, 14);
    this.g.stroke({ width: 3, color: MAGENTA, alpha: 1 });
  }
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}
