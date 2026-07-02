# /ripple edit — execute and iterate the cut

The core loop. Everything here assumes edit.json exists (`plan` creates it).

## The three-signal endpoint rule (never skip)

A cut point is confirmed only when all three agree, via `ripple candidates
<src> --start S --end E --label <slug>`:

1. **Transcript** of the candidate range contains the final intended phrase
   and does NOT contain the next prompt/take ("next question", a re-ask).
2. **Silence** analysis shows leading silence ≈ 0 and tail silence within the
   VIDEO.md bound (default ≤1.0s). Check multiple thresholds — one threshold
   can eat soft speech.
3. **Tail frames** show no look-down, reset, or glance at notes. Read the
   strip image; don't just confirm it exists.

Start points: just before the first complete word, keeping the VIDEO.md
pre-roll (default 0.1–0.3s). End points: after the final sentence, before the
reset.

## Loop

1. For each `proposed` scene, run `candidates`, adjust bounds in edit.json,
   set `status: "locked"` and update `reasoning` with what confirmed it.
2. Render with `ripple cut edit.json --profile draft` — it renders per-scene
   clips, cards (with J-cut audio when `jcut` is set), and the full assembly
   from the manifest, HDR-aware. Iterating one scene? `--scene <slug>`
   re-renders just it. Read its `warnings` array every time.
3. After EVERY render: `ripple frame-sheet` the result and `ripple qa` it.
   Fix before showing the user.
4. Present: what changed, the scene table, and where to look. Ask for
   corrections by scene ("Q5 too long?") — corrections route to `repair`.

## Style vs. content

Effects (zooms, speed ramps, stylization) are render-profile layers on top of
the manifest, never baked into scene bounds. Per-scene clip exports stay
clean/unstyled unless the user explicitly wants styled clips. If the user
kills an effect ("remove all zooms"), the cut list survives untouched — and
log the steering decision to VIDEO.md.

## Vocabulary

When the user steers with an adjective — "tighter", "punchier", "quieter",
"let it breathe" — read `reference/adjectives.md` and follow that protocol.
Adjectives are lever sets with numbers and verification, not vibes.
