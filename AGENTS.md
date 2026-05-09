# Repository Guidelines

## Project Structure & Module Organization

Ripple is a Bun + Electron/Vite desktop app for local-first HyperFrames motion projects. `src/main/` owns Electron services, data, filesystem, exports, agent runtime, and HyperFrames orchestration; `src/preload/` exposes the bridge; `src/renderer/` contains the React UI; `src/shared/` holds shared types. Migrations are in `drizzle/`; packaged assets, CLI wrappers, browser bundles, skills, and templates are in `resources/`. Tests live beside code as `*.test.ts(x)`, with broader suites in `test/quality/` and `test/e2e/`.

## Product Context

Ripple is a motion-design tool, not a developer workflow. Primary users are motion designers, editors, marketers, founders, and agency teams creating title cards, lower thirds, promos, and explainers. Keep normal UX language focused on projects, compositions, preview, comments, revisions, and export. Hide Git, worktrees, dependencies, installs, and provider plumbing unless the surface is explicitly advanced/debug.

## Build, Test, and Development Commands

Use Bun unless a task explicitly requires another tool. Key commands:

- `bun install`: install dependencies and rebuild native Electron modules.
- `bun run dev`: start the Electron app with hot reload.
- `bun run build`: build main, preload, and renderer output.
- `bun run package`: stage bundled assets and create an Electron package.
- `bun test`: run all Bun tests.
- `bun run test:ripple`: run the focused Ripple regression suite.
- `bun run test:quality`: verify workflow coverage and fixtures.
- `bun run test:e2e`: build, then run Playwright Electron tests.
- `bun run ts:check`: run TypeScript without emitting files.

## Coding Style & Naming Conventions

Use strict TypeScript (`tsconfig.json`) and React's automatic JSX runtime. Prefer existing Electron, tRPC, Drizzle, React Query, Zustand/Jotai, Radix, and Tailwind patterns. Keep filesystem, process, preview, render, export, and source-write work in the main process behind typed APIs; renderer code should not launch privileged commands or trust arbitrary absolute paths. Use `PascalCase.tsx` for components, `kebab-case.ts` for utilities/services, and `kebab-case.html` for HyperFrames templates. There is no dedicated lint script; use `bun run ts:check`, focused tests, and `git diff --check`.

## Testing Guidelines

Add targeted coverage beside the code you change, then choose broader suites by impact: `test:ripple` for product regressions, `test:agent` for provider/runtime work, `test:hyperframes` or `test:export` for motion/export changes, and Playwright E2E for user workflows.

## Commit & Pull Request Guidelines

Keep commits scoped and describe user-visible behavior, tests, or release impact when needed. PRs should include a summary, linked issue or plan, validation commands, UI screenshots/recordings, and notes for packaging, update, privacy, or filesystem-boundary risks.
