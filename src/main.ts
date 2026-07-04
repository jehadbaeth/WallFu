import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { Fighter, type FighterEvent } from "./core/Fighter";
import { resolveCombat } from "./core/Combat";
import { KeyboardIntentSource, P1_BINDINGS, P2_BINDINGS } from "./core/KeyboardInput";
import { StickFigureView } from "./render/StickFigure";
import { ParticleSystem } from "./effects/Particles";
import { CameraShake } from "./effects/CameraShake";
import { ShockRingSystem } from "./effects/ShockRing";

const CYAN = 0x2ee6ff;
const MAGENTA = 0xff2e88;
const WHITE = 0xffffff;
const YELLOW = 0xffe14d;

const FIXED_DT = 1 / 60;
const ROUNDS_TO_WIN = 2;
const KO_FREEZE_TIME = 1.4;

async function main() {
  const app = new Application();
  await app.init({
    background: "#000000",
    resizeTo: window,
    antialias: true,
  });
  document.getElementById("app")!.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const groundY = () => app.screen.height - 120;
  const worldMinX = () => 0;
  const worldMaxX = () => app.screen.width;

  const floor = new Graphics();
  world.addChild(floor);
  function drawFloor() {
    floor.clear();
    floor.moveTo(0, groundY());
    floor.lineTo(app.screen.width, groundY());
    floor.stroke({ width: 5, color: WHITE, alpha: 0.9 });
  }
  drawFloor();
  window.addEventListener("resize", () => {
    drawFloor();
    layoutUI();
  });

  const particles = new ParticleSystem();
  world.addChild(particles.view);

  const shockRings = new ShockRingSystem();
  world.addChild(shockRings.view);

  const shake = new CameraShake();
  let zoomPunch = 0;
  let zoomPunchVelocity = 0;

  function startX1() {
    return app.screen.width * 0.3;
  }
  function startX2() {
    return app.screen.width * 0.7;
  }

  const player1 = new Fighter(startX1(), groundY());
  const player2 = new Fighter(startX2(), groundY());
  player1.facing = 1;
  player2.facing = -1;

  const player1Input = new KeyboardIntentSource(P1_BINDINGS);
  const player2Input = new KeyboardIntentSource(P2_BINDINGS);

  const player1View = new StickFigureView(CYAN);
  const player2View = new StickFigureView(MAGENTA);
  world.addChild(player1View.view);
  world.addChild(player2View.view);

  // --- UI: health bars, round dots, KO banner ---
  const uiLayer = new Container();
  app.stage.addChild(uiLayer);

  const BAR_W = 360;
  const BAR_H = 26;

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
    fontSize: 72,
    fontWeight: "900",
    fill: WHITE,
    letterSpacing: 4,
  });
  const koText = new Text({ text: "K.O.", style: koStyle });
  koText.anchor.set(0.5);
  koText.visible = false;
  uiLayer.addChild(koText);

  const flashOverlay = new Graphics();
  uiLayer.addChild(flashOverlay);
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

  const controlsStyle = new TextStyle({
    fontFamily: "monospace",
    fontSize: 15,
    fontWeight: "700",
    fill: WHITE,
    letterSpacing: 0.5,
  });
  const p1Controls = new Text({
    text: "P1  A/D Move  W Jump  S Fast-Fall  F Light  G Heavy  H Block  J Dash",
    style: controlsStyle,
  });
  const p2Controls = new Text({
    text: "P2  ←/→ Move  ↑ Jump  ↓ Fast-Fall  Num1 Light  Num2 Heavy  Num3 Block  Num4 Dash",
    style: controlsStyle,
  });
  p1Controls.anchor.set(0, 1);
  p2Controls.anchor.set(1, 1);
  p1Controls.alpha = 0.65;
  p2Controls.alpha = 0.65;
  uiLayer.addChild(p1Controls, p2Controls);

  function layoutUI() {
    p1BarBg.position.set(40, 30);
    p1BarFg.position.set(40, 30);
    p2BarBg.position.set(app.screen.width - 40 - BAR_W, 30);
    p2BarFg.position.set(app.screen.width - 40 - BAR_W, 30);
    dotsLayer1.position.set(40, 64);
    dotsLayer2.position.set(app.screen.width - 40 - BAR_W, 64);
    koText.position.set(app.screen.width / 2, app.screen.height / 2 - 80);
    p1ComboText.position.set(40, 130);
    p2ComboText.position.set(app.screen.width - 40, 130);
    p1Controls.position.set(24, app.screen.height - 16);
    p2Controls.position.set(app.screen.width - 24, app.screen.height - 16);
    flashOverlay.clear();
    flashOverlay.rect(0, 0, app.screen.width, app.screen.height);
    flashOverlay.fill({ color: WHITE, alpha: 1 });
  }
  layoutUI();
  flashOverlay.alpha = 0;

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
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
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
      if (t > 0.5) shake.add(0.25 * t);
    } else if (ev.type === "jump" || ev.type === "airJump") {
      particles.dustPuff(fighter.x, fighter.y, color, 8);
    } else if (ev.type === "dash") {
      particles.burst(fighter.x, fighter.y, color, 14, { speed: 220, spread: Math.PI * 0.6, gravity: 100, size: 3, glow: true });
      particles.streakBurst(fighter.x, fighter.y - 40, color, 8, {
        angle: fighter.facing > 0 ? Math.PI : 0,
        speed: 620,
        spread: 0.7,
        size: 5,
      });
      shake.add(0.1);
    } else if (ev.type === "attackActive") {
      const heavy = ev.kind === "heavy";
      const reach = heavy ? 68 : 58;
      const height = heavy ? 82 : 70;
      const originX = fighter.x + fighter.facing * (18 + reach * 0.6);
      const originY = fighter.y - height * 0.6;
      particles.burst(originX, originY, color, heavy ? 14 : 8, {
        speed: heavy ? 80 : 50,
        spread: 0.6,
        gravity: 0,
        size: heavy ? 6 : 4,
        glow: true,
      });
    }
  }

  function spawnHitEffect(x: number, y: number, blocked: boolean, heavy: boolean) {
    if (blocked) {
      particles.burst(x, y, WHITE, heavy ? 14 : 8, { speed: 320, spread: Math.PI * 1.2, gravity: 200, size: 4, glow: true });
      shockRings.spawn(x, y, WHITE, heavy ? 70 : 45, 0.22, 4);
      shake.add(heavy ? 0.18 : 0.08);
    } else {
      particles.burst(x, y, YELLOW, heavy ? 30 : 18, { speed: heavy ? 560 : 400, spread: Math.PI * 1.6, gravity: 500, size: heavy ? 7 : 5, glow: true });
      particles.burst(x, y, WHITE, heavy ? 10 : 6, { speed: 220, spread: Math.PI * 2, gravity: 300, size: 3, glow: true });
      shockRings.spawn(x, y, heavy ? YELLOW : WHITE, heavy ? 130 : 70, heavy ? 0.4 : 0.24, heavy ? 8 : 5);
      shake.add(heavy ? 0.55 : 0.3);
      if (heavy) {
        screenFlash = 0.35;
        zoomPunch = 0.06;
        zoomPunchVelocity = 0;
      }
    }
  }

  function beginRoundEnd(loser: "p1" | "p2") {
    koPending = loser;
    koFreezeTimer = KO_FREEZE_TIME;
    koText.visible = true;
    shake.add(0.4);
    zoomPunch = 0.12;
    zoomPunchVelocity = 0;
    const victim = loser === "p1" ? player1 : player2;
    shockRings.spawn(victim.x, victim.y - 60, WHITE, 180, 0.5, 10);
  }

  function resetRound() {
    player1.reset(startX1(), groundY());
    player2.reset(startX2(), groundY());
    player1.facing = 1;
    player2.facing = -1;
    koText.visible = false;
    koPending = null;
    p1ComboCount = 0;
    p1ComboTimer = 0;
    p2ComboCount = 0;
    p2ComboTimer = 0;
  }

  function updateComboText(text: Text, count: number) {
    text.text = count >= 2 ? `${count} HITS` : "";
  }

  let accumulator = 0;
  app.ticker.add((ticker) => {
    const frameDt = Math.min(ticker.deltaMS / 1000, 0.1);

    if (koFreezeTimer > 0) {
      koFreezeTimer -= frameDt;
      if (koFreezeTimer <= 0 && koPending) {
        if (koPending === "p1") p2Wins++;
        else p1Wins++;
        drawRoundDots(dotsLayer1, p1Wins);
        drawRoundDots(dotsLayer2, p2Wins);
        resetRound();
      }
    } else if (hitstopTimer > 0) {
      hitstopTimer -= frameDt;
    } else {
      accumulator += frameDt;

      while (accumulator >= FIXED_DT) {
        const intent1 = player1Input.poll();
        const intent2 = player2Input.poll();
        player1.update(FIXED_DT, intent1, groundY(), worldMinX(), worldMaxX());
        player2.update(FIXED_DT, intent2, groundY(), worldMinX(), worldMaxX());

        for (const ev of player1.events) handleMovementEvent(player1, ev);
        for (const ev of player2.events) handleMovementEvent(player2, ev);

        p1RunDustTimer = updateRunDust(player1, p1RunDustTimer, CYAN, FIXED_DT);
        p2RunDustTimer = updateRunDust(player2, p2RunDustTimer, MAGENTA, FIXED_DT);
        p1DashStreakTimer = updateDashStreaks(player1, p1DashStreakTimer, CYAN, FIXED_DT);
        p2DashStreakTimer = updateDashStreaks(player2, p2DashStreakTimer, MAGENTA, FIXED_DT);

        const hits = resolveCombat(player1, player2);
        for (const hit of hits) {
          spawnHitEffect(hit.x, hit.y, hit.blocked, hit.kind === "heavy");
          hitstopTimer = Math.max(hitstopTimer, hit.hitstop);
          if (!hit.blocked) {
            if (hit.attacker === player1) {
              p1ComboCount++;
              p1ComboTimer = COMBO_RESET_TIME;
            } else {
              p2ComboCount++;
              p2ComboTimer = COMBO_RESET_TIME;
            }
          }
        }

        if (player1.koed && !koPending) beginRoundEnd("p1");
        if (player2.koed && !koPending) beginRoundEnd("p2");

        accumulator -= FIXED_DT;
      }

      if (p1ComboTimer > 0) {
        p1ComboTimer -= frameDt;
        if (p1ComboTimer <= 0) p1ComboCount = 0;
      }
      if (p2ComboTimer > 0) {
        p2ComboTimer -= frameDt;
        if (p2ComboTimer <= 0) p2ComboCount = 0;
      }
    }

    updateComboText(p1ComboText, p1ComboCount);
    updateComboText(p2ComboText, p2ComboCount);

    screenFlash = Math.max(0, screenFlash - frameDt * 3.5);
    flashOverlay.alpha = screenFlash;

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
      offset.x + (app.screen.width / 2) * (1 - scale),
      offset.y + (app.screen.height / 2) * (1 - scale),
    );
  });
}

main();
