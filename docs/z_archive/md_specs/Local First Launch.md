# Local First Launch

Ripple should open as a usable local motion app before asking for accounts, providers, billing, GitHub, or hosted services.

On first launch, the user should see [[Project Entry]] with optional [[Onboarding]] layered over it. On later launches, Ripple should restore the last useful project when possible, or return to project entry when there is no valid selection.

[Launch Screenshot: fresh app showing project entry without sign-in]

## First Launch

The first visible path is not "sign in" or "connect provider." It is a local project path.

Expected behavior:

- App renderer opens even when no hosted account exists.
- No billing, provider, GitHub, clone, repository, or auth gate blocks entry.
- First-run onboarding is a compact dialog, not a full-page blocker.
- The user can dismiss onboarding and still create or open a project.
- Missing Codex or Claude setup only matters when the user tries to run an agent.

## Returning Launch

When the user comes back, Ripple should try to put them where they were working.

| Situation | Expected result |
| --- | --- |
| Last selected project is valid | Open the Ripple shell for that project |
| Last selected project was archived | Open project entry with restore options |
| Project folder is missing | Explain that the project cannot be found |
| Local metadata needs repair | Repair quietly or show a recoverable message |
| Provider setup is missing | Keep project work available |
| Update/analytics services are unavailable | Ignore for core local work |

## Launch Copy

Launch copy should say what the user can do, not what the app is bootstrapping.

Good: "Create a project", "Open Existing Project", "Local files are saved in ~/Ripple".

Avoid in primary UI: repository, clone, branch, worktree, Node, dependency install, FFmpeg, hosted API, billing method.

## Underneath

Ripple can repair local database drift, load packaged resources, register preview protocols, resolve app-managed tools, and migrate old local settings during startup.

Those repairs should be boring. If something requires action, route the user to a clear recovery state in [[Failure Recovery]].

## Failure Cases

| Problem | UX behavior |
| --- | --- |
| App resources missing | Show a readable app readiness error and retry path |
| Project database damaged | Preserve local files and offer repair/reopen |
| Hosted service unavailable | Do not block local project entry |
| Update provider missing | Hide update download behavior, keep manual checks readable |
| Provider auth expired | Show setup needed only when agent work starts |

## What Good Looks Like

A fresh install feels ready. The user can make or open a motion project without proving anything to a server. Optional services are helpful later, but launch belongs to local creative work.

## Test Coverage

- `src/main/auth-manager.test.ts` - Proves local startup does not decrypt hosted auth when no hosted API is configured.
- `src/main/lib/db/index.test.ts` - Repairs drifted local development databases without blocking startup.
- `src/main/lib/packaged-assets.test.ts` - Resolves packaged and development assets from the correct app locations.
- `src/main/lib/ripple-projects/environment.test.ts` - Checks local/app-managed runtime readiness without throwing or blocking on warnings.
- `src/main/lib/hyperframes/runtime.test.ts` - Resolves app-managed HyperFrames, FFmpeg/FFprobe, browser, and local-first runtime environment without downloads.
