---
name: ripple
description: Making and editing video with agents. Use for any request to make, plan, script, storyboard, edit, cut, trim, assemble, caption, grade, or render video; to write a script, AV script, or shot list; to pick the best takes from footage; to build title cards or motion graphics; to review or repair a video edit ("question 5 got cut off"); or to export/QA a finished video. Commands - init, develop, plan, edit, finish, repair, review, plus free-form intents.
---

# Ripple — agent video editing

You are editing video the way a professional editor works: every decision is
recorded in files, every change is verified by looking at the result, and the
project's standing creative direction is honored.

## Setup (ALWAYS, before anything else)

1. Run `node "${CLAUDE_SKILL_DIR}/scripts/context.mjs"` and obey its directives:
   - `NO_VIDEO_MD` → stop the current task, read `reference/init.md`, create
     VIDEO.md with the user, then resume what was asked.
   - `RESOLVED_CONTEXT` → note the project root and manifest path it reports.
2. If a command was invoked (`/ripple <command>`), read
   `reference/<command>.md` and follow it exactly.
3. Confirm the `ripple` CLI is available (`ripple help`; first time on a
   machine, `ripple doctor`). It is your eyes and hands; prefer it over
   hand-built ffmpeg incantations: `probe`, `transcribe`, `select`,
   `candidates`, `frame-sheet`, `cut`, `grade`, `qa`, `review`.

## Absolute rules

These come from real editing sessions that failed without them. Do not skip
them for speed.

- **Look before and after every change.** Generate a frame sheet
  (`ripple frame-sheet`) after every render and actually read it. Editing
  blind is the #1 agent failure in video work.
- **Every edit decision lives in `edit.json`.** Scenes, chosen takes, in/out
  points, and the *reasoning* for each choice. Renders are derived artifacts;
  never make a cut that isn't in the manifest.
- **Never trust one signal for a cut point.** A cut is correct only when
  (1) the transcript confirms the sentence ending is present, (2) silence
  detection confirms the tail is tight, and (3) tail frames confirm no
  look-down/reset. `ripple candidates` checks all three in one command.
  ASR timestamps and silencedetect both misclassify soft speech — they are
  guide rails, not edit points.
- **Never silently convert color.** Detect HDR at probe time. If the source is
  HDR (BT.2020 / HLG / PQ), preserve it unless VIDEO.md or the user says SDR.
  Accidental SDR conversion is a release blocker, not a style choice.
- **Repairs are localized.** "Q5 got cut off" means: patch that scene's
  endpoint in edit.json, re-render affected outputs, run focused QA on the
  repaired scenes plus a full decode. Never rebuild the whole edit.
- **QA is narrow and deterministic.** Run `ripple qa` after every render.
  When delegating verification to a subagent (`qa-reviewer`), give it a
  checklist of specific expected failures, not "check the video".

## Picking the stack (route before you build)

- **Cuts/trims/assembly of real footage, no graphics** → FFmpeg via the
  ripple CLI. No framework.
- **Motion graphics from scratch** (title cards, lower thirds, social pieces)
  → HyperFrames. Use the official HyperFrames skills if installed
  (`hyperframes`, `hyperframes-core`, ...); ripple owns the cut, HyperFrames
  owns the composition.
- **Timed UI overlays on footage / React components / design-team handoff**
  → Remotion. Use Remotion's official skills if installed. Drive overlay
  timing from the word-level transcript JSON.
- **Mixed** → FFmpeg spine + one framework as the overlay backend, joined
  through edit.json. Do not pick a framework the project doesn't already use
  without telling the user why.

## Commands

| Command | When | Playbook |
|---|---|---|
| `init` | No VIDEO.md, or user wants to set/change direction | `reference/init.md` |
| `develop` | Video doesn't exist yet: script / AV script / shot list / boards | `reference/develop.md` |
| `plan` | New edit: probe sources, transcribe, draft edit.json | `reference/plan.md` |
| `select` | Multiple takes; choose and justify the best | `reference/select.md` |
| `edit` | Execute/iterate the cut: endpoints, trims, assembly | `reference/edit.md` |
| `grade` | Color: generate/compare/record grading variants | `reference/grade.md` |
| `finish` | Export: color policy, safe concat, delivery QA | `reference/finish.md` |
| `repair` | User flags broken scenes ("Q5 got cut off") | `reference/repair.md` |
| `review` | Generate review page + artifacts; run QA subagent | `reference/review.md` |
| adjectives | "tighter", "punchier", "quieter", "let it breathe" | `reference/adjectives.md` |

## Routing

- **No argument** → summarize project state from context.mjs output and
  recommend the 1–2 highest-value commands with reasons.
- **"Make me a video" with no footage or script** → `develop` first. Align on
  words before producing anything expensive.
- **Command match** → load the reference file and follow it.
- **Intent match** → route free text: "cut this down" → `edit`; "it looks
  washed out" → `finish` (color policy); "the ending is cut off" → `repair`;
  "make me a title card" → stack routing (HyperFrames/Remotion).
- **General video question** → answer with the rules above in force.
