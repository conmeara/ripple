# edit — the core loop

Execute and iterate the cut. Everything here assumes edit.json exists (the
develop playbook creates it). This is the heart of the product: place endpoints
by the three-signal rule, select the take when takes repeat, and repair flagged
scenes locally without rebuilding the edit.

## The three-signal endpoint rule (never skip)

A cut point is confirmed by numbers, sound, and sight together, via `ripple
candidates` on the range (read `reference/perception.md` for the full signal
guide):

1. **Numbers.** The endpoint law: `OUT = timing.lastWordEnd + tail preference`
   (VIDEO.md, default ≤1.0s) — verify `tailGap` against it, and verify
   `timing.nextText` is the next prompt/take, not more of the answer. Check
   `driftCheck.verdict` is `aligned`: on long sources the index's word timing can
   drift seconds late, and `INDEX_DRIFT` means every timing number near this OUT
   is fiction — rebuild the endpoint from `driftCheck.isolatedLastWordEnd` (the
   isolated re-transcription is ground truth), then re-run candidates on the
   corrected range. **No scene locks while `flags` is non-empty**: every flag is
   either resolved or overridden with a written reason in the scene's
   `reasoning`. `suggestedOut` is the mechanical answer; taste may hold longer (a
   smile, a laugh) — as a recorded decision, never a shrug.
2. **Silence** at multiple thresholds — one threshold can eat soft speech. Tail
   silence 0 is a red flag, not a pass: someone is speaking at the cut.
3. **Sight.** READ the head/tail cut-card sheets and frame strips: the OUT line
   must sit in shaded silence, not touching the next waveform burst, and the
   frames show no look-down, reset, or glance at notes. **Check past the cut, not
   up to it**: the frame window must extend several seconds BEYOND the candidate
   OUT — a look-down that begins 0.2s after your last checked frame ships in the
   render. A real session verified every tail "up to the cut", called them all
   safe, and the user sent three of them back.

Start points: just before the first complete word (`firstWordStart`), keeping
the VIDEO.md pre-roll (default 0.1–0.3s). End points: after the final sentence,
before the reset.

## The loop

1. For each `proposed` scene, run `candidates`, adjust bounds in edit.json, set
   `status: "locked"` and update `reasoning` with what confirmed it.
2. Before rendering, `ripple lint` — the endpoint rules `candidates` applies to
   one range, re-judged across the whole manifest from cached perception
   (milliseconds; a plugin hook runs the same check on every manifest write). It
   exists because a scene re-scoped by hand after candidates ran kept shipping
   fresh flags nobody re-checked. Exit 1 means an unwaived block finding stands:
   re-scope, or waive with a written reason (`reference/rules.md`).
3. Render with `ripple cut` — per-scene clips, cards (with J-cut audio when set),
   and the full assembly from the manifest, HDR-aware. Iterating one scene?
   Scope the render to it. Read its `warnings` array every time.
4. After every render: qa it and look at it. Fix before showing the user.
5. Present: what changed, the scene table, and where to look. Ask for
   corrections by scene ("Q5 too long?") — corrections route to the repair
   section below.

## Selecting the take

Take selection must be explainable: candidate takes, the chosen take, and the
reason, all recorded in edit.json. "It seemed best" is not reasoning.

**Takes spread across files.** `ripple select` transcribes each (cached),
clusters files covering the same content, and scores each take on recency (later
takes usually improve), filler density, and whether it ends on a complete
sentence. Treat scores as a shortlist, not a verdict — confirm the recommended
take with `ripple candidates` before locking it.

**Takes inside one long recording.** The groom-video case: one 13-minute file,
several attempts per question. The CLI can't cluster these — you can, from the
transcript:

1. Read the word-level transcript from `ripple transcribe`.
2. Frame-sheet the source by scene change — in static footage, scene-change tiles
   mark resets/look-downs between attempts. Scene timestamps that land between
   near-duplicate phrasings are your take boundaries.
