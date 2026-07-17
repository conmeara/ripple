# taste — the project's standing direction

VIDEO.md is the project's persistent taste memory. Every other command reads it
first; user steering writes back to it. This playbook creates and refreshes it,
turns a reference edit into measured values, and records the standing service
picks the whole project reuses.

## VIDEO.md — create, refresh, never silently overwrite

Never clobber an existing VIDEO.md — offer create / refresh / skip.

1. **Load current state.** If VIDEO.md exists, show it and ask whether to refresh
   or keep. If refreshing, preserve the steering log.
2. **Form a hypothesis before asking.** Look at the project folder: source
   footage (`ripple probe` one file), any existing edit.json, framework configs
   (remotion.config.*, hyperframes project files). Guess register, color policy,
   and deliverables from evidence.
3. **Offer the shortcut first: "show me a video you like."** A reference edit
   answers pacing questions better than adjectives do — the study flow below
   turns one into measured VIDEO.md values.
4. **Interview, don't interrogate.** 2–3 questions per round, with your
   hypothesis as the default answer. Cover, in order:
   - Register: cinematic / social / product / documentary — and target platforms.
   - Deliverables: aspect ratios, duration targets, cutdown variants.
   - Color: preserve source (HDR stays HDR) or explicit SDR delivery? If `ripple
     probe` found HDR sources, say so and explain the tradeoff
     (`reference/deliver.md`).
   - Pacing: tight or breathing room? Pre-roll tolerance. J/L cuts over cards?
   - Graphics & brand: card typography, colors, credit line, framework preference.
   - Production stack: the standing service picks below, if the project will
     generate anything.
   - Anti-references: "what should this never look like?"
5. **Write VIDEO.md only after the user confirms.** Use `templates/VIDEO.md` as
   the skeleton. Keep it under a page.
6. **If this interrupted another command, resume that command now.**

**Running headless (no user to interview):** skip the interview and apply
SKILL.md's non-interactive defaults clause (Setup) — it is the single home for
that behavior.

### Write-back mechanics

When steering writes back (the rule lives in SKILL.md): append a dated line to the
steering log AND update the section it changes — the log is history, the sections
stay current.

## The study flow — taste from a reference edit

When the user has a video they want this project to feel like (a local file or a
URL — `ripple study` fetches and caches URLs):

1. `ripple study` measures the reference and returns `styleProfile` plus
   `proposedVideoMd` (a paste-ready snippet where every value carries the
   measurement it came from). Walk the user through the numbers, including what
   the reference couldn't answer — unmeasured values say so instead of inventing a
   default.
2. **Merge `proposedVideoMd` into VIDEO.md WITH the user.** The command never
   writes VIDEO.md — that is this playbook's job, and only after the user
   confirms.
3. **When a measured value conflicts with an interview answer, the measurement
   wins — and say so.** "You said tight tails; the reference holds a median 1.2s
   after the last word. Going with 1.2s unless you object" beats silently picking
   either. Re-running is free — the download and its index are cached.

## Production stack — the standing service picks

The project's standing opinions about which services make missing elements, so
the develop playbook's generation flow doesn't re-litigate them every session
(picks as of 2026-07). Record the choice in VIDEO.md; the generation mechanics
(provenance, no-key fallbacks) live in `reference/develop.md`.

- **Voiceover → ElevenLabs TTS** — pick `eleven_multilingual_v2`, `eleven_v3`
  when the read needs emotional range. Why: best quality/control and the vendor
  publishes official agent skills. When not: no key → Piper (local, free) is the
  zero-key scratch spine. Record the chosen voice ID in VIDEO.md; a different
  voice every session is a taste failure.
- **Music bed / SFX → ElevenLabs Music & sound effects** — instrumental by
  default, exact length from the manifest, riding `manifest.music` never a clip.
  Why: one vendor for the whole audio stack. When not: a full song *with vocals*
  is a deliberate switch to Suno.
- **Stills / cards / boards → Gemini Image ("Nano Banana")** — match the
  manifest's aspect ratio; record the reused image-style prompt fragment in
  VIDEO.md. Why: aspect ratios to 21:9, up to 4K, cheap per image.
- **B-roll → stock first, generate last** — recut what the project already has,
  then free stock (Pexels/Pixabay), then generation. Why: real footage beats
  generated for cutaways. When not: a true gap with no real coverage → generated
  video (Veo) is the premium last resort — storyboard, generate once, probe it.

## Framework routing and steering

Which framework renders non-footage visuals routes through SKILL.md's "Picking
the stack" (deviating from what the project already uses is a VIDEO.md decision).
Standing-direction changes ("remove all zooms", "warmer grade", "switch voice")
are steering — follow SKILL.md's rule, mechanics under "Write-back" above.
