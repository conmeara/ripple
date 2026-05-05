# Ripple

Ripple is a local-first desktop app for creating short motion graphics with
HyperFrames, plain-English chat, frame-anchored comments, reviewable revisions,
and export.

This repository started from the 1Code desktop/chat/agent foundation, but the
active product direction is Ripple: a motion-design tool that hides Git,
worktrees, dependency setup, provider setup, and render plumbing from the normal
creative workflow.

## What Ripple Does

- Create or open local HyperFrames projects under `~/Ripple`.
- Preview HTML/CSS/GSAP motion compositions with HyperFrames player/runtime
  paths.
- Browse compositions, assets, templates, comments, conversations, revisions,
  and renders from a dense desktop shell.
- Use Codex or Claude for agent-backed motion edits after the user explicitly
  configures a provider connection.
- Attach frame/time comments, run isolated revisions, and accept or reject
  proposed changes.
- Export MP4, MOV, and WebM renders through validated main-process paths.
- Check for packaged app updates through Ripple-owned GitHub Releases when the
  user chooses to check or enables automatic checks.

## Product Principles

- Core local use must work without sign-in, GitHub, repo setup, provider setup,
  or manual dependency installation.
- HyperFrames is the motion framework and source of truth.
- Renderer code should not launch privileged commands or trust arbitrary
  absolute paths; project, preview, render, export, asset, and revision work
  routes through typed main-process APIs.
- Primary UI language should say project, composition, asset, timeline, preview,
  comment, revision, proposal, accept, reject, and export.

## Development

Use Bun unless a task specifically requires another package manager.

```bash
bun install
bun run claude:download
bun run codex:download
bun run dev
```

Common validation commands:

```bash
bun run test:ripple
bun test
bun run ts:check
bun run build
bun run package
```

`bun run dev` starts the Electron app with hot reload. `bun run test:ripple`
runs the focused Ripple regression suite for project creation, HyperFrames,
comments/revisions, conversations, agent runtime, export, renderer shell, and
related utilities.

## Release Work

The v1 release gate is tracked in:

- `ROADMAP.md`
- `plans/phase-19-hardening-and-release-readiness.md`
- `docs/release/v1-release-checklist.md`

Official macOS release artifacts are built through the manual GitHub Actions
workflow in `.github/workflows/release.yml`. Local package commands are useful
for smoke checks, but signed/notarized update validation happens in CI and then
inside a packaged Ripple build.

## Repository Guides

- `AGENTS.md`: local agent instructions and implementation rules.
- `PLANS.md`: ExecPlan format and maintenance rules.
- `ROADMAP.md`: product direction, phase roadmap, testing strategy, and release
  criteria.
- `README-ripple.md`: architectural note on the Ripple/HyperFrames boundary.

## Feedback

Send feedback to [conor.omeara@icloud.com](mailto:conor.omeara@icloud.com) or
open a [GitHub issue](https://github.com/conmeara/ripple/issues/new).

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