3. Repeated attempts show up as near-duplicate phrasings; the last attempt is
   usually the keeper, but verify — sometimes an early take is the complete one
   and the retry trails off.
4. Log every candidate range in the scene's `candidates` array with a short note
   ("take 2, stumbles at the end"), then run `candidates` on the winner.

What to record:

```json
{
  "slug": "married_life",
  "take": "take 2 of 2",
  "candidates": [{ "start": 731.0, "end": 748.2, "note": "take 1 — trails off" }],
  "reasoning": "take 2: no fillers, ends on 'excited for the adventure', confirmed by candidates"
}
```

If the user overrides a recommendation, that's signal — note what they valued
(energy over cleanliness? brevity?) in VIDEO.md's steering log.

## Repair — localized fixes, never rebuilds

The user says "question 5 got cut off" or "the second one lingers too long".
Repairs are endpoint patches to specific scenes. The manifest makes them cheap;
keep them cheap.

1. **Cold session? Orient first.** "Question 5 got cut off" often arrives in a
   session that didn't make the cut. Run `ripple lint` for where the cut stands —
   outstanding findings, per-scene endpoint verdicts, whether the render is stale
   — and `ripple history --list` for what changed and when. Diagnose from those
   facts, not from memory of a session you weren't in.
2. **Map the complaint to scenes — never by counting.** "At 1:23 it drags" →
   `ripple timeline-sheet --at 1:23 --manifest edit.json` returns the scene and
   the SOURCE time it maps to (through cards, J-cuts, dissolves). Users also
   misremember which scene (a real session had "first question" that turned out
   to be the second) — verify against the actual clip before editing anything.
   **Snapshot before patching**: `ripple history` saves the manifest (cut also
   auto-snapshots), so any repair is one `ripple history --diff` away from being
   measured and one copy away from being reverted.
3. **Diagnose from source, not from the render.** Start by LOOKING at the flagged
   region: `ripple timeline-sheet --scene <slug> --manifest edit.json` shows the
   current bounds against the waveform, words, and silence — a mistimed cut is
   usually visible instantly. For a cut-off ending, find the missing phrase in
   the SOURCE transcript, then probe candidate endpoints with `ripple
   candidates`.
4. **Patch only when the three signals confirm** (ending present, next prompt
   absent per `timing.nextText`, `flags` empty, tail tight and visually clean).
   Update the scene's bounds, `status: "repaired"`, and reasoning ("re-extended
   to include 'truly in the present'; tailGap 0.95s").
5. **Re-render only what changed**: the affected scene clips, then the full
   assembly (one re-encode). Never touch other scenes' bounds.
6. **Focused QA**: `ripple qa` with the repaired scenes' expected ending phrases
   as explicit checks, plus a full decode of the final. If the fix was
   user-flagged, also run the independent reviewer (`reference/deliver.md`) with a
   narrow checklist naming each repaired scene and its expected content.
7. **Report** the patch table: scene, old bounds → new bounds, why, QA result.

**Repeated repairs are a signal.** If the same *kind* of repair recurs (endings
cut off twice), the endpoint heuristic is miscalibrated for this footage —
loosen the default (e.g. tail silence bound 1.0s → 1.3s), note it in VIDEO.md's
steering log, and re-check remaining scenes proactively instead of waiting for
the next complaint.

## Style vs. content

Effects (zooms, speed ramps, stylization) are render-profile layers on top of
the manifest, never baked into scene bounds. Per-scene clip exports stay
clean/unstyled unless the user explicitly wants styled clips. If the user kills
an effect ("remove all zooms"), the cut list survives untouched — and log the
steering decision to VIDEO.md.

## Editing adjectives — operational protocols

