# Phase 1: Local-First Boot

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, a fresh Ripple install opens into the app without requiring
sign-in, provider selection, GitHub, billing-method choice, or hosted account
state. A user should be able to launch the desktop app and reach a local
project-first entry point. Provider setup can still exist, but it must be
optional and triggered from settings or the first agent action that needs it.

This phase does not need to finish full Ripple project creation. That belongs to
Phase 2 in `ROADMAP.md`. The observable win for Phase 1 is that the old 1Code
boot gates are removed from the default path.

## Progress

- [x] 2026-04-24 / Codex: Created this ExecPlan from the current codebase state.
- [ ] Remove the main-process auth gate that loads `login.html` instead of the
  renderer.
- [ ] Remove renderer entry gates that force billing/provider onboarding before
  local app use.
- [ ] Preserve optional provider/auth setup for later explicit user actions.
- [ ] Validate with typecheck and an Electron smoke run.

## Surprises & Discoveries

- Observation: The main Electron window currently decides whether to load the
  app or `login.html` based on `AuthManager.isAuthenticated()`.
  Evidence: `src/main/windows/main.ts` checks auth near the renderer-loading
  block and loads `src/renderer/login.html` when unauthenticated.
- Observation: The renderer app currently gates local use on billing/provider
  onboarding before it checks for a selected project.
  Evidence: `src/renderer/App.tsx` routes through `BillingMethodPage`,
  `AnthropicOnboardingPage`, `CodexOnboardingPage`, and
  `ApiKeyOnboardingPage` before `SelectRepoPage` or `AgentsLayout`.
- Observation: The current project entry page is still repo-oriented.
  Evidence: `src/renderer/features/onboarding/select-repo-page.tsx` says
  "Select a repository" and offers "Select folder" and "Clone from GitHub".
  Replacing it with a Ripple create/open flow is Phase 2.

## Decision Log

- Decision: Phase 1 removes boot gates but does not complete the project model
  migration.
  Rationale: The roadmap separates local-first boot from Ripple project
  creation, and keeping Phase 1 narrow makes it easier to verify.
  Date/Author: 2026-04-24 / Codex.
- Decision: Keep auth, provider setup, and signed hosted-service helpers in the
  codebase for now, but stop letting them block local entry.
  Rationale: Ripple may still support optional accounts or providers; deleting
  those systems belongs to later rebrand/service-decoupling work.
  Date/Author: 2026-04-24 / Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

This repository is still mostly the 1Code Electron app. The Electron main
process creates browser windows in `src/main/windows/main.ts`. The renderer app
entry lives in `src/renderer/App.tsx`.

The main-process boot gate is in `src/main/windows/main.ts`. It obtains
`getAuthManager()`, calls `isAuthenticated()`, and loads the main renderer only
when authenticated. When unauthenticated it loads `login.html`. For Ripple, the
main renderer should load regardless of auth state.

The renderer boot gate is in `src/renderer/App.tsx`. `AppContent` reads
`billingMethodAtom`, provider-onboarding atoms, `selectedProjectAtom`, and
`trpc.projects.list`. It returns provider setup pages before it ever reaches the
project selection page. For Ripple, provider setup should not be part of app
entry. The renderer can still use the selected-project check, because the full
project-first create/open flow is Phase 2.

The temporary local entry point can remain the existing project page for this
phase, even though its language is repo-oriented. The replacement Ripple
create/open project surface is planned in Phase 2.

## Plan of Work

First, change `src/main/windows/main.ts` so `createMainWindow` always loads the
renderer with the existing window ID and optional chat/sub-chat URL parameters.
Keep the auth IPC handlers and `showLoginPage` helper available, because later
optional sign-in flows may still call them. Do not delete signed fetch behavior;
hosted requests can still return unauthenticated errors when the user has not
signed in.

Second, simplify `AppContent` in `src/renderer/App.tsx` so billing/provider
onboarding no longer blocks local entry. The app should validate the selected
project as it does today. If a valid project exists, render `AgentsLayout`. If
there is no valid project and projects are loaded, render the current
`SelectRepoPage` as the temporary Phase 1 project entry. Remove now-unused
imports and atom reads caused by deleting the provider gates.

