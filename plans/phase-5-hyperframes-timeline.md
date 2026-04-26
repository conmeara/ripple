# Phase 5: HyperFrames Timeline

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple shows a real motion timeline directly under the Phase
4 HyperFrames preview player. A user can preview the active composition, see
its clips as tracks under the player, scrub or click the timeline to seek, and
select clips or frame ranges for later comments and revisions without opening
full HyperFrames Studio.

This phase follows the Phase 4 architecture principle. Ripple owns the app
surface: timeline layout, controls, visual styling, loading/error states,
selection, comment affordances, and concise motion-review language.
HyperFrames owns the motion semantics: player runtime, current time, duration,
clip manifest, scenes, nested composition timing, and future framework
behavior. The timeline should wrap HyperFrames runtime/player truth, not embed
the full Studio app and not recreate HyperFrames timing logic from scratch.

The key architectural shape is a Ripple-owned `RippleTimelinePlayerAdapter`
around the existing Phase 4 `@hyperframes/player` wrapper. The adapter uses the
public player API for playback and reload, captures HyperFrames runtime
timeline messages for the authoritative model, and exposes a small Ripple
timeline state to the UI. Access to the player iframe is allowed only as an
advanced bridge for official/editor-style integration, not as the product
architecture.

This phase intentionally comes before the assets/compositions pane. The old
Phase 5 assets/compositions work is now Phase 6.

## Progress

- [x] 2026-04-26 / Codex: Reframed the roadmap so Phase 5 is the embedded
  HyperFrames timeline and the former assets/compositions pane moves to Phase
  6.
- [x] 2026-04-26 / Codex: Inspected `@hyperframes/studio@0.4.30`,
  `@hyperframes/player@0.4.30`, `@hyperframes/core@0.4.30`, and Ripple's Phase
  4 player-source adapter with sub-agent research.
- [x] 2026-04-26 / User + Codex: Chose the Phase 5 architecture: Ripple owns
  timeline UI and adapter state; HyperFrames runtime/player owns timeline
  semantics; do not embed full Studio or make iframe DOM access the
  architecture.
- [x] 2026-04-26 / Codex: Implemented a shared
  `RippleTimelinePlayerAdapter` around the Phase 4 player wrapper.
- [x] 2026-04-26 / Codex: Captured runtime `hf-preview` timeline manifests
  and normalized them into a Ripple timeline model.
- [x] 2026-04-26 / Codex: Added a main-process static `getTimelineModel`
  fallback for fast source-derived timeline data.
- [x] 2026-04-26 / Codex: Built the read-only Ripple timeline under the Phase
  4 player with clip selection, range data, ruler, tracks, playhead, and zoom
  controls.
- [x] 2026-04-26 / Codex: Validated in Electron against the default
  `~/Ripple/test1` project, with nested-composition coverage in the static
  model tests.
- [x] 2026-04-26 / Codex: Compared Ripple's timeline to HyperFrames Studio
  and aligned the displayed clip rows and lane styling while keeping Ripple's
  app color tokens for light/dark appearance.
- [x] 2026-04-26 / Codex: Refined the preview/timeline chrome so the control
  bar sits above the optional timeline, the timeline toggle is icon-only, and
  redundant runtime/duration labels are removed from the timeline header.
- [x] 2026-04-26 / Codex: Removed the detailed timeline's outer card frame and
  bottom time footer so it sits as an integrated editor band.
- [x] 2026-04-26 / Codex: Matched Studio's live-time pattern so preview
  scrubber motion, timecode, and detailed timeline playhead update on
  `requestAnimationFrame` without forcing React re-renders every frame.
- [x] 2026-04-26 / Codex: Refined preview scrub seeking to match
  HyperFrames' single-thumb control behavior and remove the near-playhead
  hover-marker flicker.
- [x] 2026-04-26 / Codex: Expanded the Phase 5 regression suite to cover
  preview scrub math, adapter runtime-clock selection, runtime manifest
  filtering, duplicate host suppression, fps/frame math, static duration
  clipping, media metadata, and nested asset path rebasing.
- [x] 2026-04-26 / Codex: Fixed code-review issues for stale runtime timeline
  state during source changes, long timelines hidden by Fit mode, and
  duplicate composition refresh races.

## Surprises & Discoveries

