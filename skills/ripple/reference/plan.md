# /ripple plan — from raw sources to a first edit.json

Goal: structured edit data before any rendering. Do not cut anything yet.

## Steps

1. **Inventory sources.** Find video/audio files (don't forget .MOV/.MP4 case
   variants). `ripple probe` each unique source — note duration, resolution,
   codec, and especially HDR flags. Record the color policy implication.
2. **Transcribe everything.** `ripple transcribe <src>` per source — it uses
   existing subtitles (sidecar .srt/.vtt or embedded streams) when present,
   whisper otherwise. Pass `--prompt` with proper nouns you expect (names,
   places, product terms) — it materially improves whisper accuracy. When you
   need word-level timing (overlays, precise cut points), force `--whisper`;
   subtitle-derived transcripts have no word JSON.
3. **Group takes.** Multiple takes of the same content cluster by transcript
   similarity. Heuristics (verify, don't assume): later takes are usually
   better; fewer filler words is better; a complete final sentence beats a
   trailing reset. Record candidate takes per scene.
4. **Draft edit.json** (schema: `schemas/edit.schema.json` in the plugin).
   For each scene: id, slug, source, proposed start/end from transcript
   timestamps, chosen take, and **reasoning** — one line on why this take and
   these bounds. Mark every scene `status: "proposed"`.
5. **Look at what you plan to use.** Start with `ripple frame-sheet <src>
   --scenes` — it samples where the picture actually changes and maps each
   tile to a timestamp. In mostly-static footage, scene-change tiles are
   usually resets, look-downs, and take boundaries: cross-reference those
   timestamps with the transcript to segment takes. Then sheet each chosen
   range (`--start X --end Y`) to check framing and that the person is
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