An adjective with nothing behind it is just a nice apostrophe. The ones users
actually reach for are promoted to first-class invocations — `tighter [scene]`,
`punchier [scene]`, `breathe [scene]`, `quieter [scene]` — each a named,
countable editing move: it states what it reads, what it changes, what it
re-renders, and what it verifies, then runs diagnose → lock constraints → apply
concrete levers → identity test. A scene target scopes the move to that scene;
no target means the whole cut. All bound changes go through edit.json and get
confirmed with `ripple candidates`; VIDEO.md pacing bounds are the ceiling/floor.

### tighter — the slack trim

- **Reads**: `ripple qa` silence checks per clip; tail strips.
- **Changes**: tails, pre-roll, dead mid-scene pauses — in edit.json, never
  words.
- **Re-renders**: only the scenes whose bounds moved.
- **Verifies**: three signals per changed endpoint; total duration delta reported
  to the user.

Protocol:

- **Diagnose**: where is the slack? The qa checks and tail strips answer — slack
  is almost always tails and mid-answer pauses, not content.
- **Lock**: do not cut words. The transcript's sentence endings are a hard
  boundary.
- **Levers**: tails toward 0.3–0.5s; pre-roll toward 0.1s; remove mid-scene
  pauses > 0.8s only when the frames show no meaningful reaction; cut on sentence
  ends, never mid-breath.
- **Identity test**: does it still breathe at all? If every scene now starts
  mid-word, you over-rotated — restart from the previous manifest (`ripple
  history` or the candidates history).

### punchier — the attack cut

- **Reads**: everything `tighter` reads, plus a frame-sheet of the open and
  `select` results where alternative takes exist.
- **Changes**: in-points, take choices, scene order where negotiable, card length
  and J-cuts.
- **Re-renders**: changed scenes, plus a fresh draft of the opening.
- **Verifies**: frame-sheet the first 10 seconds — something should be happening
  in tile one.

Protocol:

- **Diagnose**: is the problem pace (slow in/out points) or energy (flat takes)?
- **Lock**: same content, same message. Punchy ≠ frantic.
- **Levers**: everything in `tighter`, plus: cut INTO speech/action (first frame
  has motion or voice); prefer higher-energy takes when `select` shows
  alternatives; front-load the strongest scene if order is negotiable; shorter
  cards (2.0s) with J-cuts so audio pulls the viewer across.
- **Identity test**: would this read as every AI-tightened video (breathless,
  uniform 2s shots)? Vary shot length; keep one deliberate pause.

### breathe / quieter — the settle

Two names, one move. Subtlety needs precision, not absence of effort.

- **Reads**: tail strips and frames, hunting the natural settle (a smile, a look)
  and the pauses that carry meaning.
- **Changes**: tails, pre-roll, card length, J-cuts, scene-order steadiness — in
  edit.json.
- **Re-renders**: only the scenes whose bounds moved.
- **Verifies**: tail strips show intentional stillness, not dead resets — there's
  a difference between breathing room and forgotten trim.

Protocol:

- **Diagnose**: what feels rushed — cut density, or missing reaction space?
- **Lock**: no new content, no slow-motion gimmicks.
- **Levers**: tails toward 1.2–1.5s where frames show a natural settle; keep
  pauses that carry meaning; pre-roll toward 0.3s; longer cards (3.0s+) without
  J-cuts; steadier scene order.
- **Identity test**: quiet, not slack. If `ripple qa` flags >1.5s of literal
  silence at any edge, it's slack.

### Applying any adjective

1. Restate the adjective as the specific levers you'll pull (get a nod if scope
   is ambiguous).
2. Patch edit.json bounds; keep the previous values in `candidates` so it's
   reversible.
3. Render draft, qa, frame-sheet, compare against intent.
4. If the user confirms the direction ("yes, like that"), log it to VIDEO.md's
   pacing section — the adjective's meaning for THIS project is now calibrated.

That's three named moves behind four invocations; every other adjective earns
its levers through the four steps above. Adjectives are lever sets with numbers
and verification, not vibes.
