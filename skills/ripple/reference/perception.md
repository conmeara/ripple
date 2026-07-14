# Perception — how you see and hear the footage

You cannot watch video or hear audio. A human editor reads picture, waveform,
and words on one time axis and makes timing calls to the frame. Ripple closes
that gap with three layers: an **index** (deterministic measurements, computed
once), a **sheet** (the editor's timeline view, as an image you read), and
**numbers** (fused timing fields that turn cut placement into arithmetic).
Decide with the numbers; confirm with your eyes on the sheet.

## Layer 1 — `ripple analyze <src>`: the index

Run once per source (plan does this); everything downstream slices its cached
JSON. ~1 min for a 13-min 4K source, then free. It contains:

- `words` — word-level timings, **fused with the silence map** (whisper alone
  stretches word ends across trailing silence and smears resumed speech
  backwards into pauses; the index corrects both)
- `silences` (3 thresholds) and `speech` spans
- `sentences` — bounds, text, and `wps` (words/sec): slow, weighted delivery
  earns a longer tail; rushed delivery cuts tighter
- `fillers` — um/uh + word restarts, with exact removable spans ("tighter")
- `nonSpeech` — audible-but-wordless spans: laughs, claps, music stings.
  These are reaction beats — prime cut-away and hold material you cannot
  hear any other way
- `sceneChanges` + `motion` — luma-diff curve: cuts, resets, gestures,
  fidgeting vs stillness
- `rms` — energy envelope (delivery intensity over time)

Don't `cat` the index (it's thousands of entries); slice it with jq or view
it through the sheet.

## Layer 2 — `ripple timeline-sheet`: look like an editor

One image, shared time axis: ruler / thumbnails / motion strip / waveform
with shading / word-aligned transcript, plus orange cut markers.

- **Red shading** = silence. **Amber** = audible but wordless (a laugh, a
  clap — check it before cutting through it). **Green ticks** (overview) =
  sentence ends, the legal OUT lattice. **White blips** in the motion strip =
  movement; black = stillness.
- Protocol: overview first (`--manifest edit.json` draws every scene bound),
  then zoom `--around <t> --span 12` (or `--scene <slug>`) before locking
  anything. A cut line touching the next waveform burst is a leak you can
  see.
- The sheet distinguishes what frames alone cannot: "pausing while looking
  down" and "quietly reading the next question" look identical in
  thumbnails — only the waveform tells them apart.
- Word ticks just after a long pause carry fuzzy timestamps (whisper clumps
  them). For timing, trust silence edges and the `timing` numbers; the
  transcript lane is for *what*, the waveform is for *when*.

## Layer 3 — the numbers: cut placement is arithmetic

`ripple candidates --start S --end E` fuses everything and returns:

| Field | Meaning |
|---|---|
| `timing.lastWordEnd` | acoustic end of the last word inside the range |
| `timing.tailGap` | dead air you'd ship: `end − lastWordEnd` |
| `timing.nextWordStart` / `timing.nextText` | what starts after the content — verify it's the next prompt, not more answer |
| `timing.nextAudioStart` | when sound actually resumes (breath, laugh, speech) |
| `timing.leadGap` / `timing.firstWordStart` | head-side equivalents |
| `suggestedOut` | `lastWordEnd + tail preference`, capped before next speech; null when no clean gap exists |

**The endpoint law: OUT = lastWordEnd + tail preference (VIDEO.md, default
≤1.0s).** Holding longer for a smile or a laugh is a taste call you're
allowed to make — but it's a decision: write the reason into the scene's
`reasoning`, and it must survive the sheet check.

`flags` are categorical red flags, each one a failure that shipped in a real
session: `SPEECH_AT_OUT` (tail silence 0 = someone is talking at your cut),
`NEXT_SPEECH_INSIDE` (the next prompt leaked in), `MID_WORD_OUT`/`MID_WORD_IN`
(cut lands inside a word), `DEAD_AIR_TAIL`, `LATE_FIRST_WORD`. **A scene does
not lock while flags stand** — resolve them or override each with a written
reason. When the OUT is scoped to the wrong sentence, `suggestedOut` is null
on purpose: re-scope using the index's `sentences`, don't nudge.

## When signals disagree

- Word timestamps vs silence edges → **silence edges win** for timing.
- Transcript text vs silence → **transcript wins** for content ("is the
  phrase there"), silence wins for "when".
- Frames vs waveform → frames can't hear; the waveform can't read a
  look-down. You need both; that's why the sheet exists.
- Zero tail silence is never a pass. It means the range ends mid-speech.

## Creative discovery (better than scrubbing)

- Reaction cuts: sort `nonSpeech` by duration — every laugh/clap is a
  timestamped candidate for a hold or an L-cut.
- Best-take feel: compare `sentences[].wps` and the rms envelope across
  takes — flat + fast reads rushed; ranged + slower reads alive.
- Cut on action: zoom the sheet where the motion strip lights up; cut into
  movement, not out of it.
- "Tighter": `fillers` lists exact removable spans; check the sheet that
  removal doesn't jump-cut.

## Not built yet (don't fake these)

Pitch contour (terminal fall = thought complete), breath detection, music
beat grids, jump-cut severity scoring, eye-region crop strips, learned VAD
(Silero), speaker-turn diarization. If an edit truly needs one, say so and
degrade gracefully — never eyeball a number these would have measured.
