# Perception — how you see and hear the footage

You cannot watch video or hear audio. A human editor reads picture, waveform,
and words on one time axis and makes timing calls to the frame. Ripple closes
that gap with three layers: an **index** (deterministic measurements, computed
once), a **sheet** (the editor's timeline view, as an image you read), and
**numbers** (fused timing fields that turn cut placement into arithmetic).
Decide with the numbers; confirm with your eyes on the sheet.

## Layer 1 — `ripple analyze <src>`: the index

Run once per source (the develop playbook does this); everything downstream slices its cached
JSON. ~1 min for a 13-min 4K source, then free. The cache is keyed on the
file's CONTENT, not its path — footage moved to another folder keeps its
index; renaming or re-exporting the file rebuilds it. It contains:

- `words` — word-level timings, **fused with the silence map** (whisper alone
  stretches word ends across trailing silence and smears resumed speech
  backwards into pauses; the index corrects both). Words whisper fabricated
  over silence or music carry `suspect: true` (`suspectReason`:
  `in-silence` — the whole word sits inside measured silence with no RMS
  energy; `over-music` — an isolated island in continuous audio with no word
  neighbors). Suspect words are visible-but-ignored everywhere: every timing
  number, `search`, and `captions` filter them (captions reports
  `suspectWordsExcluded`), and the sheets draw them dimmed. **Never anchor a
  cut to one.**
- `silences` (3 thresholds) and `speech` spans
- `sentences` — bounds, text, `wps` (words/sec: slow, weighted delivery
  earns a longer tail), and **prosody**: `terminalPitch`
  (falling/level/rising/unknown), slope in semitones/sec, `voicedRatio`.
  Falling = the thought sounds complete — the strongest "safe OUT" cue
  after the words. Trust it only when `voicedRatio ≥ 0.25`, expect
  sentence-final vocal fry to bias falling→level, and NEVER use it as a
  question detector (wh-questions fall in American English)
- `fillers` — um/uh + word restarts, with exact removable spans ("tighter")
- `nonSpeech` — audible-but-wordless spans: laughs, claps, music stings.
  These are reaction beats — prime cut-away and hold material you cannot
  hear any other way
- `breaths` — inhales in word gaps (level + duration). A sharp inhale right
  after the "last" word means the speaker is about to continue. Precision-
  first and capture-chain-bound: close-mic audio yields many, processed or
  distant-mic audio near zero — absence proves nothing
- `turns` — speaker-turn markers (optional: needs the tinydiarize model,
  `ripple doctor` has the download). Detects conversational hand-offs
  (podcasts, two-mic chats); quiet off-camera interviewers usually produce
  ZERO turns — find those instead as short question-shaped sentences
  bounded by long silences. `snappedT` places each turn in its silence gap
- `sceneChanges` + `motion` — luma-diff curve: cuts, resets, gestures,
  fidgeting vs stillness
- `rms` — energy envelope (delivery intensity over time)
- `drift` — the index's self-check on its own word timing. Whisper's
  utterance-final timestamps stretch past the measured end of speech on
  long sources (block-aligned, seconds late — the numbers the endpoint law
  consumes). The envelope warns with `drift.suspected: true`; the warning
  is advisory — the authoritative per-range arbiter is `candidates`'
  `driftCheck` below. A drift warning never means "re-derive timing by
  hand"; it means "no OUT locks from this index without its driftCheck"

For music, `ripple beats <audio>` builds the beat grid: `bpm`, beat times,
and a confidence gate that auto-reports "no grid" on speech. When
`manifest.music` is set, `ripple cut` reports every visual boundary's
offset from the grid (`music.beatCheck`) — cutting on the beat is a style
choice; knowing you're 140ms off is perception.

Don't `cat` the index (it's thousands of entries). Read it through its two
channels instead: the sheets for the picture side (`ripple timeline-sheet`,
Layer 2) and the fused numbers for the timing side — `ripple candidates` for a
single range, and `ripple lint` for per-scene endpoint verdicts across the whole
cut (it renders them unconditionally). Both are pure cache reads: instant, no
ffmpeg, no whisper, safe to call as often as the reasoning needs. The
timeline-sheet overview collapses the source into sentence ends, silences, and
reaction beats; zoom (`--around T --span 12`) gives word-level detail with
`fuzzy: true` marking post-pause timestamps, and `--manifest edit.json` draws
every scene bound. Every duration arrives pre-computed — reason with the printed
numbers, never subtract timestamps yourself. jq over the cached JSON stays for
exotic queries the sheets and gates don't answer.

## Layer 2 — `ripple timeline-sheet`: look like an editor

One image, shared time axis: ruler / thumbnails / motion strip / waveform
with shading / word-aligned transcript, plus orange cut markers.

