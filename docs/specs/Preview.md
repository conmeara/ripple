# Preview

Preview is the center of Ripple.

The user watches the motion piece here, plays and pauses, scrubs time, compares Main against proposed changes, selects comment markers, and confirms whether the work feels right.

[Preview Screenshot: Main preview with floating controls, timecode, and timeline visible]

## Preview Sources

It should always be clear what the user is viewing.

| Source | Meaning |
| --- | --- |
| Main | The accepted project state |
| Comment proposal | A proposed version from [[Comments]] |
| Chat proposal | A proposed version from [[Chats]] |

When the user is viewing proposed changes, the interface should offer a clear way to View Main. Switching back should not lose the user's time.

[Preview Screenshot: proposed changes with View Main comparison control]

## Player Controls

The player should feel like a motion review tool.

Expected controls:

- Play / pause.
- Restart.
- Step backward / forward by frames when available.
- Loop.
- Playback speed.
- Mute.
- Caption overlay toggle when relevant.
- Timeline visibility.
- Refresh.
- Zoom / fit options.
- Fullscreen.

Controls should be compact, icon-forward, tooltip-backed, and close to the preview. Avoid a big top header that pushes the motion piece down.

## Scrubbing And Time

Preview time is a shared creative reference. It feeds [[Timeline]], [[Comments]], [[Chats]], [[Visual Context]], and [[Exports]].

Expected behavior:

- Playing preview updates the current time and timeline playhead.
- Scrubbing preview seeks the motion piece.
- Spacebar toggles playback when the user is not typing.
- Starting a new chat should not reset preview to `00:00`.
- Switching Main/proposed sources should preserve or intentionally seek to the relevant comment anchor.
- Small player rounding updates should not erase a just-requested frame seek.

## Comment Markers

Comment markers can appear over or near the preview timeline so users can jump back to review notes.

Selecting a comment marker should open [[Comments]], select the thread, and seek to the anchored frame or range. If a proposed version is ready, the preview can switch to that proposal.

## Loading And Errors

Preview source handoffs should be smooth.

| State | UX behavior |
| --- | --- |
| Preparing briefly | Keep previous frame visible when safe |
| Preparing longer | Show subtle "Preparing preview" state |
| Source changed | Swap only after target source is ready or settled |
| Error | Show retry/refresh and keep project context |
| Missing composition | Explain and point to [[Compositions]] or [[Failure Recovery]] |

Do not flash frame zero during comment/main switching.

## Source Refresh

When Ripple or an external editor changes project source files, the preview-facing project data should refresh without the user hunting for a reload button.

Expected behavior:

- Agent edits update the project browser, preview source, timeline data, and visual-context cache through one refresh path.
- External source changes are noticed when they affect watched HyperFrames files.
- Generated/dependency folders do not spam refreshes.
- The current playhead intent should survive refresh unless the selected composition or source truly disappears.

Manual Refresh still exists as a recovery action, but the normal experience should feel live.

## Underneath

Ripple uses a main-process-approved HyperFrames player source. The renderer should not invent preview paths or pass arbitrary project files. The preview can prewarm likely sources and cache prepared documents, but that should only make the UI feel faster.

## What Good Looks Like

The user trusts the preview as the source of truth. They can compare Main and proposed changes at the right frame without thinking about source handoff, render paths, or runtime documents.

## Test Coverage

- `src/main/lib/hyperframes/player-source.test.ts` - Builds approved preview sources, local runtime references, asset content types, and composition selection without absolute paths.
- `src/main/lib/hyperframes/preview-manager.test.ts` - Tracks preview startup, idempotent stop, readiness timeouts, and startup errors.
- `src/main/lib/hyperframes/snapshot.test.ts` - Resolves snapshot artifacts and explicit timestamps for preview-related captures.
- `src/main/lib/hyperframes/source-watcher.test.ts` - Watches HyperFrames source files while excluding generated/dependency folders.
- `src/main/lib/hyperframes/source-watcher-ipc.test.ts` - Subscribes to the resolved preview context and cleans up window subscriptions.
- `src/renderer/features/hyperframes/player-source-url.test.ts` - Preserves reload query params, thumbnail sandboxing, and local player-source CSP.
- `src/renderer/features/hyperframes/preview-coordinator.test.ts` - Bounds prepared preview documents and avoids owning playback semantics.
- `src/renderer/features/hyperframes/preview-player-controls.test.ts` - Protects player controls, responsive toolbar density, source handoff, seek settling, spacebar playback, and loading delay behavior.
- `src/renderer/features/hyperframes/preview-scrubber.test.ts` - Resolves and clamps scrubber pointer positions like the player controls.
- `src/renderer/features/hyperframes/source-refresh-integration.test.ts` - Reloads preview-facing queries through one refresh path.
- `src/renderer/features/hyperframes/use-hyperframes-source-change-listener.test.ts` - Invalidates preview queries before notifying the player.
- `src/renderer/features/ripple-shell/ripple-preview-context.test.ts` - Switches Main/comment/chat preview sources without losing time or selected context.
- `src/renderer/features/ripple-shell/ripple-preview-time.test.ts` - Preserves exact comment frame timing and ignores loader zeroes during non-zero seeks.
