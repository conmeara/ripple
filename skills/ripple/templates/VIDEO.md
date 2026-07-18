---
# Project-tier rule overrides — `ripple lint` reads this block. Retune a
# rule's threshold or waive it project-wide; EVERY entry needs a reason
# (a waiver without one is ignored and reported as a warn finding).
# Registry of rule ids: docs/rules.md in the plugin (or `ripple lint` output). Examples:
#   DEAD_AIR_TAIL: {maxTail: 2.5, reason: "contemplative piece — long tails are the point"}
#   NEXT_SPEECH_INSIDE: {waive: true, reason: "single-take monologue, no prompts to leak"}
rules: {}
---

# VIDEO.md — standing direction for this project

<!-- Created with the user (the ripple skill's Taste section). The agent reads
     this before every video task and writes confirmed steering back here.
     Keep it short. -->

## Register

<!-- cinematic | social | product | documentary — retunes pacing and graphics defaults -->
Register: social

## Deliverables

- Master: 16:9, 1080p, MP4 (H.264) unless source dictates otherwise
- Cutdowns: none

## Color policy

<!-- preserve — keep source color space (HDR stays HDR). sdr — explicit SDR delivery. -->
Policy: preserve

## Pacing

- Pre-roll before speech: 0.1–0.3s
- Tail after final words: ≤1.0s, cut before any look-down/reset
- J/L cuts over title cards: yes

## Graphics & brand

- Framework: none yet (route per task: HyperFrames for standalone motion, Remotion for React overlays)
- Card typography / colors: unset
- Credit line: none

## Generated elements

<!-- Standing picks for generated elements (the ripple skill's Produce table).
     Ask once, record, reuse. -->
- Voice: unset (ElevenLabs voice ID + model once chosen)
- Music direction: unset (e.g. "warm acoustic, no vocals, sparse")
- Image style: unset (prompt fragment reused across stills/cards)

## Anti-references

<!-- What this project must NOT look like. -->
- Generic AI-video tells: gratuitous zooms, template title animations, washed-out color

## Steering log

<!-- Confirmed user corrections that change standing direction. Date each. -->
