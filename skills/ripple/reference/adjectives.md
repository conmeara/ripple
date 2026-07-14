# Editing adjectives — operational protocols

An adjective with nothing behind it is just a nice apostrophe. The ones users
actually reach for are promoted to first-class invocations — `/ripple tighter
[scene]`, `/ripple punchier [scene]`, `/ripple breathe [scene]`, `/ripple
quieter [scene]` — each a named, countable editing move: a header block states
what it reads, what it changes, what it re-renders, and what it verifies; the
body runs diagnose → lock constraints → apply concrete levers → identity test.
A scene target scopes the move to that scene; no target means the whole cut.

All bound changes go through edit.json and get confirmed with
`ripple candidates`; VIDEO.md pacing bounds are the ceiling/floor.

## tighter — the slack trim

- **Reads**: `ripple qa` silence checks per clip; tail strips.
- **Changes**: tails, pre-roll, dead mid-scene pauses — in edit.json,
  never words.
- **Re-renders**: only the scenes whose bounds moved (`cut --scene <slug>`).
- **Verifies**: three signals per changed endpoint; total duration delta
  reported to the user.

Protocol:

- **Diagnose**: where is the slack? The qa checks and tail strips answer —
  slack is almost always tails and mid-answer pauses, not content.
- **Lock**: do not cut words. The transcript's sentence endings are a hard
  boundary.
- **Levers**: tails toward 0.3–0.5s; pre-roll toward 0.1s; remove mid-scene
  pauses > 0.8s only when the frames show no meaningful reaction; cut on
  sentence ends, never mid-breath.
- **Identity test**: does it still breathe at all? If every scene now starts
  mid-word, you over-rotated — restart from the previous manifest (git or the
  candidates history).

## punchier — the attack cut

- **Reads**: everything `tighter` reads, plus a frame-sheet of the open and
  `select` results where alternative takes exist.
- **Changes**: in-points, take choices, scene order where negotiable, card
  length and J-cuts.
- **Re-renders**: changed scenes, plus a fresh draft of the opening.
- **Verifies**: frame-sheet the first 10 seconds — something should be
  happening in tile one.

Protocol:

- **Diagnose**: is the problem pace (slow in/out points) or energy (flat takes)?
- **Lock**: same content, same message. Punchy ≠ frantic.
- **Levers**: everything in `tighter`, plus: cut INTO speech/action (first
  frame has motion or voice); prefer higher-energy takes when `select` shows
  alternatives; front-load the strongest scene if order is negotiable; shorter
  cards (2.0s) with J-cuts so audio pulls the viewer across.
- **Identity test**: would this read as every AI-tightened video (breathless,
  uniform 2s shots)? Vary shot length; keep one deliberate pause.

## breathe / quieter — the settle

Two names, one move. Subtlety needs precision, not absence of effort.

- **Reads**: tail strips and frames, hunting the natural settle (a smile, a
  look) and the pauses that carry meaning.
- **Changes**: tails, pre-roll, card length, J-cuts, scene-order steadiness —
  in edit.json.
- **Re-renders**: only the scenes whose bounds moved.
- **Verifies**: tail strips show intentional stillness, not dead resets —
  there's a difference between breathing room and forgotten trim.

Protocol:

- **Diagnose**: what feels rushed — cut density, or missing reaction space?
- **Lock**: no new content, no slow-motion gimmicks.
- **Levers**: tails toward 1.2–1.5s where frames show a natural settle;
  keep pauses that carry meaning; pre-roll toward 0.3s; longer cards (3.0s+)
  without J-cuts; steadier scene order.
- **Identity test**: quiet, not slack. If `ripple qa` flags >1.5s of literal
  silence at any edge, it's slack.

## Applying any adjective

1. Restate the adjective as the specific levers you'll pull (get a nod if
   scope is ambiguous).
2. Patch edit.json bounds; keep the previous values in `candidates` so it's
   reversible.
3. Render draft, qa, frame-sheet, compare against intent.
4. If the user confirms the direction ("yes, like that"), log it to VIDEO.md's
   Pacing section — the adjective's meaning for THIS project is now calibrated.

That's three named moves behind four invocations; every other adjective earns
its levers through the four steps above.