- **Red shading** = silence. **Amber** = audible but wordless (a laugh, a
  clap — check it before cutting through it). **Green ticks** (overview) =
  sentence ends, the legal OUT lattice. **White blips** in the motion strip =
  movement; black = stillness. **Dim-gray `?`-prefixed words** in the
  transcript lane = suspect (whisper fabrications over silence/music; the
  envelope lists them as `suspectWords`) — kept visible so the lane never
  silently edits itself, ignored by every timing number.
- Protocol: overview first (`--manifest edit.json` draws every scene bound),
  then zoom `--around <t> --span 12` (or `--scene <slug>`) before locking
  anything. A cut line touching the next waveform burst is a leak you can
  see.
- In zoom mode every second is labeled on the ruler and long silences carry
  their duration and edge times printed on them — the image and the JSON
  share one coordinate system (absolute seconds). Comparing alternatives?
  `--marks "A:493.5,B:494.2"` draws lettered anchor chips; refer to A/B in
  your reasoning and the numbers stay grounded.
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
| `timing.terminalPitch` | melody of the ending sentence: falling = thought complete |
| `timing.breathAfterLastWord` | a sharp inhale after the last word — the speaker is about to continue |
| `suggestedOut` | `lastWordEnd + tail preference`, capped before next speech; null when no clean gap exists. Drawn as the dashed "S" anchor on the out card when it differs from your `--end` by >0.15s — no "S" chip means you're already on the suggestion (or there is none; the number tells you which) |
| `driftCheck` | the index vs an isolated re-transcription of this exact range. The chunked index prevents cumulative drift, so `verdict: "drifted"` (Δ > 1.25s) means two measurements disagree — usually the isolated pass smearing into a near-silent tail, occasionally a real index miss. Don't lock from either number alone: re-run candidates with `--end` just past the earlier of the two endings and confirm on frames (`isolatedWordsJson` has the isolated words) |

**The endpoint law: OUT = lastWordEnd + tail preference (VIDEO.md, default
≤1.0s).** Holding longer for a smile or a laugh is a taste call you're
allowed to make — but it's a decision: write the reason into the scene's
`reasoning`, and it must survive the sheet check.

`flags` are categorical red flags, each one a failure that shipped in a real
session: `SPEECH_AT_OUT` (tail silence 0 = someone is talking at your cut),
`NEXT_SPEECH_INSIDE` (the next prompt leaked in), `MID_WORD_OUT`/`MID_WORD_IN`
(cut lands inside a word), `DEAD_AIR_TAIL`, `LATE_FIRST_WORD`, `INDEX_DRIFT`
(the isolated re-transcription disagrees with the index — rebuild the endpoint
from `driftCheck.isolatedLastWordEnd`, then re-run candidates on the corrected
range). **A scene does not lock while flags stand** — resolve them or override
each with a written reason. When the OUT is scoped to the wrong sentence or
the index drifted, `suggestedOut` is null on purpose: re-scope using the
index's `sentences` (or the isolated words), don't nudge.

## When signals disagree

- Word timestamps vs silence edges → **silence edges win** for timing.
- Index word timing vs `driftCheck`'s isolated re-transcription → **the
  isolated pass wins**. Short-window whisper doesn't drift; the big-file
  index can.
- Transcript text vs silence → **transcript wins** for content ("is the
  phrase there"), silence wins for "when".
- Frames vs waveform → frames can't hear; the waveform can't read a
  look-down. You need both; that's why the sheet exists.
- Zero tail silence is never a pass. It means the range ends mid-speech.

## Creative discovery (better than scrubbing)

- Reaction cuts: sort `nonSpeech` by duration — every laugh/clap is a
  timestamped candidate for a hold or an L-cut.
- Best-take feel: compare `sentences[].wps`, `terminalPitch`, and the rms
  envelope across takes — flat + fast reads rushed; ranged + slower with a
  clean terminal fall reads alive and finished.
- Cut on action: zoom the sheet where the motion strip (orange = movement)
  lights up; cut into movement, not out of it. `cut` warns about jump-cut
  risk on direct joins (same setup, visible mismatch) — hide those with a
  card, a cutaway, or a bigger reframe.
- Music-driven cuts: `ripple beats` + `cut`'s `beatCheck` — land scene
  changes within ~70ms of a beat, card durations in whole beats.
- Eyes: state a face crop once per locked-off shot (READ one full frame
  first, then `--crop x,y,w,h` on frame-sheet/candidates) — look-downs and
  reading-the-next-question are separable at eye scale, not at 360px.
- "Tighter": `fillers` lists exact removable spans; check the sheet that
  removal doesn't jump-cut.

## Not built yet (don't fake these)

Learned VAD as a silence-map upgrade (whisper-cli's built-in `--vad` exists
but shifts word timestamps — never enable it in the word pass), full
multi-speaker diarization, lip-sync drift detection, downbeat/bar
inference. If an edit truly needs one, say so and degrade gracefully —
never eyeball a number these would have measured.
