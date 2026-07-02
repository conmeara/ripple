# Ripple

**Teach agents to edit video.** Ripple is a plugin for Claude Code and Codex
that gives coding agents the knowledge to edit video like an editor, the tools
to see and cut footage, and a persistent memory for a project's taste.

- **Guidance** — skills covering the editing craft: transcription-driven cut
  decisions, the three-signal endpoint rule, HDR-safe finishing, localized
  repairs, and deterministic QA. Motion graphics route to the official
  [HyperFrames](https://github.com/heygen-com/hyperframes) and
  [Remotion](https://www.remotion.dev/docs/ai/skills) skills.
- **Tools** — the `ripple` CLI: `doctor`, `probe`, `transcribe`, `select`,
  `candidates`, `frame-sheet`, `cut`, `grade`, `qa`, `review`. One command per
  loop that agents otherwise rebuild by hand — including a manifest-driven
  renderer with title cards, J-cuts, and HDR-safe assembly.
- **Taste** — `VIDEO.md` holds a project's standing creative direction
  (register, color policy, pacing, brand); `edit.json` holds each video's cut
  decisions with reasoning. User steering writes back, so lessons persist.

## Install

```
/plugin marketplace add conmeara/ripple
/plugin install ripple@ripple
```

Requirements: `ffmpeg`/`ffprobe` on PATH (`brew install ffmpeg`). Optional but
recommended for transcript-driven editing: `brew install whisper-cpp` plus a
model in `~/.ripple/models/` (the plugin walks you through it).

## Use

Ask for an edit in plain language ("cut a 30-second promo from these clips,
synced to the track") or invoke commands directly:

| Command | What it does |
|---|---|
| `/ripple init` | Interview → `VIDEO.md` (the project's taste memory) |
| `/ripple plan` | Probe + transcribe sources → first `edit.json` |
| `/ripple select` | Pick the best takes, with recorded reasoning |
| `/ripple edit` | Execute the cut with verified endpoints |
| `/ripple grade` | Compare color grades on stills; record the pick |
| `/ripple finish` | Color-safe assembly and delivery QA |
| `/ripple repair` | "Question 5 got cut off" → localized fix |
| `/ripple review` | HTML review page + independent QA pass |

Steering adjectives — "tighter", "punchier", "let it breathe" — are
operationalized protocols, not vibes.

## Principles

Everything is a file: transcripts, the edit manifest, QA snapshots. Renders
are derived artifacts. The agent looks at its work (frame sheets) after every
change, never trusts a single signal for a cut point, and never silently
converts color.

## Status

v0.1 — early. Built from lessons of real agent editing sessions. The
[Ripple app](https://github.com/conmeara/ripple-app) is the experimental
desktop bench this plugin distills.

## License

Apache-2.0
