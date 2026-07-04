# Release Plan

Versioning follows the milestones in PLAN.md section 9, not semver features.
Each milestone becomes a tagged pre-1.0 release once it's played and confirmed
working by hands-on testing (not just type-checking green).

| Version | Milestone | Status |
|---------|-----------|--------|
| v0.1.0  | M0 — Skeleton (single player walk/jump) | done, unreleased |
| v0.2.0  | M1 — Two players fighting (attacks, health, hitstop, rounds) | implemented, pending playtest |
| v0.3.0  | M2 — Map editor (draw/save/load platform layouts) | not started |
| v0.4.0  | M3 — Calibration (corner-pin warp on a real projector) | not started |
| v0.5.0  | M4 — Polish pass (particles, shake, contrast under projector light) | not started |
| v1.0.0  | MVP cut line reached (M0–M3 solid) | not started |

## Process

1. A milestone is "release-ready" only after it's been played on the actual
   input devices (keyboard/gamepad) and, from M3 onward, on a real projector
   against a real wall — not just verified in a browser tab.
2. Tag the commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. GitHub Actions builds the tag and attaches the static `dist/` bundle as a
   release asset, and (if Pages is enabled) that tag's build is also what's
   live on Pages via the existing `deploy.yml` on `main`.
4. Keep a short changelog entry per tag in GitHub Releases — what changed,
   what's still rough, what to test next.

## Notes

- No native app releases yet (see PLAN.md 8.2) — that's a separate release
  track once the browser prototype clears the M0–M3 MVP cut line.
- Pre-1.0, breaking changes to controls/mechanics are expected between every
  version; don't over-invest in migration/back-compat.
