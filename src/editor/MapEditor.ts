import { Application, Container, Graphics } from "pixi.js";
import type { MapData, Rect, PolyPoint } from "../core/MapTypes";
import { cloneMap, pointInPolygon, WHEEL_RADIUS, PORTAL_RADIUS } from "../core/MapTypes";
import { applyBackground } from "../render/BackgroundLoader";

export type EditorTool = "platform" | "wall" | "poly" | "crumble" | "wheel" | "portal" | "spawn1" | "spawn2" | "erase";

const PORTAL_COLORS = [0x9d4dff, 0x2ee6ff, 0xffe14d, 0x35e07c];

const POLY_CLOSE_DIST = 16;

const WHITE = 0xffffff;
const CYAN = 0x2ee6ff;
const MAGENTA = 0xff2e88;
const YELLOW = 0xffe14d;

export class MapEditor {
  private app: Application;
  private layer = new Container();
  private bgLayer = new Container();
  private g = new Graphics();
  private map: MapData;
  private tool: EditorTool = "platform";
  private dragStart: { x: number; y: number } | null = null;
  private dragCurrent: { x: number; y: number } | null = null;
  private polyDraft: PolyPoint[] = [];
  private portalDraft: { x: number; y: number } | null = null; // first end of an in-progress pair
  private hoverPoint: { x: number; y: number } | null = null;
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
    if (tool !== "poly") this.polyDraft = [];
    if (tool !== "portal") this.portalDraft = null;
    this.redraw();
  }

  /** Abandons the in-progress polygon or portal pair (wired to Escape). */
  cancelPolyDraft(): void {
    this.polyDraft = [];
    this.portalDraft = null;
    this.redraw();
  }

  getMap(): MapData {
    return cloneMap(this.map);
  }

  setMap(map: MapData): void {
    this.map = cloneMap(map);
    this.redraw();
  }

  undo(): void {
    if (this.tool === "poly") {
      if (this.polyDraft.length) this.polyDraft.pop();
      else this.map.polygons?.pop();
    } else if (this.tool === "wall") {
      this.map.walls.pop();
    } else if (this.tool === "wheel") {
      this.map.daggerWheels?.pop();
    } else if (this.tool === "portal") {
      if (this.portalDraft) this.portalDraft = null;
      else this.map.portals?.pop();
    } else {
      this.map.platforms.pop();
    }
    this.redraw();
  }

  clear(): void {
    this.map.platforms = [];
    this.map.walls = [];
    this.map.polygons = [];
    this.map.daggerWheels = [];
    this.map.portals = [];
    this.polyDraft = [];
    this.portalDraft = null;
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
    if (this.tool === "crumble") {
      // Toggle crumbling on the clicked platform.
      for (const plat of this.map.platforms) {
        if (p.x >= plat.x && p.x <= plat.x + plat.w && p.y >= plat.y - 8 && p.y <= plat.y + plat.h + 8) {
          plat.crumble = !plat.crumble;
          this.redraw();
          return;
        }
      }
      return;
    }
    if (this.tool === "wheel") {
      this.map.daggerWheels = this.map.daggerWheels ?? [];
      this.map.daggerWheels.push({ x: p.x, y: p.y });
      this.redraw();
      return;
    }
    if (this.tool === "portal") {
      // Two clicks: entry, then exit.
      if (!this.portalDraft) {
        this.portalDraft = { x: p.x, y: p.y };
      } else {
        this.map.portals = this.map.portals ?? [];
        this.map.portals.push({ x1: this.portalDraft.x, y1: this.portalDraft.y, x2: p.x, y2: p.y });
        this.portalDraft = null;
      }
      this.redraw();
      return;
    }
    if (this.tool === "poly") {
      // Clicking near the first point (with 3+ points down) closes the shape.
      const first = this.polyDraft[0];
      if (this.polyDraft.length >= 3 && first && Math.hypot(p.x - first.x, p.y - first.y) < POLY_CLOSE_DIST) {
        this.map.polygons = this.map.polygons ?? [];
        this.map.polygons.push({ points: this.polyDraft });
        this.polyDraft = [];
      } else {
        this.polyDraft.push({ x: p.x, y: p.y });
      }
      this.redraw();
      return;
    }
    this.dragStart = p;
    this.dragCurrent = p;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.active) return;
    if (this.tool === "poly" && this.polyDraft.length) {
      this.hoverPoint = this.localPoint(e);
      this.redraw();
      return;
    }
    if (this.tool === "portal" && this.portalDraft) {
      this.hoverPoint = this.localPoint(e);
      this.redraw();
      return;
    }
    if (!this.dragStart) return;
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
    for (let i = (this.map.daggerWheels?.length ?? 0) - 1; i >= 0; i--) {
      const w = this.map.daggerWheels![i];
      if (Math.hypot(x - w.x, y - w.y) < WHEEL_RADIUS + 6) {
        this.map.daggerWheels!.splice(i, 1);
        this.redraw();
        return;
      }
    }
    for (let i = (this.map.portals?.length ?? 0) - 1; i >= 0; i--) {
      const p = this.map.portals![i];
      if (Math.hypot(x - p.x1, y - p.y1) < PORTAL_RADIUS || Math.hypot(x - p.x2, y - p.y2) < PORTAL_RADIUS) {
        this.map.portals!.splice(i, 1);
        this.redraw();
        return;
      }
    }
    for (let i = (this.map.polygons?.length ?? 0) - 1; i >= 0; i--) {
      if (pointInPolygon(x, y, this.map.polygons![i].points)) {
        this.map.polygons!.splice(i, 1);
        this.redraw();
        return;
      }
    }
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
      this.g.fill({ color: p.crumble ? YELLOW : WHITE, alpha: 0.85 });
      if (p.crumble) {
        // Crack marks so crumbling platforms are recognizable in the editor.
        for (let cx = p.x + 14; cx < p.x + p.w - 6; cx += 26) {
          this.g.moveTo(cx, p.y + 2);
          this.g.lineTo(cx + 8, p.y + p.h - 2);
          this.g.stroke({ width: 2, color: 0x000000, alpha: 0.6 });
        }
      }
    }
    for (const w of this.map.walls) {
      this.g.rect(w.x, w.y, w.w, w.h);
      this.g.fill({ color: WHITE, alpha: 0.5 });
      this.g.rect(w.x, w.y, w.w, w.h);
      this.g.stroke({ width: 3, color: WHITE, alpha: 0.9 });
    }
    for (const poly of this.map.polygons ?? []) {
      this.g.poly(poly.points.flatMap((pt) => [pt.x, pt.y]));
      this.g.fill({ color: WHITE, alpha: 0.5 });
      this.g.poly(poly.points.flatMap((pt) => [pt.x, pt.y]));
      this.g.stroke({ width: 3, color: WHITE, alpha: 0.9 });
    }

    for (const w of this.map.daggerWheels ?? []) {
      this.drawWheelIcon(w.x, w.y);
    }
    (this.map.portals ?? []).forEach((p, i) => {
      const color = PORTAL_COLORS[i % PORTAL_COLORS.length];
      this.drawPortalIcon(p.x1, p.y1, color);
      this.drawPortalIcon(p.x2, p.y2, color);
      this.g.moveTo(p.x1, p.y1);
      this.g.lineTo(p.x2, p.y2);
      this.g.stroke({ width: 2, color, alpha: 0.3 });
    });
    if (this.portalDraft) {
      const color = PORTAL_COLORS[(this.map.portals?.length ?? 0) % PORTAL_COLORS.length];
      this.drawPortalIcon(this.portalDraft.x, this.portalDraft.y, color);
      if (this.hoverPoint) {
        this.g.moveTo(this.portalDraft.x, this.portalDraft.y);
        this.g.lineTo(this.hoverPoint.x, this.hoverPoint.y);
        this.g.stroke({ width: 2, color, alpha: 0.5 });
      }
    }

    if (this.dragStart && this.dragCurrent) {
      const rect = normalizeRect(this.dragStart, this.dragCurrent);
      this.g.rect(rect.x, rect.y, rect.w, rect.h);
      this.g.fill({ color: this.tool === "wall" ? MAGENTA : CYAN, alpha: 0.3 });
      this.g.rect(rect.x, rect.y, rect.w, rect.h);
      this.g.stroke({ width: 2, color: this.tool === "wall" ? MAGENTA : CYAN, alpha: 0.9 });
    }

    // In-progress polygon: points, connecting lines, rubber band to the cursor.
    if (this.polyDraft.length) {
      for (let i = 0; i + 1 < this.polyDraft.length; i++) {
        this.g.moveTo(this.polyDraft[i].x, this.polyDraft[i].y);
        this.g.lineTo(this.polyDraft[i + 1].x, this.polyDraft[i + 1].y);
        this.g.stroke({ width: 2, color: YELLOW, alpha: 0.9 });
      }
      if (this.hoverPoint) {
        const last = this.polyDraft[this.polyDraft.length - 1];
        this.g.moveTo(last.x, last.y);
        this.g.lineTo(this.hoverPoint.x, this.hoverPoint.y);
        this.g.stroke({ width: 2, color: YELLOW, alpha: 0.4 });
      }
      for (const pt of this.polyDraft) {
        this.g.circle(pt.x, pt.y, 5);
        this.g.fill({ color: YELLOW, alpha: 1 });
      }
      // Highlight the first point as the close target.
      this.g.circle(this.polyDraft[0].x, this.polyDraft[0].y, POLY_CLOSE_DIST / 2 + 3);
      this.g.stroke({ width: 2, color: YELLOW, alpha: 0.8 });
    }

    this.g.circle(this.map.spawn1.x, this.map.spawn1.y, 14);
    this.g.stroke({ width: 3, color: CYAN, alpha: 1 });
    this.g.circle(this.map.spawn2.x, this.map.spawn2.y, 14);
    this.g.stroke({ width: 3, color: MAGENTA, alpha: 1 });
  }

  private drawWheelIcon(x: number, y: number): void {
    this.g.circle(x, y, WHEEL_RADIUS);
    this.g.stroke({ width: 3, color: YELLOW, alpha: 0.9 });
    this.g.circle(x, y, 6);
    this.g.fill({ color: YELLOW, alpha: 0.9 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.g.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
      this.g.lineTo(x + Math.cos(a) * WHEEL_RADIUS, y + Math.sin(a) * WHEEL_RADIUS);
      this.g.stroke({ width: 3, color: YELLOW, alpha: 0.9 });
    }
  }

  private drawPortalIcon(x: number, y: number, color: number): void {
    this.g.ellipse(x, y, PORTAL_RADIUS * 0.55, PORTAL_RADIUS);
    this.g.stroke({ width: 4, color, alpha: 0.9 });
    this.g.ellipse(x, y, PORTAL_RADIUS * 0.3, PORTAL_RADIUS * 0.62);
    this.g.stroke({ width: 2, color, alpha: 0.6 });
  }
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}
