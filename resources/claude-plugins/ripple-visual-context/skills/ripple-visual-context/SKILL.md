---
name: ripple-visual-context
description: Use when working inside a Ripple HyperFrames motion project after creating or editing visible motion, when visual inspection is needed, or when a compact frame sheet, screenshot, render-aware context, or Ripple CLI guidance would help verify the result.
---

# Ripple Visual Context

Use this skill when a Ripple motion project needs visual inspection, screenshots,
frame sheets, or render-aware context. Use it proactively after creating or
editing visible motion work, before you report that the visual change is done,
so you can inspect the result and make one correction pass if the snapshot or
sheet shows an obvious layout, timing, or blank-frame problem.

Inside Ripple, the best visual tools for agents are the app-managed `ripple
snapshot` and `ripple frame-sheet` commands. They are app-aware, support
current-frame snapshots, exact timestamp snapshots, and compact frame sheets,
and return clean JSON without local preview plumbing.

For comment-generated changes, Ripple may already attach visual context to the
agent run: frame comments get a still frame, and range comments get a frame
sheet. Use that attached visual context first. Run `ripple snapshot` or
`ripple frame-sheet` when you need a fresher current frame, a different
timestamp, more temporal samples, or a different composition.

Prepared visual context is captured when the run starts. Treat prepared
snapshots and frame sheets as pre-edit context, not final verification after
you change source. After any visible edit, run a fresh `ripple snapshot --at
current --json` for the live app frame or a fresh `ripple frame-sheet ...` for
motion across time before claiming the visual change is done.

Ripple projects are HyperFrames projects. Use the bundled HyperFrames CLI and
skills for native motion-project structure, linting, inspection, and export
work:

Important: use the app-managed bare commands already on PATH. Do not run
`npx`, `npm create`, `bunx`, or dependency-install commands to get HyperFrames
or Ripple tooling during a Ripple agent run. Ripple already provides `ripple`,
`hyperframes`, `ffmpeg`, and `ffprobe` in the run environment.

- `hyperframes compositions .` to list compositions.
- `hyperframes inspect .` to inspect layout and timing.
- `hyperframes lint .` to validate composition structure. Do not run
  browser-backed `hyperframes validate` for routine edits unless the user
  explicitly asks for that validation.
- `hyperframes doctor .` to check the local render environment.
- `hyperframes snapshot --at 1.25,2.5 .` only when you need raw HyperFrames
  stills instead of Ripple's app-aware visual context.
- `hyperframes snapshot --frames 5 .` only when you need raw HyperFrames
  evenly spaced stills instead of Ripple's app-aware visual context.
- `hyperframes render .` when the user explicitly needs an exported video.

Use Ripple's visual commands when you need the current app frame, one exact
still, or a compact overview across time:

```bash
ripple snapshot --at current --json
ripple snapshot --at 1.25s --json
ripple frame-sheet --range 2s..8s --samples 8 --json
ripple frame-sheet --range 2s..8s --every 1s --json
```

Ripple puts the bare `ripple` command on the app-managed PATH for Codex and
Claude runs. Run it from the project directory unless you pass `--dir`.
Use `--at current` when the user asks what is visible in the app right now.
`--at current` requires live Ripple app visual context; do not substitute
pre-edit prepared handoff files for the current app frame.
Fresh frame sheets must also come from `ripple frame-sheet`; do not use
run-start prepared sheets as post-edit verification.
Use `--composition <path>` when you need a snapshot or sheet for a composition
other than the active one.

Default first move for a visual sanity check, after visible edits, or when you
need to understand motion over time:

```bash
ripple frame-sheet --range 0s..8s --samples 8 --columns 4 --json
```

If the project duration is clearly shorter or longer, adjust the range. In
Codex app-server runs, local image-view tools may be unavailable even though
file generation works. Do not call `view_image`, `open`, or browser tools just
to inspect a generated sheet unless the runtime has explicitly provided image
viewing. Still generate the sheet and report the sheet path plus any manifest
details you used. Do not fall back to source-only reasoning unless the CLI
fails.

`ripple frame-sheet` is optimized for agent review by default: it captures at
the final sheet cell size instead of making full-resolution screenshots first.
The default 4-column, 8-sample sheet is a good first look for Codex and Claude:
it is about 1440px wide, keeping 16:9 cells just over 200px tall while staying
below common model image-resize thresholds. Use `--max-sheet-width 960` for
faster, smaller sheets.

Frame sheets write under `.ripple/frame-sheets/<id>/` in the current project.
Read `manifest.json` to map sheet cells to timestamps and frame numbers.
Snapshots write under `.ripple/visual-context/snapshots/<id>/`. Start with
small sheets; request more samples only when the task needs more temporal
detail.

Do not use generic video extraction for normal HyperFrames composition state.
Use FFmpeg directly only when the user is asking about an already exported video
file rather than the source composition.