- Observation: HyperFrames Studio is not the source of timeline truth.
  Evidence: `@hyperframes/studio/src/player/hooks/useTimelinePlayer.ts`
  consumes runtime `hf-preview` timeline messages, `window.__clipManifest`,
  `window.__timelines`, and iframe DOM fallbacks. The authoritative clip model
  comes from the HyperFrames runtime running inside the player document.

- Observation: `@hyperframes/player` has a small public surface that matches
  the Phase 4 wrapper architecture.
  Evidence: `@hyperframes/player` documents `src`, `width`, `height`,
  `play`, `pause`, `seek`, `currentTime`, `duration`, `ready`,
  `playbackRate`, `muted`, `loop`, `iframeElement`, and events including
  `ready`, `play`, `pause`, `timeupdate`, `ended`, and `error`.

- Observation: `iframeElement` is official, but should be treated as an
  advanced integration bridge.
  Evidence: The player README and types expose `iframeElement` for editors and
  Studio-style integrations, while Phase 4 already succeeds with player events
  and public methods for normal preview controls.

- Observation: A main-process route can build a useful static timeline model,
  but not the full truth.
  Evidence: The main process can resolve project/composition files and parse
  explicit `data-start`, `data-duration`, `data-track-index`, media, and
  composition references. It cannot fully know GSAP timeline duration, runtime
  scenes, nested composition manifests, async media durations, or
  runtime-generated clip details without executing the preview.

- Observation: Directly wrapping Studio's `Timeline` is possible as a spike but
  risky as the product boundary.
  Evidence: `@hyperframes/studio` root exports `Timeline`, `useTimelinePlayer`,
  `resolveIframe`, `usePlayerStore`, `liveTime`, and `TimelineElement`, but the
  package root points to source TS, the timeline depends on unexported helpers,
  Studio Tailwind classes, global Studio CSS assumptions, and hard-coded
  `/icons/timeline/*.svg` assets.

- Observation: Studio's editing logic is useful reference material but is not
  safe enough to ship directly in Ripple.
  Evidence: Studio derives `domId`, selector, selector index, and `sourceFile`
  from renderer/iframe state and uses browser-side source patching. Ripple
  must re-resolve all write targets in the main process before mutating project
  files.

- Observation: Importing `linkedom` directly in the Electron main bundle pulls
  its optional `canvas` dependency at runtime.
  Evidence: the first live `bun run dev` QA failed to load the main process
  with a `Could not resolve "canvas"` error from `linkedom`. Switching the
  static parser to `linkedom/worker` fixed live dev and production build.

- Observation: The existing local `~/Ripple/test1` folder predates the current
  scaffold's HyperFrames timing attributes.
  Evidence: HyperFrames Studio preview for that folder warned that the
  lower-third composition host was missing `data-composition-id` and roots were
  missing `data-start`, while the current repo scaffold now includes those
  attributes for newly generated projects.

- Observation: Studio keeps useful structural rows, but it does not need to
  show a generic duplicate host when a named composition row is present.
  Evidence: Studio's timeline for `~/Ripple/test1` showed a section row,
  `__NODE__INDEX_2`, `__NODE__INDEX_3`, and `LOWER-THIRD`; Ripple's earlier
  timeline also showed an extra generic lower-third host row as `Node Index 4`.

- Observation: Studio's layout mechanics are useful, but its dark theme is not
  the Ripple appearance contract.
  Evidence: Studio's timeline components hard-code dark surface and clip
  colors. Ripple now uses the same compact gutter/lane/badge structure with
  `bg-background`, `bg-muted`, `border-border`, `text-foreground`,
  `text-muted-foreground`, and `primary` token accents so app color appearance
  controls remain authoritative.

- Observation: Studio keeps timeline motion smooth by separating live playback
  time from React render state.
  Evidence: `@hyperframes/studio/src/player/store/playerStore.ts` exposes a
  lightweight `liveTime` pub-sub, and
  `@hyperframes/studio/src/player/hooks/useTimelinePlayer.ts` notifies it from
  a `requestAnimationFrame` loop. The `Timeline` component then writes the
  playhead position directly to the DOM.

- Observation: HyperFrames' preview scrubber does not draw a second hover
  playhead beside the real thumb.
  Evidence: `@hyperframes/studio/src/player/components/PlayerControls.tsx`
  resolves seek position from `clientX`, immediately writes fill/thumb DOM
  positions, then calls `onSeek`, leaving one visible scrubber thumb instead
  of a hover marker plus a live marker.