Third, check for obvious follow-on TypeScript errors in onboarding imports,
atoms, and analytics. Keep provider onboarding components in the repository even
if no longer used from app entry.

Fourth, validate with typecheck and a dev Electron smoke run. The smoke run
should confirm that an unauthenticated fresh state reaches the renderer instead
of `login.html`, and that missing provider setup does not show
`BillingMethodPage`.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple`.

1. Inspect current status:

       git status --short

2. Edit `src/main/windows/main.ts`.

   In the renderer-loading section near the existing auth check, remove the
   conditional that branches to `login.html`. Build the same URL/hash params for
   all users and call `window.loadURL(...)` in dev or `window.loadFile(...)` in
   production. Keep devtools behavior for the first main window.

3. Edit `src/renderer/App.tsx`.

   Remove the default-entry returns for `BillingMethodPage`,
   `AnthropicOnboardingPage`, `CodexOnboardingPage`, and `ApiKeyOnboardingPage`.
   Keep selected-project validation. The target routing for this phase is:

       if (!validatedProject && !isLoadingProjects) return <SelectRepoPage />
       return <AgentsLayout />

   Remove unused imports, atom reads, setters, effects, and queries introduced
   only for the deleted provider gates.

4. Run typecheck:

       bun run ts:check

   Expected result: the command exits with code 0. If it fails, fix only errors
   caused by this phase unless the unrelated error blocks boot validation.

5. Run the app:

       bun run dev

   Expected result: the Electron app opens the renderer. It should not show
   `login.html`, `BillingMethodPage`, or a provider onboarding page as the first
   local screen.

6. Use Codex Computer Use or manual observation to verify the visible result.

   Expected observation with no selected project: the current project selection
   page appears. This page may still say repository in Phase 1.

7. Update this ExecPlan.

   Mark completed work in `Progress`, add any surprises, record decisions, and
   summarize validation in `Outcomes & Retrospective`.

## Validation and Acceptance

Acceptance for Phase 1:

- A fresh unauthenticated app launch loads the renderer instead of `login.html`.
- The renderer does not force the user through billing or provider onboarding.
- Existing selected-project state still opens the main app layout.
- Missing selected-project state reaches the temporary project entry page.
- Optional auth/provider code remains available for later explicit flows.
- `bun run ts:check` passes, or any failure is documented with a precise reason
  and follow-up.

Electron smoke validation should include:

- launch with `bun run dev`
- observe first visible screen
- verify no mandatory sign-in screen
- verify no mandatory provider-selection screen
- quit cleanly

## Idempotence and Recovery

These edits are safe to repeat. The main-process change should only affect which
page is loaded by default; it should not delete auth storage or provider
credentials.

If the renderer becomes blank, restore the previous app-loading block from Git
and retry with a smaller refactor that extracts a `loadRendererWindow` helper
before removing the auth branch.

If `AgentsLayout` assumes a selected project and crashes, keep the
`SelectRepoPage` fallback for no-project state and defer layout assumptions to
Phase 2.

If provider onboarding code becomes unreachable but still typechecks, leave it
in place. Later phases will move optional setup into settings or first-agent-run
flows.

## Interfaces and Dependencies

Existing interfaces used by this phase:

- `getAuthManager()` and auth IPC handlers in `src/main/windows/main.ts`.
- `selectedProjectAtom` and `selectedAgentChatIdAtom` in
  `src/renderer/features/agents/atoms`.
- `trpc.projects.list.useQuery()` in `src/renderer/App.tsx`.
- `SelectRepoPage` in `src/renderer/features/onboarding/select-repo-page.tsx`.
- `AgentsLayout` in `src/renderer/features/layout/agents-layout.tsx`.

This phase should not add database tables, HyperFrames routes, or a new project
creation API. Those belong to Phase 2 and Phase 3.

## Artifacts and Notes

Initial code observations:

- `src/main/windows/main.ts` has a renderer-loading block guarded by
  `isAuthenticated()`.
- `src/renderer/App.tsx` lists six boot outcomes in comments; the first four
  are billing/provider gates.
- `src/renderer/features/onboarding/select-repo-page.tsx` is the temporary
  no-project fallback until the Ripple create/open flow exists.
