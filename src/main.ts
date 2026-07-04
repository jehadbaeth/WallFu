import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { Fighter, type FighterEvent } from "./core/Fighter";
import { resolveCombat, isHeavyKind, isKickKind, ATTACKS, type AttackKind } from "./core/Combat";
import { AIController, AI_DIFFICULTIES } from "./core/AIController";
import {
  KeyboardIntentSource,
  BINDING_ACTIONS,
  defaultP1Bindings,
  defaultP2Bindings,
  keyLabel,
  loadBindings,
  saveBindings,
} from "./core/KeyboardInput";
import { applyBackground, fileToBackgroundDataUrl } from "./render/BackgroundLoader";
import { GamepadIntentSource, mergeIntents } from "./core/GamepadInput";
import { StickFigureView } from "./render/StickFigure";
import { ParticleSystem } from "./effects/Particles";
import { CameraShake } from "./effects/CameraShake";
import { ShockRingSystem } from "./effects/ShockRing";
import { type MapData, defaultMap, fitMapTo, listSavedMaps, saveMapToStorage, loadMapFromStorage } from "./core/MapTypes";
import { loadOptions, saveOptions } from "./core/Options";
import { MapEditor, type EditorTool } from "./editor/MapEditor";
import { sound } from "./effects/Sound";

const CYAN = 0x2ee6ff;
const MAGENTA = 0xff2e88;
const WHITE = 0xffffff;
const YELLOW = 0xffe14d;

const FIXED_DT = 1 / 60;
const KO_FREEZE_TIME = 1.0;

// The whole game plays in a fixed virtual space; the viewport letterboxes it
// onto whatever screen it runs on (TV, phone, projector).
const VIRTUAL_W = 1920;
const VIRTUAL_H = 1080;

type GameState = "menu" | "options" | "controls" | "editor" | "fight";