## Decision Log

- Decision: Phase 5 is the timeline under the preview player; assets and
  compositions move to Phase 6.
  Rationale: The user wants the HyperFrames Studio-style timeline immediately
  under the current Phase 4 player before building the left assets/compositions
  pane.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Ripple will build its own `HyperFramesTimeline` UI and timeline
  adapter rather than embedding full HyperFrames Studio or `NLELayout`.
  Rationale: Ripple should give users the power of HyperFrames while keeping a
  concise app surface. Full Studio carries routes, panels, styling, and product
  assumptions that do not fit the Ripple shell.
  Date/Author: 2026-04-26 / User + Codex

- Decision: HyperFrames runtime manifest is the authoritative timeline model.
  Rationale: The runtime resolves GSAP durations, nested compositions, scenes,
  media durations, and clip hierarchy after the preview loads. Static parsing
  is useful for a fast fallback, but it is not enough for final timeline truth.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Start with a read-only synchronized timeline plus clip/range
  selection. Defer move, trim, delete, and asset-drop editing.
  Rationale: Editing requires source authority, symlink-safe writes, stable
  target re-resolution, and main-process project-boundary validation. Phase 5's
  first product value is seeing and selecting the motion timeline.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Use `iframeElement` only behind an adapter capability.
  Rationale: The player officially exposes it for editor integrations, but the
  core app should depend on public player events/methods and runtime messages
  rather than renderer DOM access as the main architecture.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Use `linkedom/worker` for main-process static timeline parsing.
  Rationale: It provides the DOM APIs needed for source inspection without
  pulling the optional native canvas dependency into Electron's main bundle.
  Date/Author: 2026-04-26 / Codex

## Outcomes & Retrospective

Phase 5 is implemented. Ripple now renders a native embedded timeline directly
under the HyperFrames preview player. The preview and timeline share one
adapter-backed playback state, so the Phase 4 scrubber, play/pause/restart
controls, timeline playhead, clip selection, and timeline seeks stay
synchronized.

The renderer receives an authoritative runtime model when the player emits the
`hf-preview` timeline manifest and falls back to
`trpc.hyperframes.getTimelineModel` static source parsing while runtime data is
loading or unavailable. The timeline UI shows source/live confidence, ruler
ticks, tracks, clip blocks, selected clip timing, range-selection data for
future comments/revisions, fit/manual zoom controls, and loading/empty/error
states without embedding HyperFrames Studio chrome.

Live QA found two adapter edge cases and both were fixed before final
validation: playing from the end now restarts from zero, and a composition that
reaches its duration without an `ended` event now returns the control state to
Play when loop is off.

Validation completed:

- `bun test src/renderer/features/hyperframes src/main/lib/hyperframes`
  passed: 59 tests.
- `bun run test:ripple` passed: 97 tests.
- `bun run build` passed.
- `git diff --check` passed.
- `bun run ts:check` was run and still fails on the existing repo-wide
  baseline in non-Phase-5 files such as Claude routing, credential manager,
  agents chat UI, mentions, terminal, and remote TRPC surfaces.

Computer Use QA completed against the live Electron app on
`localhost:5173/?windowId=main`: the `test1` project showed `Timeline LIVE`,
runtime-derived tracks/clips, synchronized playhead/scrubber time, clip
selection seeking to the lower-third at `00:00:02:12`, selected clip range
metadata, zoom controls, restart behavior, and end-of-playback state recovery.

HyperFrames Studio comparison completed against the same local `test1` folder:
Studio showed the reference information architecture Ripple is matching:
preview, scrubber, timeline toggle, Fit/zoom controls, ruler, section/clip
rows, and range-edit affordance. Ripple intentionally keeps that timeline
shape while omitting Studio's sidebar/editor chrome and continuing to resolve
all write authority through main-process routes.

Follow-up Studio comparison work removed the duplicate generic composition
host row from Ripple's displayed runtime model and reshaped the timeline lanes
to match Studio's compact gutter, row, clip, and clip-badge hierarchy. The UI
intentionally uses Ripple tokens rather than Studio's hard-coded dark palette,
so it follows the app's light/dark color appearance.

The preview chrome now follows the HyperFrames layout order more closely:
scrub strip, playback/control bar, then the optional detailed timeline. The
timeline toggle lives as an icon-only control in the main button bar, and the
timeline itself no longer repeats a `LIVE` badge or a duration label in the
left gutter before the ruler begins. The detailed timeline also no longer has
an outer rounded card border or a bottom `00:00:00:00` footer, so it reads as a
native part of the app surface instead of a framed widget.

