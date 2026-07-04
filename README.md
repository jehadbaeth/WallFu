# WallFu

**A stick figure fighting game built for video mapping.** Project it onto a real wall, trace the actual shelves, door frames, and picture frames into the game as invisible platforms, and watch two glowing stick figures brawl across your furniture as if they lived there.

**Play it now:** https://jehadbaeth.github.io/WallFu/

WallFu also works as a normal browser fighting game on any screen, but the projector is the point: in projection mode the game renders nothing but the fighters, their effects, and the match UI. Everything else stays black, and a projector cannot project black, so the wall itself becomes the arena.

---

## The idea

A projector adds light to a surface; it can never darken it. That means every pure black pixel is simply *absent* on the wall. WallFu exploits this:

1. You aim a projector at a wall that has real stuff on it: a bookshelf, a couch, a door frame, hanging frames.
2. In the built-in map editor (projected onto that same wall), you drag rectangles directly over the real objects. What you trace becomes solid collision geometry.
3. You switch on **Projection mode** and fight. The geometry turns invisible, but it still collides, so the fighters stand on the real shelf, wall-jump off the real door frame, and get slammed into the real couch.

To anyone watching, two stick figures are fighting on your furniture.

## Features

- **MK3-style combat**: high punch, low punch, high kick, low kick, each with distinct speed, damage, reach, and hitbox height. Down+punch uppercut launcher, aerial punches and kicks, dive kicks, dash attacks, blocking, dashing, double jumps.
- **Martial-arts animation**: attacks chamber during startup and snap to full extension, head-height roundhouse kicks, Mortal Kombat style diagonal jump kicks, squash-and-stretch, dash afterimages.
- **Movement tech**: wall-slide, wall-jump, and wall-bounce (heavy knockback into a wall reflects you off it), fast-falls, hit-confirm combo chaining.
- **Wall-aware maps**: one-way platforms and solid walls, drawn in a built-in editor with save/load, JSON export/import, and optional background images.
- **VS AI**: fight the computer at three difficulty levels with distinct reaction time, aggression, block rate, and mistake rate.
- **Full presentation**: real impact sounds and an arcade announcer ("round one... FIGHT!", combo counts, "flawless victory"), particles, shockwaves, screen shake, hit-stop, KO slow motion, combo callouts.
- **Input**: two players on one keyboard (fully rebindable in Options), plus standard gamepads (first pad is Player 1, second is Player 2).
- **Runs anywhere**: fixed 1920x1080 virtual playfield letterboxed onto any display: monitor, TV, phone, or projector.

## Controls (defaults, rebindable in Options → Configure Keys)

| Action | Player 1 | Player 2 | Gamepad |
|---|---|---|---|
| Move | A / D | ← / → | Stick / D-pad |
| Jump | W | ↑ | Stick or D-pad up |
| Down / fast-fall | S | ↓ | Stick / D-pad down |
| High punch | F | Num4 | Y / Triangle |
| Low punch | V | Num1 | X / Square |
| High kick | G | Num5 | B / Circle |
| Low kick | B | Num2 | A / Cross |
| Block | H | Num6 | Right bumper |
| Dash | J | Num3 | Left bumper |

Special moves: down+punch = uppercut launcher, air down+kick = dive kick, attack during a dash = dash attack, jump while touching a wall = wall jump.

## Running it

- **Just play**: open https://jehadbaeth.github.io/WallFu/ in a modern browser.
- **Local development**:

  ```bash
  npm install
  npm run dev
  ```

  The dev server listens on all network interfaces, so other devices on your LAN (the machine driving the projector, a TV browser, a phone) can open the printed `Network:` URL directly.

- **Production build**: `npm run build` outputs a static site in `dist/`. Every push to `main` also deploys to GitHub Pages via Actions.

Stack: TypeScript, Vite, and PixiJS 8. No backend, no accounts; maps and settings persist in the browser's localStorage.

## Video mapping guide

This is the workflow WallFu was designed around. You need a projector, a laptop or mini PC with a browser, and a wall with some physical features worth fighting on.

### 1. Set up the projector