async function main() {
  const app = new Application();
  await app.init({
    background: "#000000",
    resizeTo: window,
    antialias: true,
  });
  document.getElementById("app")!.appendChild(app.canvas);

  const options = loadOptions();
  sound.setVolume(options.soundVolume);
  window.addEventListener("pointerdown", () => sound.unlock(), { once: true });
  window.addEventListener("keydown", () => sound.unlock(), { once: true });

  let currentMap: MapData = defaultMap(VIRTUAL_W, VIRTUAL_H);

  const viewport = new Container();
  app.stage.addChild(viewport);
  function fitViewport() {
    const scale = Math.min(app.screen.width / VIRTUAL_W, app.screen.height / VIRTUAL_H);
    viewport.scale.set(scale);
    viewport.position.set((app.screen.width - VIRTUAL_W * scale) / 2, (app.screen.height - VIRTUAL_H * scale) / 2);
  }
  fitViewport();

  const world = new Container();
  viewport.addChild(world);

  const editorLayer = new Container();
  viewport.addChild(editorLayer);
  const mapEditor = new MapEditor(app, editorLayer, currentMap, (x, y) => ({
    x: (x - viewport.position.x) / viewport.scale.x,
    y: (y - viewport.position.y) / viewport.scale.y,
  }));

  const bgLayer = new Container();
  world.addChild(bgLayer);
  const mapGeometry = new Graphics();
  world.addChild(mapGeometry);
  function drawMapGeometry() {
    applyBackground(bgLayer, currentMap.backgroundImage, VIRTUAL_W, VIRTUAL_H);
    mapGeometry.clear();
    for (const p of currentMap.platforms) {
      mapGeometry.rect(p.x, p.y, p.w, p.h);
      mapGeometry.fill({ color: WHITE, alpha: 0.9 });
    }
    for (const w of currentMap.walls) {
      mapGeometry.rect(w.x, w.y, w.w, w.h);
      mapGeometry.fill({ color: WHITE, alpha: 0.55 });
      mapGeometry.rect(w.x, w.y, w.w, w.h);
      mapGeometry.stroke({ width: 4, color: WHITE, alpha: 0.95 });
    }
  }
  drawMapGeometry();

  const particles = new ParticleSystem();
  world.addChild(particles.view);

  const shockRings = new ShockRingSystem();
  world.addChild(shockRings.view);

  const shake = new CameraShake();
  function addShake(amount: number) {
    shake.add(amount * options.shakeIntensity);
  }
  let zoomPunch = 0;
  let zoomPunchVelocity = 0;

  const player1 = new Fighter(currentMap.spawn1.x, currentMap.spawn1.y);
  const player2 = new Fighter(currentMap.spawn2.x, currentMap.spawn2.y);
  player1.facing = 1;
  player2.facing = -1;

  const bindings = loadBindings();
  const player1Input = new KeyboardIntentSource(bindings.p1);
  const player2Input = new KeyboardIntentSource(bindings.p2);
  const player1Gamepad = new GamepadIntentSource(0);
  const player2Gamepad = new GamepadIntentSource(1);
  let aiController: AIController | null = null; // non-null while in a vs-AI match

  const player1View = new StickFigureView(CYAN);
  const player2View = new StickFigureView(MAGENTA);
  world.addChild(player1View.view);
  world.addChild(player2View.view);

  // --- UI: health bars, round dots, KO banner ---
  const uiLayer = new Container();
  viewport.addChild(uiLayer);

  const BAR_W = 520;
  const BAR_H = 30;

  const p1BarBg = new Graphics();
  const p1BarFg = new Graphics();
  const p2BarBg = new Graphics();
  const p2BarFg = new Graphics();
  uiLayer.addChild(p1BarBg, p1BarFg, p2BarBg, p2BarFg);

  const dotsLayer1 = new Container();
  const dotsLayer2 = new Container();
  uiLayer.addChild(dotsLayer1, dotsLayer2);

  const koStyle = new TextStyle({
    fontFamily: "monospace",
    fontSize: 110,
    fontWeight: "900",
    fill: WHITE,
    letterSpacing: 6,
  });
  const koText = new Text({ text: "K.O.", style: koStyle });
  koText.anchor.set(0.5);
  koText.visible = false;
  uiLayer.addChild(koText);

  const matchOverHint = new Text({
    text: "Press Enter for menu",
    style: new TextStyle({ fontFamily: "monospace", fontSize: 20, fontWeight: "700", fill: WHITE, letterSpacing: 1 }),
  });
  matchOverHint.anchor.set(0.5);
  matchOverHint.visible = false;
  uiLayer.addChild(matchOverHint);

  const flashOverlay = new Graphics();
  uiLayer.addChild(flashOverlay);

  // --- Announcement popups (FIGHT!, FIRST BLOOD, combos...) ---
  const announceStyle = new TextStyle({
    fontFamily: "monospace",
    fontSize: 84,
    fontWeight: "900",
    fill: WHITE,
    letterSpacing: 8,
    stroke: { color: 0x000000, width: 8 },
  });
  const announceText = new Text({ text: "", style: announceStyle });
  announceText.anchor.set(0.5);
  announceText.visible = false;
  announceText.position.set(VIRTUAL_W / 2, VIRTUAL_H * 0.32);
  uiLayer.addChild(announceText);
  let announceTimer = 0;
  let announceScale = 1;
  let announceScaleVel = 0;

  function announce(message: string, color = YELLOW, excitement = 1) {
    announceText.text = message;
    announceText.tint = color;
    announceText.visible = true;
    announceText.alpha = 1;
    announceTimer = 1.25;
    announceScale = 2.6;
    announceScaleVel = 0;
    sound.announce(excitement);
  }

  function updateAnnouncement(dt: number) {
    if (!announceText.visible) return;
    // Spring the scale down from the pop-in size.
    const accel = (1 - announceScale) * 160 - announceScaleVel * 14;
    announceScaleVel += accel * dt;
    announceScale += announceScaleVel * dt;
    announceText.scale.set(announceScale);
    announceTimer -= dt;
    if (announceTimer < 0.3) announceText.alpha = Math.max(0, announceTimer / 0.3);
    if (announceTimer <= 0) announceText.visible = false;
  }
  let screenFlash = 0;

  const comboStyle = new TextStyle({
    fontFamily: "monospace",
    fontSize: 40,
    fontWeight: "900",
    fill: YELLOW,
    letterSpacing: 2,
  });
  const p1ComboText = new Text({ text: "", style: comboStyle });
  const p2ComboText = new Text({ text: "", style: comboStyle });
  p1ComboText.anchor.set(0, 0.5);
  p2ComboText.anchor.set(1, 0.5);
  uiLayer.addChild(p1ComboText, p2ComboText);

  let p1ComboCount = 0;
  let p1ComboTimer = 0;
  let p2ComboCount = 0;
  let p2ComboTimer = 0;
  const COMBO_RESET_TIME = 1.1;

  const controlsStyleOpts = {
    fontFamily: "monospace",
    fontSize: 19,
    fontWeight: "700",
    fill: WHITE,
    letterSpacing: 0.5,
  } as const;
  const controlsStyle = new TextStyle(controlsStyleOpts);
  const p1Controls = new Text({
    text: "P1  A/D Move  W Jump  S Down  |  F HiPunch  V LoPunch  G HiKick  B LoKick  H Block  J Dash\nS+Punch Uppercut   Air S+Kick Dive Kick   Dash+Attack Dash Attack   W at wall Wall Jump",
    style: controlsStyle,
  });
  const p2Controls = new Text({
    text: "P2  ←/→ Move  ↑ Jump  ↓ Down  |  Num4 HiPunch  Num1 LoPunch  Num5 HiKick  Num2 LoKick  Num6 Block  Num3 Dash\n↓+Punch Uppercut   Air ↓+Kick Dive Kick   Dash+Attack Dash Attack",
    style: new TextStyle({ ...controlsStyleOpts, align: "right" }),
  });
  p1Controls.anchor.set(0, 1);
  p2Controls.anchor.set(1, 1);
  p1Controls.alpha = 0.65;
  p2Controls.alpha = 0.65;
  uiLayer.addChild(p1Controls, p2Controls);

  function layoutUI() {
    p1BarBg.position.set(48, 36);
    p1BarFg.position.set(48, 36);
    p2BarBg.position.set(VIRTUAL_W - 48 - BAR_W, 36);
    p2BarFg.position.set(VIRTUAL_W - 48 - BAR_W, 36);
    dotsLayer1.position.set(48, 76);
    dotsLayer2.position.set(VIRTUAL_W - 48 - BAR_W, 76);
    koText.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 - 80);
    matchOverHint.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 - 20);
    p1ComboText.position.set(48, 150);
    p2ComboText.position.set(VIRTUAL_W - 48, 150);
    p1Controls.position.set(28, VIRTUAL_H - 18);
    p2Controls.position.set(VIRTUAL_W - 28, VIRTUAL_H - 18);
    flashOverlay.clear();
    flashOverlay.rect(0, 0, VIRTUAL_W, VIRTUAL_H);
    flashOverlay.fill({ color: WHITE, alpha: 1 });
  }
  layoutUI();
  flashOverlay.alpha = 0;

  window.addEventListener("resize", () => fitViewport());

  function drawHealthBar(bg: Graphics, fg: Graphics, health: number, maxHealth: number, color: number, rightAlign: boolean) {
    bg.clear();
    bg.rect(0, 0, BAR_W, BAR_H);
    bg.fill({ color: 0x222222, alpha: 0.85 });
    bg.rect(0, 0, BAR_W, BAR_H);
    bg.stroke({ width: 3, color: WHITE, alpha: 0.6 });

    const pct = Math.max(0, health / maxHealth);
    fg.clear();
    const w = (BAR_W - 6) * pct;
    if (rightAlign) {
      fg.rect(BAR_W - 3 - w, 3, w, BAR_H - 6);
    } else {
      fg.rect(3, 3, w, BAR_H - 6);
    }
    fg.fill({ color: pct > 0.3 ? color : 0xff3333, alpha: 1 });
  }

  function drawRoundDots(layer: Container, wins: number) {
    layer.removeChildren();
    for (let i = 0; i < options.roundsToWin; i++) {
      const dot = new Graphics();
      dot.circle(i * 24 + 10, 10, 8);
      dot.fill({ color: i < wins ? YELLOW : 0x444444, alpha: 1 });
      dot.stroke({ width: 2, color: WHITE, alpha: 0.5 });
      layer.addChild(dot);
    }
  }

  let p1Wins = 0;
  let p2Wins = 0;
  drawRoundDots(dotsLayer1, p1Wins);
  drawRoundDots(dotsLayer2, p2Wins);

  let hitstopTimer = 0;
  let koFreezeTimer = 0;
  let koPending: "p1" | "p2" | null = null;
  let matchOver = false;
  let firstBloodDone = false;
  let finishHimDone = false;
  let p1RunDustTimer = 0;
  let p2RunDustTimer = 0;
  let p1DashStreakTimer = 0;
  let p2DashStreakTimer = 0;

  function updateRunDust(fighter: Fighter, timer: number, color: number, dt: number): number {
    const speed = Math.abs(fighter.vx);
    if (fighter.grounded && speed > 260 && !fighter.isAttacking && !fighter.blocking) {
      timer -= dt;
      if (timer <= 0) {
        timer = 0.09;
        particles.dustPuff(fighter.x - fighter.facing * 10, fighter.y, color, 3);
      }
    } else {
      timer = 0;
    }
    return timer;
  }

  function updateDashStreaks(fighter: Fighter, timer: number, color: number, dt: number): number {
    if (fighter.isDashing) {
      timer -= dt;
      if (timer <= 0) {
        timer = 0.03;
        particles.streakBurst(fighter.x, fighter.y - 40, color, 2, {
          angle: fighter.dashDirection > 0 ? Math.PI : 0,
          speed: 400,
          spread: 0.5,
          size: 4,
        });
      }
    } else {
      timer = 0;
    }
    return timer;
  }

  function handleMovementEvent(fighter: Fighter, ev: FighterEvent) {
    const color = fighter === player1 ? CYAN : MAGENTA;
    if (ev.type === "land") {
      const t = Math.min(ev.impactSpeed / 1400, 1);
      particles.dustPuff(fighter.x, fighter.y, WHITE, Math.round(6 + t * 14));
      if (t > 0.5) addShake(0.25 * t);
      sound.land(t);
    } else if (ev.type === "jump" || ev.type === "airJump") {
      particles.dustPuff(fighter.x, fighter.y, color, 8);
      sound.jump();
    } else if (ev.type === "dash") {
      particles.burst(fighter.x, fighter.y, color, 14, { speed: 220, spread: Math.PI * 0.6, gravity: 100, size: 3, glow: true });
      particles.streakBurst(fighter.x, fighter.y - 40, color, 8, {
        angle: fighter.facing > 0 ? Math.PI : 0,
        speed: 620,
        spread: 0.7,
        size: 5,
      });
      addShake(0.1);
      sound.dash();
    } else if (ev.type === "wallJump") {
      const awayAngle = fighter.facing > 0 ? Math.PI : 0;
      particles.burst(fighter.x, fighter.y - 40, color, 14, { speed: 300, spread: Math.PI * 0.5, angle: awayAngle, gravity: 200, size: 4, glow: true });
      particles.streakBurst(fighter.x, fighter.y - 40, WHITE, 8, { angle: awayAngle, speed: 560, spread: 0.4, size: 4 });
      addShake(0.14);
      sound.wallJump();
    } else if (ev.type === "wallBounce") {
      particles.burst(fighter.x, fighter.y - 50, WHITE, 18, { speed: 400, spread: Math.PI * 1.4, gravity: 300, size: 5, glow: true });
      shockRings.spawn(fighter.x, fighter.y - 50, color, 60, 0.25, 5);
      addShake(0.24);
      sound.wallBounce();
    } else if (ev.type === "attackActive") {
      const data = ATTACKS[ev.kind];
      const heavy = isHeavyKind(ev.kind);
      const originX = fighter.x + fighter.facing * (18 + data.range * 0.6);
      const originY = fighter.y - data.height * 0.6;
      sound.whoosh(heavy);
      particles.burst(originX, originY, color, heavy ? 14 : 8, {
        speed: heavy ? 80 : 50,
        spread: 0.6,
        gravity: 0,
        size: heavy ? 6 : 4,
        glow: true,
      });
      if (isKickKind(ev.kind)) {
        // Crescent of speed lines tracing the kick arc.
        const tipX = fighter.x + fighter.facing * (18 + data.range);
        const tipY = fighter.y - data.height * (ev.kind === "highKick" ? 0.85 : 0.5);
        particles.streakBurst(tipX, tipY, WHITE, heavy ? 9 : 6, {
          angle: fighter.facing > 0 ? -0.6 : Math.PI + 0.6,
          spread: 1.8,
          speed: 460,
          size: 4,
        });
        if (ev.kind === "highKick") {
          shockRings.spawn(tipX, tipY, color, 55, 0.2, 4);
        }
      }
      if (ev.kind === "diveKick") {
        particles.streakBurst(fighter.x, fighter.y, color, 6, { angle: Math.PI / 2 - fighter.facing * 0.4, speed: 500, spread: 0.4, size: 4 });
      }
    }
  }

  function spawnHitEffect(x: number, y: number, blocked: boolean, heavy: boolean, dirX: number, kind: AttackKind, defenderAirborne = false) {
    sound.hit(heavy, blocked, isKickKind(kind));
    if (blocked) {
      particles.burst(x, y, WHITE, heavy ? 18 : 10, { speed: 340, spread: Math.PI * 1.2, gravity: 200, size: 4, glow: true });
      particles.streakBurst(x, y, WHITE, heavy ? 6 : 3, { angle: Math.PI * Math.random(), speed: 300, spread: Math.PI, size: 3 });
      shockRings.spawn(x, y, WHITE, heavy ? 80 : 50, 0.22, 4);
      addShake(heavy ? 0.2 : 0.1);
      return;
    }
    // Sparks fly along the knockback direction (straight up for launchers).
    const knockAngle = kind === "launcher" ? -Math.PI / 2 : dirX > 0 ? 0 : Math.PI;
    particles.burst(x, y, YELLOW, heavy ? 36 : 22, { speed: heavy ? 620 : 440, spread: Math.PI * 1.6, gravity: 500, size: heavy ? 7 : 5, glow: true });
    particles.burst(x, y, WHITE, heavy ? 14 : 8, { speed: 260, spread: Math.PI * 2, gravity: 300, size: 3, glow: true });
    particles.streakBurst(x, y, WHITE, heavy ? 12 : 6, { angle: knockAngle, speed: heavy ? 640 : 460, spread: 0.9, size: heavy ? 5 : 4 });
    shockRings.spawn(x, y, heavy ? YELLOW : WHITE, heavy ? 150 : 85, heavy ? 0.42 : 0.26, heavy ? 9 : 6);
    if (heavy) shockRings.spawn(x, y, WHITE, 90, 0.3, 5);
    if (kind === "launcher") {
      // Rising column to sell the launch.
      particles.streakBurst(x, y - 30, YELLOW, 10, { angle: -Math.PI / 2, speed: 700, spread: 0.5, size: 5 });
      shockRings.spawn(x, y - 60, YELLOW, 110, 0.35, 6);
    }
    if (defenderAirborne) {
      // Juggle hit: extra scatter to sell keeping them airborne.
      particles.streakBurst(x, y, YELLOW, 8, { angle: -Math.PI / 2, speed: 520, spread: 2.4, size: 4 });
      shockRings.spawn(x, y, WHITE, 60, 0.2, 4);
    }
    addShake(heavy ? 0.65 : 0.38);
    screenFlash = heavy ? 0.35 : 0.12;
    zoomPunch = heavy ? 0.07 : 0.03;
    zoomPunchVelocity = 0;
  }

  function beginRoundEnd(loser: "p1" | "p2") {
    koPending = loser;
    koFreezeTimer = KO_FREEZE_TIME;
    koText.text = "K.O.";
    koText.visible = true;
    addShake(0.4);
    zoomPunch = 0.12;
    zoomPunchVelocity = 0;
    const victim = loser === "p1" ? player1 : player2;
    shockRings.spawn(victim.x, victim.y - 60, WHITE, 180, 0.5, 10);
    sound.ko();
  }

  function resetRound() {
    player1.reset(currentMap.spawn1.x, currentMap.spawn1.y);
    player2.reset(currentMap.spawn2.x, currentMap.spawn2.y);
    player1.facing = 1;
    player2.facing = -1;
    koText.visible = false;
    koPending = null;
    p1ComboCount = 0;
    p1ComboTimer = 0;
    p2ComboCount = 0;
    p2ComboTimer = 0;
    finishHimDone = false;
    aiController?.reset();
    announce("FIGHT!", YELLOW, 1.2);
  }

  function startMatch(map: MapData) {
    currentMap = fitMapTo(map, VIRTUAL_W, VIRTUAL_H);
    drawMapGeometry();
    p1Wins = 0;
    p2Wins = 0;
    matchOver = false;
    firstBloodDone = false;
    matchOverHint.visible = false;
    hitstopTimer = 0;
    koFreezeTimer = 0;
    zoomPunch = 0;
    zoomPunchVelocity = 0;
    screenFlash = 0;
    drawRoundDots(dotsLayer1, p1Wins);
    drawRoundDots(dotsLayer2, p2Wins);
    resetRound();
  }

  function updateComboText(text: Text, count: number) {
    text.text = count >= 2 ? `${count} HITS` : "";
  }

  // --- Game state / menu / options / editor wiring ---
  let state: GameState = "menu";
  const menuEl = document.getElementById("menu")!;
  const optionsEl = document.getElementById("options")!;
  const controlsEl = document.getElementById("controls")!;
  const editorToolbarEl = document.getElementById("editor-toolbar")!;

  function setState(next: GameState) {
    state = next;
    menuEl.classList.toggle("visible", next === "menu");
    optionsEl.classList.toggle("visible", next === "options");
    controlsEl.classList.toggle("visible", next === "controls");
    editorToolbarEl.classList.toggle("visible", next === "editor");
    world.visible = next === "fight";
    uiLayer.visible = next === "fight";
    if (next === "editor") mapEditor.activate(currentMap);
    else mapEditor.deactivate();
  }
  setState("menu");

  document.querySelectorAll(".btn").forEach((btn) => btn.addEventListener("click", () => sound.click()));

  document.getElementById("menu-play")!.addEventListener("click", () => {
    aiController = null;
    startMatch(currentMap);
    setState("fight");
  });
  document.getElementById("menu-play-ai")!.addEventListener("click", () => {
    aiController = new AIController(options.aiDifficulty);
    startMatch(currentMap);
    setState("fight");
  });
  document.getElementById("menu-editor")!.addEventListener("click", () => setState("editor"));
  document.getElementById("menu-options")!.addEventListener("click", () => {
    refreshOptionsUI();
    setState("options");
  });

  function refreshOptionsUI() {
    document.getElementById("opt-rounds-value")!.textContent = String(options.roundsToWin);
    document.getElementById("opt-shake-value")!.textContent = `${Math.round(options.shakeIntensity * 100)}%`;
    document.getElementById("opt-volume-value")!.textContent = `${Math.round(options.soundVolume * 100)}%`;
    const d = options.aiDifficulty;
    document.getElementById("opt-ai-value")!.textContent = d.charAt(0).toUpperCase() + d.slice(1);
    document.getElementById("opt-projection")!.textContent = options.projectionMode ? "On" : "Off";
  }
  function applyProjectionMode() {
    // In projection mode nothing but the fighters and effects should emit light:
    // the real objects on the wall play the role of the platforms.
    mapGeometry.visible = !options.projectionMode;
    bgLayer.visible = !options.projectionMode;
    p1Controls.visible = !options.projectionMode;
    p2Controls.visible = !options.projectionMode;
  }
  applyProjectionMode();
  document.getElementById("opt-projection")!.addEventListener("click", () => {
    options.projectionMode = !options.projectionMode;
    saveOptions(options);
    applyProjectionMode();
    refreshOptionsUI();
  });
  function stepAiDifficulty(delta: number) {
    const i = AI_DIFFICULTIES.indexOf(options.aiDifficulty);
    const next = Math.min(AI_DIFFICULTIES.length - 1, Math.max(0, i + delta));
    options.aiDifficulty = AI_DIFFICULTIES[next];
    saveOptions(options);
    refreshOptionsUI();
  }
  document.getElementById("opt-ai-down")!.addEventListener("click", () => stepAiDifficulty(-1));
  document.getElementById("opt-ai-up")!.addEventListener("click", () => stepAiDifficulty(1));
  document.getElementById("opt-rounds-down")!.addEventListener("click", () => {
    options.roundsToWin = Math.max(1, options.roundsToWin - 1);
    saveOptions(options);
    refreshOptionsUI();
  });
  document.getElementById("opt-rounds-up")!.addEventListener("click", () => {
    options.roundsToWin = Math.min(9, options.roundsToWin + 1);
    saveOptions(options);
    refreshOptionsUI();
  });
  document.getElementById("opt-shake-down")!.addEventListener("click", () => {
    options.shakeIntensity = Math.max(0, +(options.shakeIntensity - 0.25).toFixed(2));
    saveOptions(options);
    refreshOptionsUI();
  });
  document.getElementById("opt-shake-up")!.addEventListener("click", () => {
    options.shakeIntensity = Math.min(2, +(options.shakeIntensity + 0.25).toFixed(2));
    saveOptions(options);
    refreshOptionsUI();
  });
  document.getElementById("opt-volume-down")!.addEventListener("click", () => {
    options.soundVolume = Math.max(0, +(options.soundVolume - 0.1).toFixed(2));
    sound.setVolume(options.soundVolume);
    saveOptions(options);
    refreshOptionsUI();
  });
  document.getElementById("opt-volume-up")!.addEventListener("click", () => {
    options.soundVolume = Math.min(1, +(options.soundVolume + 0.1).toFixed(2));
    sound.setVolume(options.soundVolume);
    saveOptions(options);
    refreshOptionsUI();
  });
  document.getElementById("opt-fullscreen")!.addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });
  document.getElementById("opt-back")!.addEventListener("click", () => setState("menu"));

  // --- Key binding configuration ---
  const bindingsGrid = document.getElementById("bindings-grid")!;
  let listeningButton: HTMLButtonElement | null = null;

  function rebuildBindingsGrid() {
    bindingsGrid.innerHTML = "";
    for (const text of ["Action", "Player 1", "Player 2"]) {
      const head = document.createElement("span");
      head.className = "grid-head";
      head.textContent = text;
      bindingsGrid.appendChild(head);
    }
    for (const action of BINDING_ACTIONS) {
      const label = document.createElement("span");
      label.textContent = action.label;
      bindingsGrid.appendChild(label);
      for (const player of ["p1", "p2"] as const) {
        const btn = document.createElement("button");
        btn.className = "key-btn";
        btn.textContent = keyLabel(bindings[player][action.key]);
        btn.addEventListener("click", () => {
          if (listeningButton) listeningButton.classList.remove("listening");
          listeningButton = btn;
          btn.classList.add("listening");
          btn.textContent = "press key";
          const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            window.removeEventListener("keydown", onKey, true);
            btn.classList.remove("listening");
            listeningButton = null;
            if (e.code !== "Escape") {
              bindings[player][action.key] = e.code;
              saveBindings(bindings);
            }
            rebuildBindingsGrid();
          };
          window.addEventListener("keydown", onKey, true);
        });
        bindingsGrid.appendChild(btn);
      }
    }
  }

  document.getElementById("opt-keys")!.addEventListener("click", () => {
    rebuildBindingsGrid();
    setState("controls");
  });
  document.getElementById("keys-back")!.addEventListener("click", () => setState("options"));
  document.getElementById("keys-reset")!.addEventListener("click", () => {
    Object.assign(bindings.p1, defaultP1Bindings());
    Object.assign(bindings.p2, defaultP2Bindings());
    saveBindings(bindings);
    rebuildBindingsGrid();
  });

  const toolButtons: Record<string, EditorTool> = {
    "ed-tool-platform": "platform",
    "ed-tool-wall": "wall",
    "ed-tool-spawn1": "spawn1",
    "ed-tool-spawn2": "spawn2",
    "ed-tool-erase": "erase",
  };
  for (const [id, tool] of Object.entries(toolButtons)) {
    const btn = document.getElementById(id)!;
    btn.addEventListener("click", () => {
      mapEditor.setTool(tool);
      for (const otherId of Object.keys(toolButtons)) {
        document.getElementById(otherId)!.classList.toggle("active", otherId === id);
      }
    });
  }
  document.getElementById("ed-undo")!.addEventListener("click", () => mapEditor.undo());
  document.getElementById("ed-clear")!.addEventListener("click", () => {
    if (confirm("Clear all shapes on this map?")) mapEditor.clear();
  });
  document.getElementById("ed-save")!.addEventListener("click", () => {
    const current = mapEditor.getMap();
    const name = prompt("Save map as:", current.name || "My Map");
    if (!name) return;
    current.name = name;
    try {
      saveMapToStorage(current);
    } catch {
      alert("Could not save: browser storage is full. Try a smaller background image or export to JSON instead.");
      return;
    }
    mapEditor.setMap(current);
  });
  document.getElementById("ed-load")!.addEventListener("click", () => {
    const names = listSavedMaps();
    if (!names.length) {
      alert("No saved maps yet.");
      return;
    }
    const name = prompt(`Load which map?\n${names.join("\n")}`, names[0]);
    if (!name) return;
    const map = loadMapFromStorage(name);
    if (!map) {
      alert("Map not found.");
      return;
    }
    mapEditor.setMap(fitMapTo(map, VIRTUAL_W, VIRTUAL_H));
  });
  document.getElementById("ed-bg")!.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      fileToBackgroundDataUrl(file, VIRTUAL_W, VIRTUAL_H)
        .then((url) => {
          const map = mapEditor.getMap();
          map.backgroundImage = url;
          mapEditor.setMap(map);
        })
        .catch(() => alert("Could not load that image."));
    });
    input.click();
  });
  document.getElementById("ed-bg-clear")!.addEventListener("click", () => {
    const map = mapEditor.getMap();
    delete map.backgroundImage;
    mapEditor.setMap(map);
  });
  document.getElementById("ed-export")!.addEventListener("click", () => {
    const map = mapEditor.getMap();
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${map.name || "wallfu-map"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById("ed-import")!.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        try {
          const map = JSON.parse(text) as MapData;
          mapEditor.setMap(fitMapTo(map, VIRTUAL_W, VIRTUAL_H));
        } catch {
          alert("Invalid map file.");
        }
      });
    });
    input.click();
  });
  document.getElementById("ed-play")!.addEventListener("click", () => {
    startMatch(mapEditor.getMap());
    setState("fight");
  });
  document.getElementById("ed-back")!.addEventListener("click", () => setState("menu"));

  window.addEventListener("keydown", (e) => {
    if (state === "fight" && e.code === "Escape" && !matchOver) {
      setState("menu");
    } else if (matchOver && (e.code === "Enter" || e.code === "Escape")) {
      setState("menu");
    }
  });

  let accumulator = 0;
  app.ticker.add((ticker) => {
    if (state !== "fight" || matchOver) return;

    const frameDt = Math.min(ticker.deltaMS / 1000, 0.1);

    // Simulation time scale: KO plays out in dramatic slow motion, hitstop freezes.
    let simDt = frameDt;
    if (koFreezeTimer > 0) {
      koFreezeTimer -= frameDt;
      simDt = frameDt * 0.15;
      if (koFreezeTimer <= 0 && koPending) {
        if (koPending === "p1") p2Wins++;
        else p1Wins++;
        drawRoundDots(dotsLayer1, p1Wins);
        drawRoundDots(dotsLayer2, p2Wins);
        if (p1Wins >= options.roundsToWin || p2Wins >= options.roundsToWin) {
          koText.text = p1Wins > p2Wins ? "P1 WINS!" : "P2 WINS!";
          koText.visible = true;
          matchOverHint.visible = true;
          matchOver = true;
        } else {
          resetRound();
        }
      }
    } else if (hitstopTimer > 0) {
      hitstopTimer -= frameDt;
      simDt = 0;
    }

    {
      accumulator += simDt;

      while (accumulator >= FIXED_DT) {
        const intent1 = mergeIntents(player1Input.poll(), player1Gamepad.poll());
        const intent2 = aiController
          ? aiController.poll(FIXED_DT, player2, player1, currentMap)
          : mergeIntents(player2Input.poll(), player2Gamepad.poll());
        player1.update(FIXED_DT, intent1, currentMap);
        player2.update(FIXED_DT, intent2, currentMap);

        for (const ev of player1.events) handleMovementEvent(player1, ev);
        for (const ev of player2.events) handleMovementEvent(player2, ev);

        p1RunDustTimer = updateRunDust(player1, p1RunDustTimer, CYAN, FIXED_DT);
        p2RunDustTimer = updateRunDust(player2, p2RunDustTimer, MAGENTA, FIXED_DT);
        p1DashStreakTimer = updateDashStreaks(player1, p1DashStreakTimer, CYAN, FIXED_DT);
        p2DashStreakTimer = updateDashStreaks(player2, p2DashStreakTimer, MAGENTA, FIXED_DT);

        const hits = resolveCombat(player1, player2);
        for (const hit of hits) {
          const dirX = Math.sign(hit.defender.x - hit.attacker.x) || hit.attacker.facing;
          spawnHitEffect(hit.x, hit.y, hit.blocked, isHeavyKind(hit.kind), dirX, hit.kind, !hit.defender.grounded);
          hitstopTimer = Math.max(hitstopTimer, hit.hitstop);
          if (!hit.blocked) {
            if (!firstBloodDone) {
              firstBloodDone = true;
              announce("FIRST BLOOD!", 0xff3344, 1.1);
            }
            let combo: number;
            if (hit.attacker === player1) {
              combo = ++p1ComboCount;
              p1ComboTimer = COMBO_RESET_TIME;
            } else {
              combo = ++p2ComboCount;
              p2ComboTimer = COMBO_RESET_TIME;
            }
            // Combos escalate: extra ring, flash, and shake from the 4th hit on.
            if (combo >= 4) {
              shockRings.spawn(hit.x, hit.y, YELLOW, 100 + combo * 14, 0.35, 6);
              screenFlash = Math.max(screenFlash, 0.18);
              addShake(0.15);
            }
          }
        }

        if (!finishHimDone && !koPending && !matchOver) {
          const nearDeath = (player1.health > 0 && player1.health <= 18) || (player2.health > 0 && player2.health <= 18);
          if (nearDeath) {
            finishHimDone = true;
            announce("FINISH THEM!", 0xff3344, 1.3);
          }
        }

        if (player1.koed && !koPending) beginRoundEnd("p1");
        if (player2.koed && !koPending) beginRoundEnd("p2");

        accumulator -= FIXED_DT;
      }

      if (p1ComboTimer > 0) {
        p1ComboTimer -= frameDt;
        if (p1ComboTimer <= 0) {
          if (p1ComboCount >= 3) announce(`${p1ComboCount} HIT COMBO!`, CYAN, 1 + p1ComboCount * 0.05);
          p1ComboCount = 0;
        }
      }
      if (p2ComboTimer > 0) {
        p2ComboTimer -= frameDt;
        if (p2ComboTimer <= 0) {
          if (p2ComboCount >= 3) announce(`${p2ComboCount} HIT COMBO!`, MAGENTA, 1 + p2ComboCount * 0.05);
          p2ComboCount = 0;
        }
      }
    }

    updateComboText(p1ComboText, p1ComboCount);
    updateComboText(p2ComboText, p2ComboCount);

    screenFlash = Math.max(0, screenFlash - frameDt * 3.5);
    flashOverlay.alpha = screenFlash;
    updateAnnouncement(frameDt);

    player1View.update(player1, frameDt);
    player2View.update(player2, frameDt);
    particles.update(frameDt);
    shockRings.update(frameDt);

    drawHealthBar(p1BarBg, p1BarFg, player1.health, player1.maxHealth, CYAN, false);
    drawHealthBar(p2BarBg, p2BarFg, player2.health, player2.maxHealth, MAGENTA, true);

    const zoomAccel = -zoomPunch * 220 - zoomPunchVelocity * 18;
    zoomPunchVelocity += zoomAccel * frameDt;
    zoomPunch += zoomPunchVelocity * frameDt;

    const offset = shake.update(frameDt);
    const scale = 1 + zoomPunch;
    world.scale.set(scale);
    world.position.set(
      offset.x + (VIRTUAL_W / 2) * (1 - scale),
      offset.y + (VIRTUAL_H / 2) * (1 - scale),
    );
  });
}

main();
