# WallFu — Wall-Projected Stick Figure Fighting Game

## 1. Concept

A 2-player stick figure fighting game meant to be projected onto a real wall
(or any flat-ish surface) rather than played on a normal monitor. Before a
match, players do a quick calibration pass so the projected image lines up
with the wall, then use a simple in-game map editor to place platforms and
walls that match real features they can see (a door frame, a shelf, a window
ledge). The fight then plays out on that custom layout.

Local multiplayer first (shared keyboard/gamepads on one device). Networked
play is an explicit non-goal for now, but the input and update loop should be
built so network play can be added later without a rewrite (see 8.3).

## 2. Core Loop

1. **Setup** — plug in the laptop, aim the projector at the wall.
2. **Calibrate** — corner-pin/keystone the projected image so it's square on
   the wall (see section 6).
3. **Design the map** — open the map editor, look at the wall, draw platforms
   and walls that match what's actually there.
4. **Fight** — best-of-N rounds, last stick figure standing wins the round.
5. Back to the map editor or rematch on the same map.

## 3. Fighting Mechanics (v1, keep it small)

- **Movement**: run left/right, jump, fast-fall, one air jump.
- **Actions**: light attack, heavy attack, block/parry, dash.
- **Health**: each character has an HP bar; heavy attacks do more damage but
  are slower and can be parried.
- **Rounds**: best of 3, first to 2 round wins takes the match.
- **Hit feedback**: hitstop (brief freeze-frame on impact) and knockback,
  no complex combo system in v1.
- **Arena constraint**: because maps are hand-drawn to match an arbitrary
  wall, platforms will be irregular (not a flat symmetrical stage). Movement
  and combat must work on uneven, asymmetric layouts — no assumptions about a
  flat floor or mirrored stage.

Out of scope for v1: special moves/combos, characters with different
movesets, items/pickups. Add later once the base loop feels good.

## 4. Art Style

- Stick figures: a handful of line segments + circle head, no sprites to
  draw or animate by hand — everything is procedural/skeletal so animation
  is just interpolating joint angles.
- Rendering: flat, thick strokes, high contrast. Projectors on a real wall
  (often not pure white, often under ambient room light) wash out subtle
  colors and thin lines, so the visual language must be bold on purpose:
  - Background: solid black or transparent-through-black so unlit wall areas
    just look like "off."
  - Characters and effects: bright saturated colors (e.g. cyan vs magenta
    for player 1/2), thick outlines.
  - Map geometry (platforms/walls players draw): a single neutral bright
    color (e.g. white) so it doesn't compete with characters.
- No textures, no gradients, no fine detail — it will not survive a wall
  projection anyway.

## 5. Effects & Feel

- Hitstop on impact (~50–100ms freeze).
- Simple particle bursts on hits/KOs (a dozen line/dot particles, no
  physics-heavy particle systems).
- Camera shake on heavy hits, kept subtle since the "camera" is a fixed
  projector.
- Target frame rate: 60fps. Projected motion reads worse than on a monitor,
  so smooth, readable motion matters more than visual complexity.

## 6. Map Editor & Projection Calibration

- **Calibration step**: before anything else, a corner-pin/keystone tool —
  drag the 4 corners of the projected rectangle until it matches the wall's
  usable area. Store this as a simple transform applied to the whole game
  render.
- **Map editor**: a minimal 2D level editor overlaid on the live projected
  view —
  - Place rectangular/line platforms and walls by click-drag.
  - Snap-to-grid optional, off by default (real walls aren't grid-aligned).
  - Save/load named maps (local file, e.g. JSON) so a good layout for a
    specific wall can be reused.
  - No decorative/background art in the editor — it's purely collision
    geometry, since the "background" is the real wall itself.
- **v2 stretch goal**: camera-based auto-mapping. A webcam (or later a depth
  camera) looks at the same wall, and edge/depth detection auto-generates
  candidate platform geometry, which the player can then nudge/confirm in
  the editor rather than drawing from scratch. This requires a camera↔
  projector calibration pass in addition to the projector↔wall one, and is
  intentionally deferred out of v1.

## 7. Controls

- Two local input methods supported from the start:
  - **Split keyboard**: e.g. WASD + F/G for player 1, arrow keys + numpad
    for player 2.
  - **Gamepads**: standard USB/Bluetooth controllers via the browser
    Gamepad API, one pad per player.
- Input is abstracted behind a per-player "intent" struct (move, jump,
  light, heavy, block, dash) so keyboard, gamepad, and — later — network or
  phone input all feed the same interface.

## 8. Tech Stack

### 8.1 v1 target: browser prototype
- **Language**: TypeScript.
- **Rendering**: Canvas2D via a lightweight game framework — **PixiJS** for
  rendering, since stick figures/particles are simple 2D draw calls and
  Pixi is lighter than a full engine like Phaser for this.
- **Physics/collision**: a small 2D physics lib (**Planck.js**, a Box2D
  port) or, given how simple the collision needs are (AABB platforms, no
  rotation), a hand-rolled AABB/segment collision system — likely simpler
  and easier to tune for fighting-game feel than a general physics engine.
  Recommend hand-rolled for v1; revisit if needs grow.
- **Input**: browser Keyboard events + Gamepad API behind the shared intent
  abstraction from section 7.
- **Calibration/warp**: CSS `transform: matrix3d` or a WebGL shader pass for
  the corner-pin warp over the whole canvas.
- **Map storage**: JSON files, loaded/saved via the File System Access API
  or simple download/upload for the prototype.

### 8.2 Later: native desktop app
- Once the browser prototype validates the mechanics and feel, port to a
  native app for reliability on a laptop hooked to a projector without a
  browser tab in the loop. Leading candidate: **Godot** (fast 2D, built-in
  input handling for keyboard+gamepad, easy fullscreen/multi-window
  projector setups, GDScript or C# if the TS logic needs porting). Decide
  at that point whether to port the TS game logic or rewrite — keeping the
  core loop (movement, combat, collision) engine-agnostic in v1 makes this
  easier either way.
- The CV-based auto-mapping stretch goal (6, v2) is more natural here too,
  since native apps get easier access to camera APIs and can use OpenCV
  directly.

### 8.3 Network play (explicit non-goal for now)
- Not built in v1. To not foreclose it: keep the simulation update on a
  fixed timestep driven purely by per-player "intent" structs (section 7),
  not raw device events. That's the one architectural choice that keeps a
  rollback-netcode-style multiplayer layer addable later without touching
  gameplay code.

## 9. Milestones

1. **M0 — Skeleton**: stick figure renders, walks/jumps on a flat floor,
   keyboard input for one player.
2. **M1 — Two players fighting**: second player (keyboard/gamepad), attacks,
   health, hitstop, round win/loss.
3. **M2 — Map editor**: draw/save/load custom platform layouts, fight on
   them instead of the flat floor.
4. **M3 — Calibration**: corner-pin warp tool, tested with an actual
   projector on a wall.
5. **M4 — Polish pass**: particles, camera shake, contrast/readability
   tuning under real projector + ambient light conditions.
6. **Stretch — Camera auto-mapping** and **native port** (see 6 and 8.2),
   tackled after M4 once the core game is proven on a real wall.

MVP cut line: M0–M3. That's a playable, wall-projected, custom-map fighting
game — everything after M3 is feel/polish or the deferred stretch goals.
