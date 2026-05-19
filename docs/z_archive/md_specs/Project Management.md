# Project Management

Project Management covers the project rail, project switching, and lifecycle actions for local Ripple projects.

A project is the user's motion workspace. It contains compositions, assets, comments, chats, revisions, exports, and hidden local history. The project rail should make that feel like selecting creative work, not selecting repositories.

[Project Management Screenshot: project rail with active, archived, and recent projects]

## Project Rail

The project rail should show compact project rows with project names and useful status. It should not show local filesystem paths by default.

Selecting a project should:

- Open the existing project shell.
- Restore the last useful [[Compositions|composition]].
- Keep [[Preview]] and [[Timeline]] pointed at that project.
- Reopen or reuse the project conversation where appropriate.
- Clear draft/chat state from the previous project when needed.

Switching projects should not create duplicate project records or duplicate local conversations.

## Project Personalization

Projects can have lightweight identity so the rail feels like a creative workspace list, not a folder dump.

Expected behavior:

- Project names remain the primary label.
- Optional project icons or thumbnails can appear beside the name.
- Uploading or removing a project icon should be explicit and reversible.
- Hidden icon file storage should not appear as normal project source work.
- Appearance settings can control whether project icons are visible.

If an icon is missing or invalid, Ripple should fall back to a plain project mark and keep the project usable.

## New Project

New Project takes the user back to [[Project Entry]]. If another project is open, Back should return to the previous valid project.

Keyboard/menu New Project should use the same route as the visible button so tests and users see one behavior.

## Lifecycle Actions

| Action | Meaning | User safety |
| --- | --- | --- |
| Archive | Hide from normal project list | Can restore later |
| Restore | Bring archived project back | Opens the same local project |
| Remove from Ripple | Forget the app record only | Does not delete files |
| Move files to Trash | Delete local project files through OS Trash | Requires typed-name confirmation |

Destructive actions need clear confirmation. The confirmation should name the project and explain whether files will remain on disk.

## When The Active Project Changes

Ripple should treat project switching as a context boundary.

- Preview source returns to the selected project's Main.
- Active composition comes from that project's saved state.
- Active conversation chips are project-specific.
- Comment/revision badges belong to the selected project.
- Renders list belongs to the selected project.
- Open provider runs from a previous project should not leak into the new one.

## Multiple Windows

Opening a chat in a new window can help the user keep review context visible. Ripple should prevent two live windows from owning the same chat at the same time.

Expected behavior:

- Open in new window carries the selected project/chat context.
- A second active window should not silently duplicate ownership of the same chat.
- Closed or crashed windows release ownership so the chat can reopen.
- Project switching in one window should not corrupt another window's selected chat.

## Archived And Missing Projects

Archived projects should not appear in normal chat/project lists. They can appear in restore flows.

If a project folder is missing, Ripple should not silently remove the project. It should explain that the local folder cannot be found and let the user remove the record or reopen the moved folder.

## What Good Looks Like

The user feels like they are moving between creative projects. Ripple quietly handles local records, folders, conversations, and hidden history without making the rail feel like a source-control interface.

## Test Coverage

- `src/main/lib/ripple-projects/lifecycle.test.ts` - Guards archive/remove/trash lifecycle safety and rejects dangerous folders.
- `src/main/lib/ripple-projects/chat-reuse.test.ts` - Reuses only valid active local project chats and deduplicates legacy/Ripple paths.
- `src/main/windows/chat-ownership.test.ts` - Prevents two windows from owning the same chat and reclaims stale ownership.
- `src/renderer/features/sidebar/project-chat-selection.test.ts` - Selects the latest active local project chat without reusing archived or mismatched chats.
- `src/renderer/features/agents/utils/selected-project.test.ts` - Preserves Ripple project metadata and rejects projects without a usable local path.
