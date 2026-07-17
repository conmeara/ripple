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

### Write-back mechanics

When steering writes back (the rule lives in SKILL.md): append a dated line to
the steering log AND update the section it changes, so the log is history and the
sections stay current.

## The study flow — taste from a reference edit

When the user has a video they want this project to feel like (a local file or a
URL — `ripple study` fetches URLs and caches them; `ripple doctor` probes for the
fetch tooling):

1. `ripple study` measures the reference — cutting rhythm (median shot length,
   cuts/min, whether it accelerates), delivery pace, tail preference (the gap the
   reference's editor leaves between a sentence's last word and the cut), silence
   usage, energy character, grade lean — and returns `styleProfile` plus
   `proposedVideoMd`, a paste-ready snippet where every value carries the
   measurement it came from.
2. **Walk the user through `styleProfile`** — the numbers, what each means, what
   the reference couldn't answer (unmeasured values say so instead of inventing a
   default).
3. **Merge `proposedVideoMd` into VIDEO.md WITH the user.** The command never
   writes VIDEO.md — that is this playbook's job, and only after the user
   confirms.
4. **When a measured value conflicts with an interview answer, the measurement
   wins — and say so.** "You said tight tails; the reference holds a median 1.2s
   after the last word. Going with 1.2s unless you object" beats silently picking
   either.

Re-running is free: the download and its perception index are both cached.

## Production stack — the standing service picks

These are the project's standing opinions about which services make missing
elements, so the develop playbook's generation flow doesn't re-litigate them
every session. Record the choice in VIDEO.md; the generation mechanics
(provenance, no-key fallbacks, provider table) live in `reference/develop.md`.

- **Voiceover → ElevenLabs TTS** (`eleven_multilingual_v2` default,
  `eleven_v3` when the read needs emotional range). Best quality/control; the
  vendor publishes official agent skills. Record the chosen voice ID in VIDEO.md
  — regenerating with a different voice every session is a taste failure. Piper
  (local, free) is the zero-key scratch spine.
- **Music bed / SFX → ElevenLabs Music & sound effects.** Prompt or composition
  plan, instrumental by default, exact length from the manifest. The bed rides
  `manifest.music`, never a clip. Beds stay ElevenLabs; a full song with vocals
  is a different tool (Suno) and a deliberate choice.
- **Stills / cards / boards → Gemini Image ("Nano Banana").** Aspect ratios to
  21:9, up to 4K, cheap per image; match the manifest's aspect ratio. Record the
  reused image-style prompt fragment in VIDEO.md.
- **B-roll → stock first, generate last.** Real footage beats generated for
  cutaways: search free stock (Pexels/Pixabay) before generating anything, and
  recut what the project already has before either. Generated video (Veo, etc.)
  is the premium last resort for true gaps — storyboard, generate once, probe the
  result.

## Framework routing (where visuals that aren't footage come from)

The project's standing choice of who renders non-footage visuals:

- **One-shot media ops** (a single reframe, a still, a format convert, a quick
  overlay) → raw ffmpeg / ImageMagick directly. The CLI is not a wrapper; don't
  reach for a framework for a one-liner.
- **Animation / motion graphics from scratch** → HyperFrames (use its official
  skills if installed).
- **Timed overlays on footage / React components / design handoff** → Remotion
  (official skills). Overlay timing comes from the word-level transcript.
- **Mixed** → FFmpeg spine + one framework as overlay backend, joined through
  edit.json. Don't introduce a framework the project doesn't already use without
  saying why — and if you do, that's a VIDEO.md decision.

## When any of this changes

A correction that changes standing direction ("remove all zooms", "warmer
grade", "switch to the other voice") is steering: append a dated line to
VIDEO.md's steering log and update the section it touches. Scene-level fixes stay
in edit.json (`reference/edit.md`); the project's taste stays here.
