# /ripple plan — from raw sources to a first edit.json

Goal: structured edit data before any rendering. Do not cut anything yet.

If `av-script.md` (or a script) exists from `/ripple develop`, seed edit.json
from it: one scene per AV row, same slug, `title` from the visual column,
`reasoning` = "from av-script row N" until real bounds replace estimates.

## Steps

1. **Inventory sources.** `ripple sources` is the bins panel: every media
   file under the project (any extension case) with duration, codec, HDR
   flags, and whether the perception index has seen it. `ripple probe`
   anything that needs a closer look — streams, resolution, exact color
   metadata. Record the color policy implication.
2. **Analyze everything.** `ripple analyze <src>` per source builds the
   perception index — word-level timing, silence/speech maps, sentences with
   pace, fillers, non-speech events (laughs/claps), motion, scene changes —
   cached, so candidates and timeline-sheet are instant afterwards. Pass
   `--prompt` with proper nouns you expect (names, places, product terms) —
   it materially improves whisper accuracy. `ripple transcribe <src>` still
   gives the readable transcript (subtitles first, whisper fallback); read
   `reference/perception.md` for how to use the index.
3. **Group takes.** Multiple takes of the same content cluster by transcript
   similarity. Heuristics (verify, don't assume): later takes are usually
   better; fewer filler words is better; a complete final sentence beats a
   trailing reset. Record candidate takes per scene.
4. **Draft edit.json** (schema: `schemas/edit.schema.json` in the plugin).
   For each scene: id, slug, source, proposed start/end from transcript
   timestamps, chosen take, and **reasoning** — one line on why this take and
   these bounds. Mark every scene `status: "proposed"`. Then `ripple lint
   edit.json`: the same rules `candidates` flags one range at a time, applied
   to every scene from the cached index (registry: `reference/rules.md`). On
   proposed bounds its findings are the worklist `edit` will clear, not
   blockers — and a plugin hook re-runs the check on every manifest write,
   so they stay visible as the draft evolves.
5. **Look at what you plan to use.** Start with `ripple timeline-sheet <src>`
   — the whole source on one time axis: waveform bursts between silence are
   the take structure, green ticks are sentence ends, the motion strip shows
   resets; zoom with `--around T --span 12` on each chosen range. Then
   `ripple frame-sheet <src> --scenes` for picture-change sampling, and
   `frame-sheet --start X --end Y` to check framing and that the person is
   mid-take, not resetting.
6. **Present the plan.** Scene table (slug, take, in/out, duration, reasoning)
   plus the color policy and any risks (HDR, missing drawtext, noisy audio).
   Get user confirmation before moving to `edit`.

## Project layout to create

```
work/          transcripts, candidate audio, intermediate files
clips/         per-scene exports
outputs/       final renders
qa/            frame sheets, contact strips, QA snapshots
edit.json      the manifest (project root)
```
