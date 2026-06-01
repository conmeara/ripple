<p align="center">
  <img src="build/icon.png" alt="Ripple app icon" width="96" />
</p>

<h1 align="center">Ripple</h1>

<p align="center">
  <strong>Make motion graphics locally with HyperFrames, AI chat, frame comments, revisions, and export.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" /></a>
  <a href="https://github.com/conmeara/ripple/releases"><img alt="GitHub release downloads" src="https://img.shields.io/github/downloads/conmeara/ripple/total?label=downloads" /></a>
  <a href="https://github.com/heygen-com/hyperframes"><img alt="Built with HyperFrames" src="https://img.shields.io/badge/built%20with-HyperFrames-111111.svg" /></a>
  <a href="https://www.electronjs.org/"><img alt="Electron app" src="https://img.shields.io/badge/app-Electron-47848f.svg" /></a>
</p>

Ripple is an open-source desktop app for motion designers, editors, and anyone
who wants to make video without learning to code. It wraps
[HyperFrames](https://github.com/heygen-com/hyperframes) in a motion-design
workflow: create a project, preview compositions, leave frame-anchored
comments, ask an AI agent for changes, review the revision, and export a video.

The goal is simple: make agentic motion graphics feel like a creative app. The
interface handles project setup, local tools, Git, worktrees, render plumbing,
and agent context so users can stay focused on the video.

## What You Can Make

- Title cards, lower thirds, promo clips, social motion pieces, product
  explainers, and branded transitions.
- HTML/CSS/GSAP HyperFrames compositions with deterministic preview and render
  behavior.
- Local project folders that live by default under `~/Ripple`.
- Reviewable agent revisions that can be accepted, rejected, restored, or
  discussed in context.
- MP4, MOV, WebM, and PNG sequence exports through Ripple's main-process
  render/export services.

## Core Workflow

1. Create a new Ripple project or open an existing local HyperFrames project.
2. Pick a starter from the bundled template gallery, or start from a blank
   composition.
3. Preview the composition and timeline in the center of the app.
4. Leave frame/time comments the way you would in a creative review tool.
5. Ask Codex or Claude to make focused changes when agent support is configured.
6. Review the proposed revision, then accept or reject it.
7. Export a shareable render.

## Highlights

- **A creative interface with the hard parts installed** - a focused desktop
  app for projects, compositions, assets, templates, comments, revisions,
  renders, and export. Ripple stages the local tooling and abstracts Git,
  worktrees, dependency setup, and render plumbing away from the normal
  workflow.
- **HyperFrames-native motion** - Ripple treats HyperFrames as the source of
  truth for HTML compositions, timing, clips, preview, snapshots, and render
  behavior.
- **Agent tools for visual feedback** - Ripple includes app-managed context and
  CLI tooling, including the `ripple` CLI, so agents can inspect compositions,
  generate frame sheets, and see the motion work they are editing.
- **Comment system that abstracts worktrees** - frame comments can target the
  moment in the preview where feedback belongs. Behind the scenes, Ripple
  creates isolated revision workspaces, tracks the proposed change, and handles
  the accept, reject, restore, and merge flow.
- **Agent-assisted edits** - bring an existing Codex or Claude setup and use it
  from inside the motion workflow instead of switching into a developer tool.
- **Bundled template catalog** - the app includes 47 local HyperFrames starters
  and blocks for projects and compositions, with preview posters and motion
  previews.
- **Local-first by default** - projects, media, previews, revisions, and exports
  are local unless you explicitly connect an outside provider or service.

## Local-First And Privacy

Ripple should be useful before any sign-in, hosted account, GitHub connection,
or AI provider is configured. You can create/open projects, preview work, leave
comments, review revisions, import assets, and export locally without analytics
or a cloud workflow.

Agent-backed editing requires a supported provider connection. When an agent is
used, Ripple keeps work scoped to the active project or revision workspace and
routes privileged filesystem, preview, render, export, and source-write work
through typed Electron main-process APIs.

Anonymous analytics are opt-in and sanitized. See
[docs/privacy/analytics.md](docs/privacy/analytics.md) for the current policy.

## Build From Source

### Prerequisites

- [Bun](https://bun.sh/)
- Node.js 22 or newer for the HyperFrames render toolchain
- Python 3.11+ with `setuptools` for native Electron module rebuilds
- Xcode Command Line Tools on macOS
- FFmpeg/FFprobe for render paths; packaged workflows stage app-managed tools
  where possible

### First-Time Setup

```bash
bun install
bun run claude:download
bun run codex:download
bun run dev
```

`bun run dev` starts the Electron app with hot reload. The Claude and Codex
download steps stage local agent binaries used by provider features; provider
credentials are still configured by the user inside the app.

### Build And Package

```bash
bun run build
bun run package
```

Platform packaging commands are also available:

```bash
bun run package:mac
bun run package:win
bun run package:linux
```

Official release artifacts are built through
[.github/workflows/release.yml](.github/workflows/release.yml).

## Development

Use Bun unless a task explicitly requires another tool.

Common validation commands:

```bash
bun run test:ripple
bun test
bun run ts:check
bun run test:quality
bun run test:hyperframes
bun run test:e2e
```

Release-oriented validation:

```bash
bun run test:release
```

`bun run test:ripple` is the focused product regression suite for project
creation, HyperFrames integration, comments/revisions, conversations, agent
runtime, export, renderer shell behavior, and related utilities.

## Repository Map

- `src/main/` - Electron services, SQLite/Drizzle data, filesystem boundaries,
  HyperFrames orchestration, previews, renders, exports, revisions,
  conversations, provider runtime, CLI wrappers, and app updates.
- `src/preload/` - typed bridge between the renderer and Electron main process.
- `src/renderer/` - React UI for onboarding, project shell, templates,
  HyperFrames preview/timeline, comments, renders, agent chat, and settings.
- `src/shared/` - shared types, product models, and cross-process tests.
- `drizzle/` - database migrations.
- `resources/` - packaged binaries, CLI wrappers, browser bundle, agent skills,
  the bundled HyperFrames template catalog, and app-managed tooling that helps
  agents inspect their motion work.
- `test/quality/` and `test/e2e/` - broader workflow, quality, and Electron
  coverage.

## Contributor Notes

Ripple is a motion-design tool, not a developer workflow. In normal product
surfaces, prefer language like project, composition, preview, timeline, comment,
revision, proposal, accept, reject, and export. Keep Git, worktrees,
dependencies, provider plumbing, paths, and render internals in advanced or
debug contexts unless the user needs them to recover from a problem.

The main architectural boundary is:

- HyperFrames owns motion semantics: composition structure, timing, clips,
  player behavior, snapshots, and rendering.
- Ripple owns product workflow: project entry, browsing, preview chrome,
  comments, revisions, conversations, templates, exports, safety rules, and UI.
- Filesystem, process, preview, render, export, and source-write work belongs in
  the main process behind typed APIs.

For broader product context, read
[docs/Project Description.md](docs/Project%20Description.md),
[README-ripple.md](README-ripple.md),
[plans/v0/ROADMAP.md](plans/v0/ROADMAP.md), and
[plans/PLANS.md](plans/PLANS.md).

## Contributing

Issues, ideas, bug reports, and focused pull requests are welcome. For larger
features or significant refactors, start with an issue or an ExecPlan so product
intent, filesystem boundaries, privacy implications, and validation scope are
clear before implementation.

Open an issue at
[github.com/conmeara/ripple/issues](https://github.com/conmeara/ripple/issues).

## Acknowledgments

Ripple began as an adaptation of the
[1Code](https://github.com/21st-dev/1Code) desktop/chat/agent foundation by the
[21st.dev](https://21st.dev/) team. I am grateful for the Electron desktop,
chat, agent, provider, project-workspace, and revision groundwork that made this
direction possible.

Ripple's motion preview, composition, template, and render workflows are built
around [HyperFrames](https://github.com/heygen-com/hyperframes) by
[HeyGen](https://www.heygen.com/), an open-source HTML-based video rendering
framework for agent-authored motion work.

Thanks also to the projects and tools that make Ripple possible, including
Electron, Vite, React, Bun, FFmpeg/FFprobe, GSAP, Radix UI, Tailwind CSS, tRPC,
Drizzle, Monaco Editor, xterm.js, and the Claude/Codex agent ecosystems.

This project is not affiliated with, sponsored by, or endorsed by 21st.dev,
HeyGen, Anthropic, or OpenAI unless explicitly stated by those projects.

## License

Ripple is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for
details.
