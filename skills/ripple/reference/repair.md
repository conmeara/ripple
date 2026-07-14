# /ripple repair — localized fixes, never rebuilds

The user says "question 5 got cut off" or "the second one lingers too long".
Repairs are endpoint patches to specific scenes. The manifest makes them
cheap; keep them cheap.

## Steps

1. **Map the complaint to scenes — with `ripple locate`, never by counting.**
   "At 1:23 it drags" → `ripple locate 1:23 edit.json` returns the scene and
   the SOURCE time (through cards, J-cuts, dissolves). Users also misremember
   which scene (a real session had "first question" that turned out to be
   the second) — verify against the actual clip before editing anything.
   Snapshot before patching: `ripple snapshot edit.json --label "before fix"`
   (cut also auto-snapshots), so any repair is one `ripple compare` away
   from being measured and one copy away from being reverted.
2. **Diagnose from source, not from the render.** Start by LOOKING at the
   flagged region: `ripple timeline-sheet <src> --scene <slug> --manifest
   edit.json` shows the current bounds against the waveform, words, and
   silence — a mistimed cut is usually visible instantly. For a cut-off
   ending, find the missing phrase in the SOURCE transcript, then probe
   candidate endpoints: `ripple candidates <src> --start <current-start>
   --end <proposed-new-end> --label <slug>`.
3. **Patch only when the three signals confirm** (ending present, next prompt
   absent per `timing.nextText`, `flags` empty, tail tight and visually
   clean). Update the scene's bounds, `status: "repaired"`, and reasoning
   ("re-extended to include 'truly in the present'; tailGap 0.95s").
4. **Re-render only what changed**: the affected scene clips, then the full
   assembly (one re-encode). Never touch other scenes' bounds.
5. **Focused QA**: `ripple qa` with the repaired scenes' expected ending
   phrases as explicit checks, plus a full decode of the final. If the fix
   was user-flagged, also spawn the `qa-reviewer` subagent with a narrow
   checklist naming each repaired scene and its expected content.
6. **Report** the patch table: scene, old bounds → new bounds, why, QA result.

## Repeated repairs are a signal

If the same *kind* of repair recurs (endings cut off twice), the endpoint
heuristic is miscalibrated for this footage — loosen the default (e.g. tail
silence bound 1.0s → 1.3s), note it in VIDEO.md's Steering log, and re-check
remaining scenes proactively instead of waiting for the next complaint.
