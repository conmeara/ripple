---
name: ripple-visual-context
description: Use when working inside a Ripple HyperFrames motion project after creating or editing visible motion, when visual inspection is needed, or when a compact frame sheet, current-frame snapshot, exact timestamp snapshot, or native Ripple visual tool would help verify the result.
---

# Ripple Visual Context

Use this skill when a Ripple motion project needs visual inspection, screenshots,
frame sheets, or render-aware context. Use it proactively after creating or
editing visible motion work, before you report that the visual change is done,
so you can inspect the result and make one correction pass if the snapshot or
sheet shows an obvious layout, timing, or blank-frame problem.

Inside Ripple app runs, the intended visual path is the app-managed native
Ripple visual tool. It returns the image directly in the tool result. Use that
native tool immediately when you need visual context; do not first use shell
commands, file lookup, browser/open/view_image tools, generic screenshots, or
video extraction.

Use this decision table:

- Current visible frame or "what is on screen now": native snapshot tool with
  `at=current`.
- One exact timestamp: native snapshot tool with `at=<timestamp>`, for example
  `at=1.25s`.
- Motion over time, a time range, or a requested frame sheet: native frame sheet
  tool with the requested range and a compact sample count.
- A different composition: pass a project-relative composition path only when
  needed; omit composition for the active/default composition.

For comment-generated changes, Ripple may already attach visual context to the
agent run: frame comments get a still frame, and range comments get a frame
sheet. Use that attached visual context first. Call a native Ripple visual tool
only when you need a fresher current frame, a different timestamp, more
temporal samples, or a different composition.

Normal chat runs do not receive automatic run-start images. Ask for visuals on
demand with the native Ripple visual tool. Comment-attached snapshots and frame
sheets are pre-edit context, not final verification after you change source.
After any visible edit, ask for a fresh current-frame snapshot or frame sheet
before claiming the visual change is done.

Ripple projects are HyperFrames projects. Use bundled HyperFrames skills and
CLI only for structure, linting, inspection, and export work:

Important: use the app-managed bare commands already on PATH. Do not run
`npx`, `npm create`, `bunx`, or dependency-install commands to get HyperFrames
or Ripple tooling during a Ripple agent run. Ripple already provides `ripple`,
`hyperframes`, `ffmpeg`, and `ffprobe` in the run environment.

- `hyperframes lint .` to validate composition structure. Do not run
  browser-backed `hyperframes validate` for routine edits unless the user
  explicitly asks for that validation.
- `hyperframes render .` when the user explicitly needs an exported video.

Only when the runtime does not expose native Ripple visual tools, use Ripple's
reversible visual commands from the project directory. This is a fallback path,
not the first move in Codex or Claude app runs:

```bash
ripple snapshot --at current --json
ripple frame-sheet --range 0s..8s --samples 8 --columns 4 --json
```

For fallback-only runs, Ripple puts the bare `ripple` command on the
app-managed PATH. Run it from the project directory unless you pass `--dir`.
Use `--composition <path>` only when you need a project-relative composition
other than the active one. Do not fall back to source-only reasoning unless
both the native visual tool and fallback CLI fail.

Do not use generic video extraction for normal HyperFrames composition state.
Use FFmpeg directly only when the user is asking about an already exported video
file rather than the source composition.
