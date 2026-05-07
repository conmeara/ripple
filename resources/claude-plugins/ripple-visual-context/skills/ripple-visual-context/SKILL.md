---
name: ripple-visual-context
description: Use when working inside a Ripple HyperFrames motion project after creating or editing visible motion, when visual inspection is needed, or when a compact frame sheet, screenshot, render-aware context, or Ripple CLI guidance would help verify the result.
---

# Ripple Visual Context

Use this skill when a Ripple motion project needs visual inspection, screenshots,
frame sheets, or render-aware context. Use it proactively after creating or
editing visible HyperFrames motion work, before you report that the visual change
is done, so you can inspect the result and make one correction pass if the sheet
shows an obvious layout, timing, or blank-frame problem.

Ripple projects are HyperFrames projects. Prefer the HyperFrames CLI and skills
for native motion-project work:

Important: use the app-managed bare commands already on PATH. Do not run
`npx`, `npm create`, `bunx`, or dependency-install commands to get HyperFrames
or Ripple tooling during a Ripple agent run. Ripple already provides `ripple`,
`hyperframes`, `ffmpeg`, and `ffprobe` in the run environment.

- `hyperframes compositions .` to list compositions.
- `hyperframes inspect .` to inspect layout and timing.
- `hyperframes lint .` to validate composition structure.
- `hyperframes doctor .` to check the local render environment.
- `hyperframes snapshot --at 1.25,2.5 .` for exact still frames.
- `hyperframes snapshot --frames 5 .` for quick evenly spaced still frames.
- `hyperframes render .` when the user explicitly needs an exported video.

Use Ripple's visual commands when you need a compact overview across time,
one exact still, or a small context bundle:

```bash
ripple sheet --range 2s..8s --samples 8 --backend engine --json
ripple sheet --range 2s..8s --every 1s --backend engine --json
ripple snapshot --at current --backend engine --json
ripple snapshot --at 1.25s --backend engine --json
ripple context --range 2s..8s --backend engine --json
```

Ripple puts the bare `ripple` command on the app-managed PATH for Codex and
Claude runs. Run it from the project directory unless you pass `--dir`.
Use `--at current` when the user asks what is visible in the app right now.

Default first move for a visual sanity check, after visible edits, or when you
need to understand motion over time:

```bash
ripple sheet --range 0s..8s --samples 8 --columns 4 --settle 0 --backend engine --json
```

If the project duration is clearly shorter or longer, adjust the range. In
Codex app-server runs, local image-view tools may be unavailable even though
file generation works. Do not call `view_image`, `open`, or browser tools just
to inspect a generated sheet unless the runtime has explicitly provided image
viewing. Still generate the sheet and report the sheet path plus any manifest
details you used. Do not fall back to source-only reasoning unless the CLI
fails.

`ripple sheet` is optimized for agent review by default: it captures at
the final sheet cell size instead of making full-resolution screenshots first.
The default 4-column, 8-sample sheet is a good first look for Codex and Claude:
it is about 1440px wide, keeping 16:9 cells just over 200px tall while staying
below common model image-resize thresholds. Use `--max-sheet-width 960` for
faster, smaller sheets, or
`--backend producer-capture` only when you specifically need Producer-backed
correctness validation instead of the default Engine capture path.

Frame sheets write under `.ripple/frame-sheets/<id>/` in the current project.
Read `manifest.json` to map sheet cells to timestamps and frame numbers.
Snapshots write under `.ripple/visual-context/snapshots/<id>/`. Start with
small sheets; request more samples only when the task needs more temporal
detail.

Do not use generic video extraction for normal HyperFrames composition state.
Use FFmpeg directly only when the user is asking about an already exported video
file rather than the source composition.