Smooth playback refinement: Ripple's adapter now mirrors Studio's live-time
approach. The adapter reads the same-origin HyperFrames runtime clock during
playback and publishes a frame-synchronous live-time stream. The preview
scrubber fill, preview handle, centered timecode, and detailed timeline
playhead subscribe to that stream and update DOM position/text directly, while
React state remains responsible for stable product state such as play/pause,
seek, duration, selection, and source changes.

Scrub refinement: Ripple's preview scrubber now follows HyperFrames' own
single-thumb behavior. Seeking resolves the pointer position with edge
snapping, immediately syncs the preview fill/thumb/timecode, clears hover
preview state during pointer capture, and leaves the hover timecode tooltip
without drawing a second near-overlapping playhead marker.

## Context and Orientation

Phase 4 added `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`.
That component creates an official `@hyperframes/player` custom element,
fetches a main-process-approved prepared preview document from
`trpc.hyperframes.getPlayerSource`, converts it to a same-origin `blob:` URL,
and passes that URL through the player's `src` attribute. Project files,
nested compositions, media, GSAP, and runtime scripts resolve through the
validated `ripple-preview:` protocol in the main process.

The Phase 4 player already mirrors public player events into Ripple UI state:
`ready`, `play`, `pause`, `ended`, `timeupdate`, and `error`. It drives the
player through public methods and properties: `play`, `pause`, `seek`,
`playbackRate`, `loop`, and `muted`. Phase 5 should preserve this shape and
extract a shared adapter instead of creating a second playback controller.

HyperFrames runtime emits the timeline information that Studio uses. The
runtime message shape includes timeline clips, scenes, duration in frames, and
composition size. Studio's `useTimelinePlayer` then maps that data into its own
`TimelineElement` store and uses iframe/DOM fallbacks when the runtime manifest
is incomplete. Ripple should learn from this flow but expose a Ripple-owned
model to the UI.

Recommended normalized model:

```ts
type RippleTimelineModel = {
  projectId: string
  compositionId: string
  filePath: string
  source: "static-source" | "runtime-manifest"
  fps: 30
  durationSeconds: number | null
  durationFrames: number | null
  width: number
  height: number
  clips: RippleTimelineClip[]
  scenes: Array<{
    id: string
    label: string
    start: number
    duration: number
    thumbnailUrl?: string | null
  }>
}

type RippleTimelineClip = {
  id: string
  key: string
  label: string
  kind: "video" | "audio" | "image" | "element" | "composition"
  tagName: string | null
  start: number
  duration: number
  track: number
  sourceFile: string
  selector?: string
  selectorIndex?: number
  domId?: string
  compositionId?: string | null
  parentCompositionId?: string | null
  compositionSrc?: string | null
  assetUrl?: string | null
  playbackStart?: number
  sourceDuration?: number
  volume?: number
  editable: boolean
  confidence: "authoritative" | "static" | "fallback"
}
```

## Plan of Work

First, extract or introduce `RippleTimelinePlayerAdapter`. It should own the
current Phase 4 player element, source loading, blob URL lifecycle, reload
versioning, player event subscription, and imperative player calls. Its normal
surface should be public-player based: state, `play`, `pause`, `seek`,
`setPlaybackRate`, `setMuted`, `setLoop`, `reload`, and `subscribe`.

Second, add timeline-manifest capture to the adapter. Listen for
`window.message` events from the active player iframe and accept only messages
from that iframe's `contentWindow` with `source: "hf-preview"` and
`type: "timeline"`. Normalize the runtime manifest into
`RippleTimelineModel` with `source: "runtime-manifest"` and
`confidence: "authoritative"` for runtime clips.

Third, add a main-process static timeline route, likely
`trpc.hyperframes.getTimelineModel`. It should accept `projectId` and optional
`compositionId`, resolve the selected Ripple project and composition in the
main process, validate file paths with the existing HyperFrames project
boundary helpers, parse explicit clip attributes from source/prepared HTML, and
return `source: "static-source"`. This route gives the renderer a fast model
or useful fallback before runtime metadata arrives.

