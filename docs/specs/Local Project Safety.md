# Local Project Safety

Local Project Safety is the trust contract behind Ripple's local-first model.

Ripple works with real files on the user's machine. It can create projects, copy assets, run agents, preview motion, render exports, and apply proposed changes. Every one of those actions should respect project boundaries and user intent.

[Safety Screenshot: confirmation dialog before moving project files to Trash]

## Normal Safety Rules

- Create projects under `~/Ripple` by default.
- Keep imported [[Assets]] inside the project.
- Use Main for accepted project state.
- Use isolated proposed versions for [[Comments]] and some [[Chats]].
- Do not edit Main before Accept.
- Validate paths in the main process.
- Do not let renderer code launch privileged commands.
- Do not trust arbitrary absolute paths from UI.

## Hidden Git And Worktrees

Ripple can use Git and worktrees as hidden infrastructure. The normal user should see:

- Main.
- Proposed changes.
- Accept.
- View Main.
- Open in Chat.
- Restore/Delete.

They should not see branch names, commit hashes, worktree paths, or merge mechanics unless they intentionally open an advanced/debug view.

## Filesystem Actions

| Action | Safety behavior |
| --- | --- |
| Create project | Sanitize name and avoid collisions |
| Open existing project | Validate project structure before adding |
| Import asset | Copy into project, reject unsafe sources |
| Export | Write to safe output path |
| Remove from Ripple | Remove app record only |
| Move files to Trash | Explicit typed-name confirmation |
| Accept proposal | Apply only after safe isolated acceptance |

## Agent Boundaries

Agents should run inside the active project or registered proposal workspace. If Ripple cannot create or validate an isolated revision workspace, it should fail closed.

Failing closed means showing a recoverable failure, not quietly running the agent against Main.

## Stale Work

When Main changes, stale proposed revisions must become safe before acceptance. They can update, replay, or require attention. They should not keep a normal Accept button while based on old Main.

See [[Revisions]] and [[Comments#When Main Changes]].

## What Good Looks Like

The user can trust that Ripple will not accidentally overwrite their accepted project or delete local files. Powerful local behavior exists, but user intent controls when changes land.

## Test Coverage

- `src/shared/path-boundary.test.ts` - Accepts descendants and rejects sibling/cross-drive path escapes.
- `src/main/lib/git/worktree-config.test.ts` - Stores hidden setup config under `.ripple` and avoids writing legacy config paths.
- `src/main/lib/ripple-projects/project-git.test.ts` - Initializes/refreshes managed baselines, preserves user rules, and avoids dirty unmanaged repositories.
- `src/main/lib/hyperframes/package-config.test.ts` - Guards packaged HyperFrames versions, asset import lifecycle, preview/render dependencies, and app-managed binaries.
- `src/main/lib/ripple-projects/lifecycle.test.ts` - Validates trash/remove safety for local project folders.
- `src/main/lib/hyperframes/project-browser.test.ts` - Rejects symlinked asset source and destination escapes during import.
- `src/main/lib/hyperframes/timeline-edits.test.ts` - Rejects timeline edits against composition sources outside the project.
- `src/main/lib/visual-context/project-server.test.ts` - Denies visual-context traversal, hidden/generated paths, credential-like files, and symlink escapes.
