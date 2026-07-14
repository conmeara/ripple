# /ripple edit — execute and iterate the cut

The core loop. Everything here assumes edit.json exists (`plan` creates it).

## The three-signal endpoint rule (never skip)

A cut point is confirmed by numbers, sound, and sight together, via `ripple
candidates <src> --start S --end E --label <slug>` (read
`reference/perception.md` for the full signal guide):

1. **Numbers.** The endpoint law: `OUT = timing.lastWordEnd + tail preference`
   (VIDEO.md, default ≤1.0s) — verify `tailGap` against it, and verify
   `timing.nextText` is the next prompt/take, not more of the answer.
   **No scene locks while `flags` is non-empty**: every flag is either
   resolved or overridden with a written reason in the scene's `reasoning`.
   `suggestedOut` is the mechanical answer; taste may hold longer (a smile,
   a laugh) — as a recorded decision, never a shrug.
2. **Silence** at multiple thresholds — one threshold can eat soft speech.
   Tail silence 0 is a red flag, not a pass: someone is speaking at the cut.
3. **Sight.** READ the head/tail cut-card sheets (`sheets.in`/`sheets.out`)
   and frame strips: the OUT line must sit in shaded silence, not touching
   the next waveform burst, and the frames show no look-down, reset, or
   glance at notes.

Start points: just before the first complete word (`firstWordStart`), keeping
the VIDEO.md pre-roll (default 0.1–0.3s). End points: after the final
sentence, before the reset.

## Loop

1. For each `proposed` scene, run `candidates`, adjust bounds in edit.json,
   set `status: "locked"` and update `reasoning` with what confirmed it.
2. Before rendering, `ripple lint edit.json` — the endpoint rules
   `candidates` applies to one range, re-judged across the whole manifest
   from cached perception (milliseconds; a plugin hook runs the same check
   on every manifest write). It exists because a scene re-scoped by hand
   after candidates ran kept shipping fresh flags nobody re-checked. Exit 1
   means an unwaived block finding stands: re-scope, or waive with a written
   reason (`scenes[].waivers`, or VIDEO.md front-matter for project-wide —
   see `reference/rules.md`).
3. Render with `ripple cut edit.json --profile draft` — it renders per-scene
   clips, cards (with J-cut audio when `jcut` is set), and the full assembly
   from the manifest, HDR-aware. Iterating one scene? `--scene <slug>`
   re-renders just it. Read its `warnings` array every time.
4. After every render: qa it and look at it. Fix before showing the user.
5. Present: what changed, the scene table, and where to look. Ask for
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
Those four are promoted to first-class invocations (`/ripple tighter
[scene]` and friends); any other adjective earns its levers through the same
file's generic protocol. Adjectives are lever sets with numbers and
verification, not vibes.
