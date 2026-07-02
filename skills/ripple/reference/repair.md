# /ripple repair — localized fixes, never rebuilds

The user says "question 5 got cut off" or "the second one lingers too long".
Repairs are endpoint patches to specific scenes. The manifest makes them
cheap; keep them cheap.

## Steps

1. **Map the complaint to scenes.** Users count what they see ("the second
   question") — map against edit.json order, and confirm which scene if
   ambiguous. Users also misremember which scene (a real session had "first
   question" that turned out to be the second) — verify the complaint against
   the actual clip before editing anything.
2. **Diagnose from source, not from the render.** For a cut-off ending, find
   the missing phrase in the SOURCE transcript, then probe candidate
   endpoints: `ripple candidates <src> --start <current-start> --end
   <proposed-new-end> --label <slug>`.
3. **Patch only when the three signals confirm** (ending present, next prompt
   absent, tail tight and visually clean). Update the scene's bounds,
   `status: "repaired"`, and reasoning ("re-extended to include 'truly in the
   present'; tail 0.95s").
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