Fourth, implement `HyperFramesTimeline` in
`src/renderer/features/hyperframes/`. It should be a Ripple UI component, not
an embedded Studio component. It renders ruler ticks, scenes/sections, tracks,
clips, playhead, zoom/fit controls, loading/empty/error states, and selection
states from `RippleTimelineModel` plus adapter playback state. It should use
Ripple/Radix/Tailwind/lucide patterns and avoid importing Studio global CSS.

Fifth, synchronize interactions. The timeline seek action calls the adapter's
`seek`. Player `timeupdate` events move the timeline playhead. Reload clears
stale runtime confidence, shows the static fallback if available, then replaces
it with the next authoritative runtime manifest. The existing Phase 4 scrubber
and the new timeline must share the same adapter state rather than competing
RAF loops.

Sixth, add selection and range affordances for future comments/revisions.
Users should be able to select a clip and shift/drag or otherwise mark a
time/frame range. This phase does not need persistent comments yet, but it
should produce stable selection data that later comment/revision work can use:
project, composition, time/range, clip key, selector/source metadata where
available, and a confidence/source label.

Seventh, validate direct Studio wrapping only as an optional spike if useful.
It is acceptable to import `@hyperframes/studio` root exports in a throwaway
prototype to compare behavior, but committed production code should not depend
on full Studio, `NLELayout`, global Studio CSS, or deep imports from
`@hyperframes/studio/src/...` unless explicitly wrapped and guarded by tests.

Eighth, leave move/trim/delete/asset-drop editing for a later milestone. If a
small editing spike is needed, keep it behind a local flag and restrict it to
main-process-validated media clips with stable source IDs in the active
composition file.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Read the current Phase 4 player/source files:
   `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`,
   `src/renderer/features/hyperframes/player-source-url.ts`,
   `src/main/lib/hyperframes/player-source.ts`,
   `src/main/lib/hyperframes/player-source-protocol.ts`, and
   `src/main/lib/trpc/routers/hyperframes.ts`.

2. Add a renderer timeline adapter module, for example
   `src/renderer/features/hyperframes/timeline-player-adapter.ts`, plus a
   small typed timeline model module.

3. Refactor `HyperFramesPreviewPlayer` to use the adapter for player state and
   public player methods while preserving Phase 4 visual controls and behavior.

4. Add runtime manifest capture in the adapter and normalize it into
   `RippleTimelineModel`.

5. Add a main-process static timeline model helper under
   `src/main/lib/hyperframes/` and expose it through
   `trpc.hyperframes.getTimelineModel`.

6. Build `src/renderer/features/hyperframes/HyperFramesTimeline.tsx` under the
   player, using Ripple UI and the adapter timeline state.

7. Add focused tests for pure timeline utilities: tick generation, zoom math,
   playhead positioning, track grouping, clip sorting, runtime-manifest
   normalization, and static-model fallback labeling.

8. Add main-process tests for the static timeline route: project ownership,
   composition selection, path-boundary enforcement, missing files, explicit
   clips, nested composition references, and static confidence labels.

9. Run validation:
   `bun test src/renderer/features/hyperframes src/main/lib/hyperframes`,
   `bun run test:ripple`,
   `bun run build`,
   `git diff --check`, and `bun run ts:check` if useful for comparing against
   the known repo-wide baseline.

10. Run live Electron QA with `bun run dev`, open `~/Ripple/test1`, and verify
    the visible timeline under the preview player.

11. Update this ExecPlan with final implementation decisions, validation
    output, and remaining risk.

## Validation and Acceptance

Automated validation:

- Focused renderer tests cover timeline model normalization, track grouping,
  ticks, zoom, playhead math, seek callbacks, and empty/loading/error states.
- Focused main-process tests cover static timeline model creation and
  project-boundary-safe path resolution.
- Package-boundary tests assert the pinned HyperFrames family versions and
  approved package surfaces still resolve.
- `bun run test:ripple` passes.
- `bun run build` passes.
- `git diff --check` passes.
- `bun run ts:check` is run or the known repo-wide baseline failures are
  recorded with confirmation that new Phase 5 files are not implicated.

Manual/Electron acceptance:

- The preview pane shows the Phase 4 preview player with a Ripple-styled
  timeline directly underneath it.
- The timeline initially renders a static/loading model when runtime metadata
  is not ready, then updates to the authoritative runtime model when the player
  emits it.
- The timeline shows clips/tracks/ruler/playhead for the default Ripple
  starter.
