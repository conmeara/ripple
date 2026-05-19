# Assets

Assets are the media files the user brings into a Ripple project.

The Assets tab should feel like a small media bin: images, videos, audio, fonts, and other useful project media that can support [[Preview]], [[Timeline]], [[Chats]], [[Comments]], and [[Exports]].

[Assets Screenshot: asset tab with imported images, videos, audio, and drop area]

## Asset Tab

Assets live beside [[Compositions]] in the left project pane.

The tab should show:

- Import media button.
- Drag/drop area.
- Asset rows or tiles with type icon.
- Filename.
- Size or duration when useful.
- Empty state when no media has been imported.

The tab should not show generated runtime files, vendor folders, hidden revision files, or app metadata as normal user assets.

## Importing Media

The user can click Import media or drag files into the Assets tab.

| Input | Expected behavior |
| --- | --- |
| Image | Copy into project-local assets and show image asset |
| Video | Copy into project-local assets and show video asset |
| Audio | Copy into project-local assets and show audio asset |
| Font | Copy if supported, otherwise explain unsupported status |
| Unsupported file | Reject with a readable message |
| Duplicate name | Resolve collision without overwriting silently |

Imports should copy files into the project. They should not link to fragile outside paths by default.

## Dragging To Timeline

Assets can be dragged onto [[Timeline]] when the timeline can place them safely.

Dropping an asset should show a placement preview, then insert it through main-process validation. If the asset cannot be inserted, the timeline should keep the project unchanged and show a small failure message.

## Attachments In Comments And Chat

Assets are different from one-off attachments.

A user can attach an image/file to a [[Comments|comment]] or [[Chats|chat]] as context without importing it as a reusable project asset. If the user wants to use that media in the motion piece, Ripple should import or copy it into the project assets explicitly.

## Safety

Asset operations should stay project-local.

- Reject symlink escapes.
- Validate source paths in the main process.
- Copy only supported media into approved project folders.
- Avoid overwriting without collision handling.
- Keep imports available offline after copy.

## What Good Looks Like

The user can bring in a logo, product shot, song, or clip and then ask Ripple to use it. They do not manage relative paths, asset URLs, or filesystem safety.

## Test Coverage

- `src/main/lib/hyperframes/project-browser.test.ts` - Scans visible media assets, skips generated/unsupported/symlinked files, and imports guarded image/video/audio assets.
- `src/main/lib/hyperframes/timeline-assets.test.ts` - Inserts project assets into the active composition through guarded timeline paths and rejects unsafe drops.
- `src/renderer/features/hyperframes/project-model.test.ts` - Classifies asset kinds, filters generated paths, formats sizes, and sorts display items.
- `src/renderer/features/agents/lib/agent-runtime-message-input.test.ts` - Preserves image/file attachments for agent sends and rejects malformed attachment bytes.
