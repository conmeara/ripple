# The rule registry — 28 deterministic editing rules

Every deterministic opinion ripple enforces has ONE name, defined in
`cli/rules.mjs` and checked at three moments:

- **lock** — `ripple candidates` flags a single cut range before it locks
- **render** — `ripple lint` re-judges every scene of edit.json from cached
  perception before anything renders (plus `ripple cut`'s advisories)
- **delivery** — `ripple qa` gates the rendered artifacts

The same rule ID means the same failure at every moment. The registry exists
because the same defect kept changing names between surfaces: a tail judged
and accepted at lock time came back as an anonymous red at delivery and got
re-litigated from scratch. Each rule's origin below names the real session
failure that created it — a rule nobody can explain gets deleted.

Severity: **block** stops the phase (candidates flags block locking, unwaived
lint blocks exit 1, failed qa gates exit 1); **warn** is surfaced and never
blocks.

## Lock rules (SCREAMING_SNAKE — cut-point flags)

Raised by `ripple candidates` on a range and by `ripple lint` on every scene.

| Rule | Severity | Catches | Origin |
|---|---|---|---|
| `SPEECH_AT_OUT` | block | Tail silence 0 at every threshold — someone is speaking at the cut point | A session read "tail silence: 0" as a pass and shipped two next-question leaks |
| `MID_WORD_OUT` | block | The OUT lands inside a word | The "question 5 got cut off" repair class: OUTs placed from untimed text |
| `NEXT_SPEECH_INSIDE` | block | The next speech starts INSIDE the range | The shipped chore cut: the next question began at 499.5s inside a range ending 501s |
| `DEAD_AIR_TAIL` | block | More than `maxTail` (default 1.0s) of nothing after the last word | The shipped married cut carried a 2.45s dead tail past every eyeball |
| `MID_WORD_IN` | block | The range starts inside a word | Same untimed-text failure at the IN — answers opened mid-syllable |
| `LATE_FIRST_WORD` | block | More than `maxLead` (default 0.5s) before the first word | Ranges opened on the interviewer's silence instead of the answer |
| `INDEX_DRIFT` | block | The range's isolated re-transcription disagrees with the index's word timing (`driftCheck`, Δ > 1.25s) — the big-file timestamps drifted; the isolated numbers are ground truth | A 13-min source drifted 1–5s late on 8 of 10 answers; every cut placed from the index landed on the speaker's reset, three re-renders deep |

## Render rules (pre-render findings and render-time advisories)

`NO_INDEX`, `NO_WORD_TIMING`, and `waiver-missing-reason` are raised by
`ripple lint`; `jump-cut` and `off-beat` by `ripple cut` (they need frames
and a beat grid, which lint — fast and side-effect-free by contract — never
computes).

| Rule | Severity | Catches | Origin |
|---|---|---|---|
| `NO_INDEX` | block | A scene's source has no cached perception index — the cut is unverifiable | Lint must never pass a scene nobody analyzed; unverified green is how leaks ship |
| `NO_WORD_TIMING` | warn | The index has no word timing — endpoint checks ran on silence alone | The original leaks shipped off untimed transcript text; degraded verification must say so |
| `DRIFT_SUSPECT` | warn | The scene's source index self-reports word-timing drift — the OUT needs candidates' `driftCheck`; waive per scene with the aligned Δ once it clears | Scenes re-scoped by hand from a drifted index kept passing lint green while every cut landed on the speaker's reset |
| `jump-cut` | warn | A direct join between mostly-matching frames | Locked-off interview joins spliced two takes of the same framing into a visible skip |
| `off-beat` | warn | Visual boundaries land off the music bed's beat grid | A montage cut 140ms off the beat felt wrong before anyone could say why |
| `waiver-missing-reason` | warn | A waiver with no written reason (it is ignored, not honored) | Reasonless waivers rot — a month later nobody can tell an intentional exception from a hack |

## Delivery gates (kebab-case — `ripple qa`)

| Rule | Severity | Catches | Origin |
|---|---|---|---|
| `decode` | block | The final must decode cleanly end to end | A corrupt final looks fine in a player seek — only a full decode proves the file |
| `probe` | block | A video stream and a real duration exist | A bad -map once delivered an audio-only "video" every downstream tool accepted |
| `color-policy` | block | Delivered color matches the policy — HDR stays HDR | An HLG master silently became washed-out SDR; the release blocker that created the policy |
| `clip-count` | block | One rendered clip per manifest scene | A partial --scene render left stale clips that QA'd as the whole edit |
| `clip-decode` | block | Every per-scene clip decodes cleanly | One truncated clip poisoned the assembly while the other nine looked fine |
| `scene-tails` | block | Per-scene tail silence within `qa.maxTailSilence` | Two >2s interior tails passed the global edge gates — the final's edges can't see inside scene 6 |
| `dialogue-loudness` | block | Per-scene loudness spread within `qa.maxLoudnessSpread` | One scene sat 6dB quieter than its neighbor — the defect a mixing panel exists to prevent |
| `leading-silence` | block | Opening silence within bounds, allowing an opening card's quiet | Failing red on every card-led cut taught everyone to ignore red QA |
| `tail-silence` | block | Final tail silence within `qa.maxTailSilence` | The married-cut dead tail again, caught at delivery when lock and lint were skipped |
| `loudness` | block | Integrated loudness within ±1 LU of `music.loudnessTarget` | A hot bed masked every silence gate; integrated loudness was the only number that caught it |
| `prompt-leak` | block | No interviewer prompts or take slates in the final transcript | "Next question" shipped in a final. Twice |
| `scene-endings` | block | Every `scene.expectEnding` phrase present in the transcript | "Question 5 got cut off" — the repair loop's acceptance test, promoted to a standing gate |
| `content-gates` | block | Content checks must run when expected — a missing transcript fails loudly | Content gates once skipped silently and a leak passed QA green |
| `black-frames` | block | Black frames the manifest doesn't explain (cards, dissolve/fadeblack overlaps are expected) | A 2-frame black blink at a scene join shipped — every gate was listening, none were looking |
| `freeze-frames` | block | Frozen picture outside the manifest's intentional stills/cards | A mis-seeked segment froze mid-scene while the audio kept talking |

## Waiving a rule

Waivers exist because a rule that cannot bend gets deleted instead of obeyed.
Every waiver is surfaced as waived-with-reason in the lint report — never
silently dropped — and a waiver without a reason is ignored and reported
(`waiver-missing-reason`).

### Scene tier — edit.json

One scene is intentionally an exception. Sits next to the bounds it excuses:

```json
{
  "slug": "long_goodbye",
  "start": 771.2, "end": 779.0,
  "waivers": [
    { "rule": "DEAD_AIR_TAIL", "reason": "she looks at the photo for 2s — the silence is the scene" }
  ]
}
```

### Project tier — VIDEO.md front-matter

The whole project's style bends a rule: retune its threshold or waive it
everywhere. Lives in the YAML block at the top of VIDEO.md:

```yaml
---
rules:
  DEAD_AIR_TAIL: {maxTail: 2.5, reason: "contemplative piece — long tails are the point"}
  NEXT_SPEECH_INSIDE: {waive: true, reason: "single-take monologue, no prompts to leak"}
---
```

`maxTail` retunes `DEAD_AIR_TAIL`; `maxLead` retunes `LATE_FIRST_WORD`;
`waive: true` waives the rule project-wide. Retunes are echoed in lint's
and candidates' `overrides` block so they are visible on every run, and
both commands read the same VIDEO.md — a range judges identically at lock
and pre-render. Precedence: an explicit CLI flag (`--max-tail`/`--max-lead`)
outranks the project retune (the echoed entry is marked `superseded: true`),
and the retune outranks the built-in default. A retune value that isn't a
number (quoted numbers like `"2.5"` are fine — they coerce) is not applied
and not echoed.

### Delivery thresholds — the manifest's qa block

Delivery gates were already tunable from edit.json and stay that way:
`qa.maxTailSilence`, `qa.maxLeadingSilence`, `qa.maxLoudnessSpread`,
`qa.leakPatterns`. The gates that compare against the manifest
(`black-frames`, `freeze-frames`, `leading-silence`) self-adjust to cards
and transitions — a declared opening card is quiet and black on purpose.

## Reading a lint report

`ripple lint edit.json` prints every finding:

```json
{ "rule": "DEAD_AIR_TAIL", "scene": "long_goodbye", "severity": "block",
  "waived": true, "waiverReason": "she looks at the photo for 2s — the silence is the scene" }
```

Exit 1 means at least one **unwaived block** finding stands: re-scope the cut
(`ripple candidates` — the index's `sentences` array is the lattice) or waive
it with a written reason. Exit 0 with warn findings means render, but read
them first.
