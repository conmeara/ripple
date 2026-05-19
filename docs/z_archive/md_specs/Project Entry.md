# Project Entry

Project Entry is the front door to Ripple. It should be about motion projects, not repositories.

The primary action is Create Project. The secondary action is Open Existing Project. If archived projects are the only available projects, the screen should also make restoration possible.

[Project Entry Screenshot: create project form with template gallery and open existing project button]

## Create Project

The user enters a project name, optionally chooses a [[Templates|template]], and clicks Create Project.

Expected behavior:

- The project name field is focused unless [[Onboarding]] is open.
- Create Project is disabled until the name is non-empty.
- The default save location is `~/Ripple`.
- Ripple sanitizes the folder name and handles collisions safely.
- The selected template controls the starting project dimensions and first composition.
- The project opens immediately after creation.

The user should not choose a Git repository, clone from GitHub, install dependencies, or pick a runtime.

## Template Selection

The template gallery belongs on the creation screen because choosing a starting point is a creative decision.

Cards should show poster, name, description, category, duration, aspect ratio, and hover/focus motion preview where available. Blank stays available as the simplest starting point.

See [[Templates]].

## Open Existing Project

Open Existing Project launches the system folder picker and validates the selected folder as a usable Ripple/HyperFrames project.

| Folder condition | Result |
| --- | --- |
| Valid Ripple project | Add or refresh project record and open it |
| Valid HyperFrames project | Import as local Ripple project when safe |
| Missing required files | Explain what is missing |
| Malformed `hyperframes.json` | Reject with a readable message |
| Outside allowed safety boundary | Reject without exposing stack traces |

Opening should refresh compositions, prune removed composition rows, and show setup warnings only when needed.

## Archived Projects

If all known projects are archived, Project Entry should show an Archived projects section with Restore actions.

Restore should bring the project back into the normal project list and open it. It should not duplicate the project or create a new folder.

## Hidden Work

Behind the scenes, project creation can write files, initialize hidden history, create `.ripple` metadata, install app-managed notes, resolve HyperFrames runtime pieces, and seed a local conversation.

The UI should summarize this as local project setup. If something is incomplete, use a calm warning and keep the project usable when possible.

## What Good Looks Like

The first creative decision is "what am I making?" not "what repo do I connect?" A new user can name a project, pick a starter, and land in a previewable workspace in one motion.

## Test Coverage

- `src/main/lib/ripple-projects/paths.test.ts` - Protects default Ripple project paths, name sanitization, and collision-safe folder behavior.
- `src/main/lib/ripple-projects/types.test.ts` - Keeps aspect ratio presets and default 1080p/30fps starter settings aligned with create-project inputs.
- `src/main/lib/ripple-projects/scaffold.test.ts` - Writes offline HyperFrames starter/template projects and avoids overwriting unrelated folders.
- `src/main/lib/ripple-projects/metadata.test.ts` - Validates project metadata reads/writes used when opening and refreshing local projects.
- `src/renderer/features/agents/lib/agents-actions.test.ts` - Routes New Project shortcuts into the same project-entry flow.
- `test/e2e/project-entry.e2e.ts` - Skips setup, creates a blank project, opens preview, and exposes export controls in Electron.