- The playhead advances during playback and stops on pause.
- Clicking or dragging the timeline seeks the official player.
- The existing Phase 4 scrubber and controls stay synchronized with timeline
  seeks.
- Reload refreshes the prepared preview document and timeline model without
  stale clips lingering as authoritative.
- Timeline fit/manual zoom works and does not resize the player unexpectedly.
- Clip/range selection works well enough to feed later comments/revisions.
- Nested compositions and media clips appear with sensible labels where
  HyperFrames metadata exposes them.
- The normal product path does not open external HyperFrames Studio and does
  not embed full Studio chrome.

## Idempotence and Recovery

The read-only timeline can be added and removed without changing project files.
If runtime manifest capture fails, the timeline should fall back to
`getTimelineModel` static data and clearly avoid marking static clips as
authoritative.

If timeline state desynchronizes from the player, keep the Phase 4 player as
the authority and disable or hide the timeline behind a local component flag
until the adapter is fixed. Do not ship a timeline that seeks independently
from HyperFrames player/runtime state.

If direct `@hyperframes/studio` root imports are used in a prototype and cause
Vite, Electron, CSS, icon, or packaging issues, discard the prototype and keep
the Ripple-owned adapter/UI path. Do not add production deep imports from
`@hyperframes/studio/src/...` without explicit tests and a decision log entry.

If source editing is attempted in a later spike and patch validation fails,
show that the clip cannot be edited safely and leave the primary project
unchanged. Do not silently fall back to writing arbitrary files or editing the
wrong composition.

## Interfaces and Dependencies

Existing dependencies:

- `@hyperframes/player@0.4.30`
- `@hyperframes/studio@0.4.30`, reference/prototype only for this phase unless
  a later decision says otherwise
- `@hyperframes/core@0.4.30`
- `hyperframes@0.4.30`
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`
- `trpc.hyperframes.getPlayerSource`
- `ripple-preview:` protocol and player-source adapter

New renderer interfaces:

- `HyperFramesTimeline`
- `RippleTimelinePlayerAdapter`
- `RippleTimelineModel`
- `RippleTimelineClip`
- timeline zoom/fit controls using Ripple buttons and tooltips
- clip and range selection state for later comments/revisions

New main-process interfaces:

- `trpc.hyperframes.getTimelineModel`
- static timeline model helper under `src/main/lib/hyperframes/`

Future editing interfaces, not part of the first Phase 5 milestone:

- `trpc.hyperframes.updateTimelineClip`
- structured source patch helper that validates project ID, composition ID,
  source file, selector/key, symlink-safe path, and timing updates

## Artifacts and Notes

Screenshots supplied by the user on 2026-04-26 show the desired HyperFrames
Studio timeline under the preview: compact ruler, green playhead, section row,
track rows, clip blocks, fit/zoom controls, and a player scrubber above the
timeline. Ripple should borrow that information architecture, not the full
Studio app frame.

Important HyperFrames files inspected:

- `node_modules/@hyperframes/player/README.md`
- `node_modules/@hyperframes/player/dist/hyperframes-player.d.ts`
- `node_modules/@hyperframes/studio/src/index.ts`
- `node_modules/@hyperframes/studio/src/player/index.ts`
- `node_modules/@hyperframes/studio/src/player/components/Timeline.tsx`
- `node_modules/@hyperframes/studio/src/player/components/TimelineClip.tsx`
- `node_modules/@hyperframes/studio/src/player/hooks/useTimelinePlayer.ts`
- `node_modules/@hyperframes/studio/src/player/store/playerStore.ts`
- `node_modules/@hyperframes/studio/src/player/components/timelineEditing.ts`
- `node_modules/@hyperframes/studio/src/player/components/timelineZoom.ts`
- `node_modules/@hyperframes/studio/src/player/components/timelineTheme.ts`
- `node_modules/@hyperframes/studio/src/utils/sourcePatcher.ts`
- `node_modules/@hyperframes/studio/src/utils/htmlEditor.ts`
- `node_modules/@hyperframes/studio/src/utils/timelineAssetDrop.ts`
- `node_modules/@hyperframes/core/dist/hyperframe.runtime.iife.js`
- `node_modules/@hyperframes/core/dist/studio-api/index.d.ts`

The agreed summary: Ripple should lean on HyperFrames for runtime truth and
future timeline semantics, while owning a concise native timeline UI that wraps
those semantics for users.