- Place the projector so the image covers the part of the wall you want as the arena, ideally including a few objects with clean horizontal edges (shelf tops, door frames, mantels). Horizontal edges make great platforms.
- Square the image: get the projector as perpendicular to the wall as you can *first*, and only then use keystone correction to fix what's left. Keystone is digital warping and costs sharpness, so the less you need, the better.
- **Do all of this before calibrating, then never touch the projector again.** Any physical nudge or keystone change after calibration breaks the alignment between the game's invisible platforms and the real objects.

### 2. Calibrate with the map editor

1. Open the game fullscreen on the projector output (Options → Toggle Fullscreen).
2. Go to **Map Editor**. The editor canvas is now projected onto your wall.
3. Trace reality: drag **Platform** rectangles along the top edges of shelves and frames (platforms are one-way; fighters can jump up through them and land on top), and **Wall** rectangles over solid objects like door frames or the sides of a bookcase (walls block from every side and enable wall-jumps and wall-bounces).
4. Place the two spawn points somewhere sensible, like the floor line or a wide shelf.
5. **Save** the map. Use **Play This Map** to test it immediately.

### 3. Fight

Switch **Options → Projection mode → On**. The traced geometry and any background image stop rendering; only the fighters, effects, health bars, and announcer text emit light. Start a match. The illusion holds because the invisible colliders occupy exactly the pixels you traced.

Tips:

- Dim the room. The darker the room, the more the fighters glow and the less the projector's residual black-level haze shows.
- Objects with light, matte surfaces read best when a fighter overlaps them; glossy or very dark surfaces swallow the projected light.
- A background image (editor → Background) is for screen play; leave it off for projection.
- The blast zone is below the arena bottom, so leave some floor in frame for knockouts to feel right.

### What kind of projector works (no brands, just specs)

- **Contrast over brightness, if you must choose.** The whole trick depends on black meaning "no light." Projectors with poor native contrast cast a visible gray rectangle in a dark room, which spoils the illusion. High native contrast (or a dynamic iris/laser dimming feature) keeps the "empty" areas truly invisible.
- **Brightness (lumens)**: in a genuinely dark room, even a modest home projector (roughly 1,000 to 2,000 ANSI lumens) is plenty and gives the best blacks. If the room has ambient light you cannot control, you need considerably more brightness, and you sacrifice some of the black-level magic.
- **Throw distance**: a short-throw or ultra-short-throw model is a real quality-of-life win. The projector sits close to the wall, so people walking past or playing in the room do not cast shadows through the arena.
- **Resolution**: 1080p is the sweet spot. The game renders a fixed 1920x1080 playfield, so a 1080p projector maps it one to one. Higher resolutions add nothing here; 720p works but stick figures get soft.
- **Input lag**: this is a fighting game. If the projector has a game or low-latency mode, turn it on. Frame-interpolation and heavy image "enhancement" modes add lag; turn them off.
- **Keystone and lens shift**: optical lens shift beats digital keystone because it does not resample the image. If your placement is flexible, prefer moving the projector over correcting digitally.
- **Fan noise and placement**: the projector will run for whole game nights. Something quiet, mounted or shelved out of the players' sightline, keeps the setup livable.

A note on expectations: WallFu currently assumes the projected image is a straight-on rectangle and relies on the projector's own keystone for geometry correction. In-game corner-pin warping for heavily off-axis setups is a possible future feature.

## Map editor reference

- **Platform**: one-way. Land on top, jump through from below.
- **Wall**: solid on all sides. Enables wall-slide, wall-jump, wall-bounce.
- **P1/P2 Spawn**: starting positions each round.
- **Erase / Undo / Clear**: shape management.
- **Background / Clear BG**: attach an image behind the arena (downscaled and stored with the map; intended for screen play, not projection).
- **Save / Load**: named maps in browser storage. **Export / Import JSON**: share maps as files.

## Credits

All sound effects and announcer voice lines are by [Kenney](https://kenney.nl), released under CC0 1.0 (public domain). Details in [`public/sfx/CREDITS.md`](public/sfx/CREDITS.md). Everything else (code, design, art) lives in this repository.
