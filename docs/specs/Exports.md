# Exports

Exports turn the current motion work into a shareable video file.

The user should not need to learn render commands or pipeline details. They open Renders, choose what to export, pick a practical format/quality, start the job, and open or reveal the completed file.

[Export Screenshot: Renders pane with source, format, quality, and export queue]

## Renders Pane

Renders opens in the right pane, like [[Chats]] and [[Comments]]. It should not steal the whole workspace unless the user chooses a larger utility view.

The pane should show:

- Selected composition/source.
- Main vs Current Preview choice when a proposal is being previewed.
- Format selector.
- FPS selector.
- Quality selector where meaningful.
- Export action.
- Active job count.
- Queue/history rows.

## Export Source

Source matters.

| User choice | Expected result |
| --- | --- |
| Main | Export accepted project state |
| Current Preview | Export the comment/chat proposal currently shown in [[Preview]] |

If Current Preview is not available, the option should be disabled or hidden. Export should never silently fall back to Main when the user chose proposed changes.

## Formats

Supported first-class formats are MP4, MOV, and WebM when the packaged runtime can produce them.

Default should favor MP4 because it is the most shareable. MOV can use fixed ProRes-style quality where quality choices do not apply. WebM should be available when validated.

## Job Rows

Each job row should make status and next action obvious.

| Status | User can do |
| --- | --- |
| Queued/preparing/running | Watch progress, cancel |
| Completed | Open, Reveal, Remove |
| Failed/interrupted | Read concise error, Retry, Remove |
| Cancelled | Remove or retry if supported |

Completed rows should show enough file facts to build confidence: format, FPS, size/duration when available, output label/path summary.

## Output Location

Default output belongs under the project-local `exports/` folder. If the user chooses a destination, Ripple should still validate the path through the main process.

Open should open the video file. Reveal should show it in Finder. Remove should remove the job row and only delete output when explicitly designed to do so.

## Errors And Recovery

Export failures should keep the job row. The user should see what failed and what to try next, not a disappearing toast.

Examples:

- Missing runtime: route to [[Failure Recovery]].
- Invalid source: ask the user to return to Main or refresh proposed changes.
- Cancelled job: show Cancelled, not Failed.
- App restart during export: mark interrupted and allow retry.

## What Good Looks Like

The user can export exactly what they are looking at, especially a proposed version, and trust that the file came from the selected composition/source. Rendering feels like a product action, not a terminal command.

## Test Coverage

- `src/shared/ripple-exports.test.ts` - Normalizes progress, product-visible paths, defensive settings parsing, and compact file facts.
- `src/main/lib/exports/service.test.ts` - Persists Producer-backed jobs, validates paths, exports chat preview sources, retries, cancels, and recovers interrupted work.
- `src/main/lib/hyperframes/render-manager.test.ts` - Covers low-level render completion and cancellation primitives.
- `src/renderer/features/renders/export-target.test.ts` - Defaults to Main, enables Current Preview only when available, and names composition/export targets.
