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
3. **Offer the shortcut first: "show me a video you like."** A reference
   edit answers pacing questions better than adjectives do — the study flow
   below turns one into measured VIDEO.md values.
4. **Interview, don't interrogate.** 2–3 questions per round, with your
   hypothesis as the default answer. Cover, in order:
   - Register: cinematic / social / product / documentary — and target platforms.
   - Deliverables: aspect ratios, duration targets, cutdown variants.
   - Color: preserve source (HDR stays HDR) or explicit SDR delivery?
     If `ripple probe` found HDR sources, say so and explain the tradeoff.
   - Pacing: tight or breathing room? Pre-roll tolerance. J/L cuts over cards?
   - Graphics & brand: card typography, colors, credit line, framework
     preference if any.
   - Anti-references: "what should this never look like?"
5. **Write VIDEO.md only after the user confirms.** Use
   `templates/VIDEO.md` as the skeleton. Keep it under a page.
6. **If init interrupted another command, resume that command now.**

## The study flow — taste from a reference edit

When the user has a video they want this project to feel like (a local file
or a URL — `ripple study` fetches URLs with yt-dlp and caches them in
`~/.ripple/study/`; `ripple doctor` probes for yt-dlp):

1. `ripple study <file-or-url>`. It measures the reference — cutting rhythm
   (median shot length, cuts/min, whether it accelerates), delivery pace,
   tail preference (the gap the reference's editor leaves between a
   sentence's last word and the cut), silence usage, energy character, grade
   lean — and returns `styleProfile` plus `proposedVideoMd`, a paste-ready
   snippet where every value carries the measurement it came from.
2. **Walk the user through `styleProfile`** — the numbers, what each means,
   what the reference couldn't answer (unmeasured values say so instead of
   inventing a default).
3. **Merge `proposedVideoMd` into VIDEO.md WITH the user.** The command
   never writes VIDEO.md — that is this playbook's job, and only after the
   user confirms.
4. **When a measured value conflicts with an interview answer, the
   measurement wins — and say so to the user.** "You said tight tails; the
   reference holds a median 1.2s after the last word. Going with 1.2s unless
   you object" beats silently picking either.

Re-running is free: the download and its perception index are both cached
(`--force` refetches and rebuilds).

## Write-back mechanics

When steering writes back (the rule lives in SKILL.md): append a dated line
to the Steering log AND update the section it changes, so the log is history
and the sections stay current.
