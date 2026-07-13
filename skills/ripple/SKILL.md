---
name: ripple
description: Making and editing video. Use when the user wants to make a video (script, shot list, storyboard), edit footage (cut, assemble, pick takes), add title cards or motion graphics, grade color, repair a flagged edit ("question 5 got cut off"), QA/export a finished video, or hand a rough cut to Premiere, Resolve, or another editor.
---

# Ripple — agent video editing

Work like a professional editor: decisions live in files, changes are
verified by looking, and the project's standing direction is honored.

## Setup (ALWAYS, before anything else)

1. Run `node "${CLAUDE_SKILL_DIR}/scripts/context.mjs"` and obey its
   directives (`NO_VIDEO_MD` → read `reference/init.md`, create VIDEO.md with
   the user, then resume what was asked).
2. If a command was invoked (`/ripple <command>`), read
   `reference/<command>.md` and follow it exactly.
3. Use the `ripple` CLI (`ripple help`; first run on a new machine:
   `ripple doctor`) instead of hand-built ffmpeg for anything it covers.

## Absolute rules

Each exists because a real session failed without it.

- **Look at your work.** `ripple frame-sheet` after every render, and read
  the image. Editing blind is the #1 agent failure in video.
- **The manifest is the edit.** Every cut lives in `edit.json` with bounds
  and reasoning; renders are derived artifacts.
- **Three-signal rule.** No cut point locks on one signal — `ripple
  candidates` checks transcript, silence, and edge frames together. Full
  protocol: `reference/edit.md`.
- **Never silently convert color.** HDR in means HDR out unless VIDEO.md or
  the user chose SDR. Accidental conversion is a release blocker.
- **Repairs are localized.** Patch the flagged scene, re-render only what
  changed, run focused QA. Never rebuild the edit.
- **QA is narrow and deterministic.** `ripple qa` after every render. A
  verification subagent gets a checklist of named failure modes, never
  "check the video".
- **Steering writes back.** A correction that changes standing direction
  ("remove all zooms") goes to VIDEO.md's steering log; scene-level fixes
  stay in edit.json.

## Picking the stack

- Footage only (cut/trim/assemble) → FFmpeg via the CLI. No framework.
- Motion graphics from scratch → HyperFrames (use its official skills if
  installed).
- Timed overlays on footage / React components / design handoff → Remotion
  (official skills). Overlay timing comes from the word-level transcript.
- Mixed → FFmpeg spine + one framework as overlay backend, joined through
  edit.json. Don't introduce a framework the project doesn't already use
  without saying why.

## Commands

| Command | When | Playbook |
|---|---|---|
| `init` | No VIDEO.md, or user wants to set/change direction | `reference/init.md` |
| `develop` | Video doesn't exist yet: script / AV script / shot list / boards | `reference/develop.md` |
| `plan` | New edit: probe sources, transcribe, draft edit.json | `reference/plan.md` |
| `generate` | An element doesn't exist: VO, music bed, SFX, still, b-roll | `reference/generate.md` |
| `select` | Multiple takes; choose and justify the best | `reference/select.md` |
| `edit` | Execute/iterate the cut: endpoints, trims, assembly | `reference/edit.md` |
| `grade` | Color: generate/compare/record grading variants | `reference/grade.md` |
| `finish` | Export: color policy, safe concat, delivery QA | `reference/finish.md` |
| `repair` | User flags broken scenes ("Q5 got cut off") | `reference/repair.md` |
| `review` | Generate review page + artifacts; run QA subagent | `reference/review.md` |
| `handoff` | User finishes in Premiere/Resolve/another NLE | `reference/nle.md` |
| adjectives | "tighter", "punchier", "quieter", "let it breathe" | `reference/adjectives.md` |

## Routing

- **No argument** → summarize project state from context.mjs output and
  recommend the 1–2 highest-value commands with reasons.
- **"Make me a video" with no footage or script** → `develop` first. Align on
  words before producing anything expensive.
- **Command match** → load the reference file and follow it.
- **Intent match** → "cut this down" → `edit`; "it looks washed out" →
  `finish`; "the ending is cut off" → `repair`; "make a title card" → stack
  routing above; "add a voiceover / needs music / I don't have b-roll" →
  `generate`; "open this in Premiere / I'll finish it in Resolve" →
  `handoff`.
- **General video question** → answer with the absolute rules in force.
