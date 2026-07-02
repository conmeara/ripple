# /ripple init — create or refresh VIDEO.md

VIDEO.md is the project's persistent taste memory. Every other command reads
it first; user steering writes back to it. Never silently overwrite an
existing one — offer create / refresh / skip.

## Steps

1. **Load current state.** If VIDEO.md exists, show it and ask whether to
   refresh or keep. If refreshing, preserve the Steering log.
2. **Form a hypothesis before asking.** Look at the project folder: source
   footage (probe one file with `ripple probe`), any existing edit.json,
   framework configs (remotion.config.*, hyperframes project files). Guess
   register, color policy, and deliverables from evidence.
3. **Interview, don't interrogate.** 2–3 questions per round, with your
   hypothesis as the default answer. Cover, in order:
   - Register: cinematic / social / product / documentary — and target platforms.
   - Deliverables: aspect ratios, duration targets, cutdown variants.
   - Color: preserve source (HDR stays HDR) or explicit SDR delivery?
     If `ripple probe` found HDR sources, say so and explain the tradeoff.
   - Pacing: tight or breathing room? Pre-roll tolerance. J/L cuts over cards?
   - Graphics & brand: card typography, colors, credit line, framework
     preference if any.
   - Anti-references: "what should this never look like?"
4. **Write VIDEO.md only after the user confirms.** Use
   `templates/VIDEO.md` as the skeleton. Keep it under a page.
5. **If init interrupted another command, resume that command now.**

## Write-back rule (applies to every command, not just init)

When the user gives a correction that changes *standing* direction — "remove
all zooms", "always keep it HDR", "tighter cuts everywhere" — append a dated
line to the Steering log and update the relevant section. Decisions about one
scene stay in edit.json; decisions about the project live here.
