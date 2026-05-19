# Timeline

Timeline is the detailed time surface under [[Preview]].

It lets the user understand what happens when, scrub the motion piece, select ranges for [[Comments]], and make guarded timing edits without opening full HyperFrames Studio.

[Timeline Screenshot: clips, tracks, playhead, zoom controls, and selected range]

## What The User Sees

The timeline should show:

- Ruler and playhead.
- Tracks grouped by motion/media type.
- Clip blocks with readable labels.
- Current frame/time indicator.
- Zoom controls.
- Range selection.
- Selected clip state.
- Asset drop placement when dragging from [[Assets]].

It should look integrated with the preview, not like a separate card below it.

## Scrubbing

The user can click or drag the timeline to seek preview time.

Preview playback should move the playhead smoothly without forcing React to repaint the whole timeline every frame. Scrubbing should feel direct, with one visible playhead/thumb instead of duplicate markers.

## Range Selection

Range selection is how a user says "this part" before leaving a comment.

Expected behavior:

- Shift-drag or equivalent gesture creates a range.
- The selected range feeds the [[Comments]] composer.
- Moving/resizing clips clears range overlays when appropriate.
- Comment creation should preserve the selected time/range even if the agent work starts later.

## Clip Editing

Ripple can support simple guarded timeline edits on Main.

| Gesture | Expected behavior |
| --- | --- |
| Click clip | Select clip and reveal its timing context |
| Move horizontally | Change start time when patchable |
| Move vertically | Change track/row when patchable |
| Trim right edge | Change duration when patchable |
| Trim left edge | Adjust clip boundary; media playback offset only for media |
| Drop asset | Insert asset at previewed placement |

Edits should preview optimistically, commit through main-process source validation, and avoid snapping back while the refreshed model settles.

If a clip is not safely patchable, the UI should not offer misleading handles.

## Comfort State

Timeline should remember user comfort per project/composition where useful:

- Zoom mode.
- Manual zoom percent.
- Scroll position.
- Selected clip only when still valid.

Changing composition should load the right comfort state without implying one global timeline store.

## State Layers

Timeline state is layered:

- Durable project state: selected composition.
- Shell state: preview source and selected comment.
- Player state: live time, duration, ready/playing.
- Timeline UI state: zoom, scroll, local selection, edit gesture.

Agents should not collapse these into one store in specs or tests. Bugs often come from updating the wrong layer.

## What Good Looks Like

The user can feel timing. They scrub, select a range, drag a clip, or drop an asset, and the preview responds without losing context. The timeline helps review and edit motion, but it does not ask the user to understand HyperFrames internals.

## Test Coverage

- `src/main/lib/hyperframes/timeline-model.test.ts` - Extracts static clips, nested composition hosts, captions, media metadata, and escaped-file failures.
- `src/main/lib/hyperframes/timeline-edits.test.ts` - Moves/trims clips through guarded source patching and rejects symlinked composition sources.
- `src/main/lib/hyperframes/timeline-assets.test.ts` - Adds project assets to the active timeline and rejects unsafe/non-asset drops.
- `src/renderer/features/hyperframes/timeline-comfort-state.test.ts` - Persists zoom/scroll comfort state per project and composition.
- `src/renderer/features/hyperframes/timeline-model.test.ts` - Normalizes runtime manifests, captions, tracks, ticks, fit/manual zoom, and range selection helpers.
- `src/renderer/features/hyperframes/timeline-player-adapter-core.test.ts` - Sanitizes player time, holds programmatic seeks, and reads runtime timeline messages safely.
- `src/renderer/features/hyperframes/timeline-player-adapter.test.ts` - Loads changed sources in a hidden player, revokes stale blob URLs, and preserves preview time on reloads.
