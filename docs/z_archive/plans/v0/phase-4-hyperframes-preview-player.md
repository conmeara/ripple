# Phase 4: HyperFrames Preview Player

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple has a real HyperFrames preview player inside the
existing preview-pane pattern. A user can open a Ripple project, preview the
active composition, play and pause motion, scrub time, refresh the player, and
see clear loading and error states without leaving the app.

This phase intentionally does not add the assets/compositions pane, the
right-side review rail, persistent comments, revisions, or export UX. Those are
later phases. Phase 4 is only the player layer, because the rest of the Ripple
shell should compose around a working motion preview.

The player must use official HyperFrames player/runtime primitives behind a
Ripple-owned adapter. Ripple owns the surrounding app chrome, controls, states,
and placement. HyperFrames owns motion playback, timing, composition loading,
and player semantics.

The current implementation reaches that shape by wrapping `@hyperframes/player`
with Ripple-owned chrome and asking the main process for a HyperFrames-prepared
preview URL. The renderer does not build or pass a `srcdoc` fallback. It fetches
the approved prepared document, turns it into a same-origin object URL, and
passes that URL to the official player's `src` attribute so the player can keep
using its own ready, play, pause, seek, duration, and timeupdate semantics.

## Progress

- [x] 2026-04-26 / Codex: Re-scoped Phase 4 after the first broad shell pass
  moved too quickly. Phase 4 now focuses only on the HyperFrames preview
  player.
- [x] 2026-04-26 / Codex: Inspected the existing preview path:
  `active-chat.tsx` opens a right `ResizableSidebar` when preview is available,
  and `AgentPreview` already has useful UI patterns for load state, refresh,
  viewport controls, scale, device sizing, and external-open affordances.
- [x] 2026-04-26 / Codex: Ran package and runtime research. The checked-out
  app currently installs `hyperframes@0.4.28` and does not install
  `@hyperframes/player`, `@hyperframes/studio`, or `@hyperframes/core`.
- [x] 2026-04-26 / Codex: Selected the official HyperFrames package path as
  the only Phase 4 implementation architecture.
- [x] 2026-04-26 / Codex: Removed the temporary non-player implementation from
  the working tree and reset this plan to the official-player architecture.
- [x] 2026-04-26 / Codex: Verified the current registry versions for `hyperframes`,
  `@hyperframes/player`, `@hyperframes/core`, and `@hyperframes/studio`.
- [x] 2026-04-26 / Codex: Pinned the HyperFrames package family to exact
  `0.4.30` versions in `package.json` and `bun.lock`.
- [x] 2026-04-26 / Codex: Implemented a main-process-approved player source
  contract through `trpc.hyperframes.getPlayerSource`.
- [x] 2026-04-26 / Codex: Registered a `ripple-preview:` Electron protocol for
  validated project assets and the local HyperFrames runtime file.
- [x] 2026-04-26 / Codex: Implemented
  `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` around the
  official `@hyperframes/player` custom element.
- [x] 2026-04-26 / Codex: Wired Ripple project preview availability into the
  existing desktop and mobile preview-pane entry points.
- [x] 2026-04-26 / Codex: Ran focused source tests, `bun run test:ripple`,
  `bun run build`, `bun run ts:check`, and `git diff --check`.
- [x] 2026-04-26 / Codex: Completed live Electron QA against the existing
  `~/Ripple/test1` starter project. The player reaches ready state, reports a
  `0:06` duration after legacy timing normalization, plays through the
  composition, and no longer logs the preview-load errors from the first smoke.
- [x] 2026-04-26 / Codex: Recorded the next architecture direction after
  implementation review: evolve from Ripple-built `srcdoc` toward a
  HyperFrames-prepared preview URL while preserving Ripple-owned UI, comments,
  chat, widgets, and future assets/compositions/timeline surfaces.
- [x] 2026-04-26 / Codex: Spiked the official player's `src` mode against a
  direct `ripple-preview:` prepared URL. The document rendered visually, but
  the player stayed in `Preparing` and emitted `Composition timeline not found
  after 8s`, confirming the expected origin/readiness blocker.
- [x] 2026-04-26 / Codex: Switched the renderer from `srcdoc` to `src` only.
  It now fetches the main-process-approved prepared preview document and passes
  a same-origin `blob:` URL to `@hyperframes/player`, while all project assets
  and the runtime still resolve through `ripple-preview:`.
- [x] 2026-04-26 / Codex: Prototyped a main-process preview-serving adapter
  using HyperFrames core/studio preview helpers where available, without
  launching external Studio or exposing arbitrary filesystem paths.
- [x] 2026-04-26 / Codex: Decided to fully switch Phase 4 from `srcdoc` to
  `src`. There is no renderer `srcdoc` fallback path after the Level 2 update.
- [x] 2026-04-26 / Codex: Re-ran final validation after the Level 2 update.
  Focused player-source tests, `bun run test:ripple`, `bun run build`, and
  `git diff --check` passed. `bun run ts:check` still fails on the existing
  repo-wide baseline errors outside the Phase 4 player files.
- [x] 2026-04-26 / Codex: Re-ran live Electron QA after the Level 2 update.
  The player reaches `Ready`, play changes status to `Playing`, the time slider
  advances, reload returns to `Ready`, and DevTools no longer shows the prior
  preview-load errors.
- [x] 2026-04-26 / Codex: Added broader Phase 4 automated QA coverage for
  nested composition references, media assets, font URLs, no-CDN runtime and
  GSAP behavior, reload-after-edit semantics, renderer reload URL behavior, and
  packaged-app dependency configuration.
- [x] 2026-04-26 / Codex: Re-ran the broadened QA suite. Focused HyperFrames
  tests passed 17/17, `bun run test:ripple` passed 69/69, `bun run build`
  passed, `bun run package` produced `release/mac-arm64/1Code.app`, packaged
  runtime files were present in `app.asar.unpacked`, and `git diff --check`
  passed. `bun run ts:check` still fails only on the known repo-wide baseline
  outside the Phase 4 player/source files.
- [x] 2026-04-26 / Codex: Refined the player chrome after Frame.io reference
  review. The preview no longer has a top composition/status bar, uses the app
  theme background around the player, and moves player controls into a
  floating-feeling bottom chrome with scrubber, timecode, play, loop, speed,
  mute, settings, reload, and fullscreen.
- [x] 2026-04-26 / Codex: Re-ran `bun run build`, `bun run test:ripple`,
  `git diff --check`, and live Computer Use QA against the dev Electron app.
  Playback, restart, speed selection, settings submenus, and element fullscreen
  all worked in the new control layout.
- [x] 2026-04-26 / Codex: Tightened the Frame.io-inspired player chrome. The
  bottom controls now use smaller icon targets and glyphs, the timecode pill is
  more compact, and the scrubber reads as a thin subtle line instead of a chunky
  slider.
- [x] 2026-04-26 / Codex: Rebuilt the scrubber as a custom Frame.io-style
  timeline. The at-rest line is hairline-thin, it expands on hover/scrub with a
  pointer timecode bubble, endpoint time labels were removed, and the preview
  stage padding was reduced so the composition sits closer to the pane edges.
- [x] 2026-04-26 / Codex: Adjusted the final timeline reference match. The
  scrubber now keeps a visible theme-adaptive rail at rest, uses the app primary
  accent for played progress, uses app popover colors for the hover timecode,
  and gives the preview stage an almost edge-to-edge fit with only a small
  app-surface margin.
- [x] 2026-04-26 / Codex: Addressed review follow-ups on the refined player
  chrome. The close affordance now renders anywhere the host supplies
  `onClose`, including the desktop preview sidebar, and the no-op quality
  setting was removed until a real preview-source or render-quality path exists.
- [x] 2026-04-26 / Codex: Added focused renderer regression coverage for the
  preview-player control policy: close visibility follows `onClose`, settings
  stay limited to real behavior, and zoom remains available as an actual preview
  control.
- [x] 2026-04-30 / Codex: Smoothed source handoff for review revisions and chat
  revisions. The visible player now stays mounted while a hidden
  `hyperframes-player` loads, seeks to the requested frame, and only then swaps
  in, with the timeline UI pinned to the last settled time during the handoff.
- [x] 2026-04-30 / Codex: Added a renderer preview coordinator that caches
  prepared HyperFrames player documents behind an LRU document/byte cap, records
  preview performance timing logs, and prewarms likely main/comment revision
  targets.
- [x] 2026-04-30 / Codex: Added the second preview-speed layer after user QA
  showed document caching alone did not feel meaningfully faster. Ripple now
  keeps a bounded global pool of offscreen ready `hyperframes-player` instances
  for likely targets and claims them during source handoff when ready.
- [x] 2026-04-30 / Codex: Re-ran preview validation after the coordinator
  update. Focused HyperFrames/Ripple shell tests passed `59/59`,
  `bun run test:ripple` passed `206/206`, and `git diff --check` passed.
  Direct `tsc --noEmit` still reports unrelated dirty-tree/baseline errors in
  `main.ts`, `api-fetch.ts`, and `isolated-message-group.tsx`; `bun run
  ts:check` still cannot run because `tsgo` is not installed.
- [x] 2026-04-30 / Codex: Tightened preview timecode continuity after user QA.
  Main/chat preview switches now re-seek to the current sticky preview time,
  comment selection seeks from the persisted frame anchor when it matches the
  stored milliseconds, and tiny player rounding updates no longer erase a
  just-requested sub-frame/comment time.
- [x] 2026-04-30 / Codex: Expanded speculative preview readiness from a tiny
  2-player pool to a bounded 6-player global pool, with higher document-cache
  caps and LRU replacement so the selected/nearby comment targets can displace
  stale prewarms.
- [x] 2026-04-30 / Codex: Re-ran validation after the timecode/pool tuning.
  Focused HyperFrames/Ripple shell tests passed `64/64`, `bun run test:ripple`
  passed `211/211`, and `git diff --check` passed. Direct `tsc --noEmit` still
  reports only the known repo-wide baseline errors in `main.ts`, `api-fetch.ts`,
  and `isolated-message-group.tsx`.
- [x] 2026-04-30 / Codex: Fixed a follow-up comment regression where source
  loading emitted a live `0` while a non-zero comment seek was pending, causing
  the selected comment and subsequent View Main action to land at the start.
  The shell now guards pending seeks against loader zeroes, and the preview UI
  displays the requested seek time while the hidden player is still settling.
  Focused HyperFrames/Ripple shell tests passed `65/65`, `bun run test:ripple`
  passed `212/212`, and `git diff --check` passed.
- [x] 2026-04-30 / Codex: Fixed the remaining first-click comment seek bug.
  `adapter.seek()` no longer clamps every seek to `0` while the newly handed-off
  HyperFrames player has not reported duration yet, which was why the first
  comment click and View Main could still land at the start while a second click
  worked after duration settled. Focused HyperFrames/Ripple shell tests passed
  `66/66`, `bun run test:ripple` passed `213/213`, and `git diff --check`
  passed.
- [x] 2026-04-30 / Codex: Added an adapter-level programmatic seek hold/retry
  after user QA showed the player could still jump to the requested comment
  time and then report `0` back up. Stale post-seek reports are now held on the
  requested time and retried briefly until the player settles on the requested
  frame. Focused HyperFrames/Ripple shell tests passed `67/67`, `bun run
  test:ripple` passed `214/214`, and `git diff --check` passed.
- [x] 2026-04-30 / Codex: Smoothed the final fast-loading preview indicator
  flicker. Transient inline "Updating preview" and blocking "Preparing preview"
  states now wait briefly before rendering and fade in when a real wait remains;
  preview errors still render immediately. Focused HyperFrames/Ripple shell
  tests passed `68/68`, `bun run test:ripple` passed `215/215`, and
  `git diff --check` passed.
- [x] 2026-04-30 / Codex: Removed the remaining frame-zero visual flash during
  comment/main source switches. Pending players now stay fully hidden until
  their clock reports the requested seek time, with a short settle timeout as a
  fallback, so prewarmed frame-zero content like the starter lower third is not
  revealed during fast handoff. The transient loading delays were also raised
  to avoid one-frame status text. Focused HyperFrames/Ripple shell tests passed
  `68/68`, `bun run test:ripple` passed `215/215`, and `git diff --check`
  passed.
- [x] Spike the official player's `src` mode against a HyperFrames-prepared
  local preview URL and document the exact ready/play/seek/timeupdate behavior
  in Electron.
- [x] Prototype a main-process preview-serving adapter that uses HyperFrames
  preview/core primitives without opening external Studio or exposing arbitrary
  project files.
- [x] Decide that the Phase 4 player fully switches from `srcdoc` to `src`
  through the HyperFrames-prepared preview URL path.

## Surprises & Discoveries

- Observation: The current preview pane is a good placement pattern for Phase 4.
  Evidence: `src/renderer/features/agents/main/active-chat.tsx` renders a right
  `ResizableSidebar` for preview, and
  `src/renderer/features/agents/ui/agent-preview.tsx` has compact controls that
  can inform the Ripple player chrome.
- Observation: The existing preview detector is coding-agent specific.
  Evidence: `AgentsContent` and `active-chat.tsx` decide preview availability
  from `chatData.sandbox_id` and `chatMeta.sandboxConfig.port`, then build a
  CodeSandbox-style URL.
- Observation: Phase 3 already provides the main-process HyperFrames lifecycle
  surface needed around the player.
  Evidence: `src/main/lib/trpc/routers/hyperframes.ts` exposes `doctor`,
  `listCompositions`, `startPreview`, `stopPreview`, `getPreviewStatus`,
  `snapshot`, `render`, `getRenderStatus`, and `cancelRender`.
- Observation: The installed local `hyperframes@0.4.28` package is CLI-first in
  this checkout.
  Evidence: `package.json` lists `hyperframes` and `gsap`; there is no
  installed `node_modules/@hyperframes` directory.
- Observation: `@hyperframes/player` is the right preview primitive for this
  phase.
  Evidence: Official docs describe a custom-element player with `play`,
  `pause`, `seek`, `currentTime`, `duration`, `ready`, and `timeupdate`.
- Observation: The official player can consume a prepared source URL while
  Ripple serves nested composition files, media, fonts, and the runtime through
  a controlled local protocol.
  Evidence: `getPlayerSource` returns a `ripple-preview:` prepared preview URL,
  `ripple-preview:` serves only paths validated against the selected project
  boundary, and the renderer passes a same-origin object URL to
  `@hyperframes/player` through `src`.
- Observation: `@hyperframes/studio` should be used selectively, not as the
  full Studio app in Phase 4.
  Evidence: Official docs expose React components and hooks for player
  controls, timeline, file tree, source editor, element picking, and full
  `StudioApp`; using the full app would pull later shell work into this phase.
- Observation: `@hyperframes/core` is the right source for structured metadata
  and future timeline/assets models.
  Evidence: Official docs expose parsing, HTML generation, composition metadata
  extraction, linting, runtime helpers, and schemas.
- Observation: The package root for `@hyperframes/core@0.4.30` should not be
  imported directly from the Electron main process in this CJS build.
  Evidence: production build externalizes main-process dependencies as
  `require(...)`, while `require("@hyperframes/core")` fails because the
  package root is import-only. The implementation reads the exported
  `@hyperframes/core/runtime` file instead.
- Observation: Electron custom protocols must be registered for the renderer's
  actual session partition.
  Evidence: the main BrowserWindow uses `partition: "persist:main"`. Registering
  `ripple-preview:` only on the default protocol registry let tests pass but
  produced `ERR_UNKNOWN_URL_SCHEME` in the live app. Registering the handler on
  both default and `persist:main` resolves project assets and the local runtime.
- Observation: Existing generated starter projects can carry an older
  `gsap-lite.js` shim and frame-count timing values.
  Evidence: `~/Ripple/test1` loaded `assets/vendor/gsap-lite.js` and
  `data-start` / `data-duration` values like `72` and `180`. The official
  runtime expects real GSAP timeline methods and seconds-based timings, so the
  player initially crashed on load or play until the preview source upgraded
  that legacy starter shape at load time.
- Observation: The remaining live-console messages after the QA fixes are
  warnings, not preview-load blockers.
  Evidence: DevTools showed no `ERR_UNKNOWN_URL_SCHEME`, CDN CSP block,
  `window.gsap.timeline` failure, play-time runtime error, or React
  `transform-origin` warning. Remaining warnings are the official player iframe
  sandbox warning, the existing Jotai `atomFamily` deprecation, and the Electron
  development CSP warning.
- Observation: The Level 2 player path removes the renderer `srcdoc` fallback
  but still keeps compatibility logic in the main-process adapter.
  Evidence: `trpc.hyperframes.getPlayerSource` now returns URL source metadata,
  while the `ripple-preview:` handler builds the prepared document, injects the
  local runtime, and normalizes older starter-project timing before the official
  player sees the composition.
- Observation: Review preview switching needs two distinct stability layers:
  visual double-buffering and timeline-state freezing.
  Evidence: User QA on 2026-04-29 showed the black flash was mostly fixed by
  hidden-player swapping, but the playhead still drifted while React Query and
  the hidden player were settling. The player now freezes the last settled
  duration, timeline model, and display time until the new player is ready.
- Observation: A global pool of live hidden HyperFrames players would make
  comment switching fastest, but it must stay small for memory on local desktops
  with multiple projects open.
  Evidence: The current coordinator caps prepared HTML documents to `18`
  documents / `36 MB`, dedupes in-flight loads, and caps offscreen ready players
  to `6` globally. The source handoff logs `player:take-hit` when it can reuse a
  ready offscreen player and `player:take-miss` when it must boot normally.
- Observation: The stronger long-term shape is a HyperFrames-prepared preview
  URL, not a full Studio embed and not a Ripple-authored parallel runtime.
  Evidence: `@hyperframes/player` supports loading a composition URL through
  `src`, and HyperFrames owns preview routes, runtime behavior, nested
  composition handling, Studio timeline/player semantics, and render-preview
  consistency.
- Observation: The HyperFrames CLI preview process is useful as a reference,
  but it is not the ideal app-embedded interface.
  Evidence: the CLI preview flow is designed to launch/open Studio externally.
  Ripple needs a main-process adapter that serves the preview document for the
  embedded player without opening the user's browser or exposing broad Studio
  mutation routes.
- Observation: The largest known blocker for the next step is player readiness
  and origin behavior when using `src`.
  Evidence: the official player can post play, pause, seek, and time messages
  to an iframe, but its ready-state detection may inspect iframe internals. A
  local URL with a different origin could play visually while still failing the
  player's `ready` path unless the serving strategy preserves the expected
  access pattern.
- Observation: Direct `ripple-preview:` `src` mode hits that origin/readiness
  blocker in Electron.
  Evidence: the prepared URL rendered the starter composition visually, but the
  official player timed out with `Composition timeline not found after 8s`.
  Fetching the same approved document and passing a same-origin `blob:` URL to
  the official player made the player reach `Ready`, report `0:06`, play,
  update time, and reload cleanly.
- Observation: The same adapter direction should support the Phase 5 timeline
  and Phase 6 assets/compositions pane.
  Evidence: the roadmap says HyperFrames remains the source of truth for
  composition structure, timeline semantics, preview, and render behavior.
  Ripple's panes should read structured HyperFrames/project data through
  main-process tRPC APIs instead of each renderer surface parsing files on its
  own.
- Observation: HyperFrames preview helpers can introduce CDN fallback scripts
  when the project head does not already include GSAP.
  Evidence: `@hyperframes/core`'s `buildSubCompositionHtml` can emit a
  jsDelivr GSAP URL. Ripple's player-source adapter now rewrites known
  HyperFrames runtime and GSAP CDN URLs to bundled `ripple-preview:` resources,
  and the focused tests cover both project-authored remote scripts and helper
  fallback injection.
- Observation: Nested composition sources need explicit handling beyond the
  helper's media/CSS URL rewriting.
  Evidence: source inspection showed HyperFrames rewrites many `src`, `href`,
  and CSS `url(...)` references for sub-compositions, but
  `data-composition-src` still needed Ripple-side normalization to remain
  project-root-relative in the prepared document.
- Observation: Computer Use can see both the stale packaged `1Code` app and the
  current dev Electron app during local QA.
  Evidence: the packaged window reported a
  `file://.../release/mac-arm64/1Code.app/.../app.asar` renderer URL and old
  player chrome, while the actual dev target was `com.github.Electron` with
  `localhost:5173` and the updated player controls.

## Decision Log

- Decision: Phase 4 is only the HyperFrames preview player.
  Rationale: A working motion preview is the foundation for assets,
  composition switching, comments, review, and export. Building the whole shell
  first produced too much UI before the central experience was ready.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Build on the existing preview-pane placement instead of replacing
  the whole shell.
  Rationale: The app already has a mature preview-pane interaction model.
  Ripple should adapt the useful local UI pattern while replacing the preview
  engine with HyperFrames-native playback.
  Date/Author: 2026-04-26 / User + Codex

- Decision: The Phase 4 implementation must use official HyperFrames player
  primitives.
  Rationale: The user rejected an implementation that looked and behaved like
  an embedded Studio surface. Phase 4 should either deliver the ideal
  player architecture or stop for a product/architecture decision.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Pin the HyperFrames package family exactly during the integration
  spike.
  Rationale: These are `0.x` packages and appear to move as a coordinated
  family. Ripple should not mix `hyperframes`, `@hyperframes/player`,
  `@hyperframes/studio`, and `@hyperframes/core` versions or leave them on
  broad caret ranges once the official-package path is adopted.
  Date/Author: 2026-04-26 / Codex

- Decision: Ripple owns the visual chrome and product model.
  Rationale: HyperFrames should supply runtime, parsing, player, timeline, and
  editor primitives. Ripple should supply the app shell, buttons, tabs, loading
  and error states, composition terminology, comment/revision flows, and
  current UI styling.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Use a Ripple-owned source contract instead of launching or embedding
  HyperFrames Studio.
  Rationale: The preview pane should open from selected Ripple project state,
  not from a separate browser tab or a Studio workspace. The renderer asks the
  main process for approved composition source data, then the official player
  handles timing and playback.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Serve player assets through `ripple-preview:` instead of exposing
  absolute filesystem paths.
  Rationale: Project files, nested compositions, media, and the local runtime
  need browser-loadable URLs, but all path resolution must remain in the main
  process and inside the project boundary.
  Date/Author: 2026-04-26 / Codex

- Decision: Preserve preview compatibility for older generated starter projects
  inside the official player source adapter.
  Rationale: The current scaffold writes `gsap.min.js` and seconds-based clip
  timings, but projects already created during Phase 2/3 can still contain the
  earlier `gsap-lite.js` shim and frame-count timings. Preview-load
  normalization keeps those projects playable without changing the project files
  or introducing another player architecture.
  Date/Author: 2026-04-26 / Codex

- Decision: Evolve Phase 4 toward the Level 2 architecture: Ripple UI around
  `@hyperframes/player`, with the player loading a HyperFrames-prepared preview
  URL.
  Rationale: This keeps Ripple feeling like one native app while letting
  HyperFrames own the moving pieces it is best positioned to evolve: runtime
  injection, composition loading, nested compositions, asset resolution, timeline
  semantics, and render-preview consistency.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Fully switch the Phase 4 player away from renderer `srcdoc` and
  use `@hyperframes/player` `src` mode.
  Rationale: The user explicitly rejected a fallback iframe-style path. Direct
  `ripple-preview:` loading renders but does not satisfy the official player's
  same-origin readiness checks, so the renderer fetches the main-approved
  prepared preview document, creates a same-origin `blob:` URL, and passes that
  URL to the player. Project files and runtime code still load through the
  validated `ripple-preview:` protocol.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Use Frame.io-style floating player chrome for the Phase 4 preview
  surface.
  Rationale: The preview should feel like a motion-review tool rather than a
  developer preview pane. Removing the composition/status header and using
  icon-first controls against the app background gives the shell more room and
  keeps zoom, reload, close, and fullscreen available without persistent button
  chrome.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Treat a full HyperFrames Studio embed as an escape hatch, not the
  default product direction.
  Rationale: Full Studio embedding would inherit HyperFrames features fastest,
  but it would also make Ripple feel like a wrapper around another app and make
  frame comments, chat, widgets, revisions, and future native controls harder to
  integrate cleanly.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Leave a future framework-adapter seam conceptually open, but do not
  optimize Phase 4 for Remotion or another framework.
  Rationale: Ripple may support additional motion frameworks later, but
  HyperFrames is the current source of truth. Over-generalizing now would add
  abstraction before the HyperFrames product path is solid.
  Date/Author: 2026-04-26 / User + Codex

## Outcomes & Retrospective

The temporary non-player implementation has been removed. The current working
tree contains an official-player Phase 4 implementation:

- exact `0.4.30` HyperFrames package pins
- `trpc.hyperframes.getPlayerSource` for project/composition-owned source data
- `ripple-preview:` protocol serving validated project assets and local runtime
- `ripple-preview:` registration for both the default Electron protocol scope
  and the app renderer's `persist:main` session
- preview-load compatibility for older generated starter projects that still
  reference `gsap-lite.js` and frame-count clip timings
- `HyperFramesPreviewPlayer` wrapping the official custom element with Ripple
  controls and states
- desktop and mobile preview-pane wiring from selected Ripple project state

Automated validation passed for focused source tests, `bun run test:ripple`,
`bun run build`, and `git diff --check`. `bun run ts:check` still fails on the
existing baseline type errors in legacy/main agent surfaces; no new Phase 4
files are implicated in that output. Live Electron QA passed against
`~/Ripple/test1`: the preview reaches ready state, renders the composition,
reports the normalized `0:06` duration, and plays through using the official
player controls.

The current iteration keeps the Ripple-owned player UI and moves source
preparation behind a main-process adapter. Ripple asks for an approved preview
URL, fetches that prepared document, and gives the official player a
same-origin object URL through `src`. Ripple keeps its native controls while
HyperFrames owns more of the preview pipeline.

The latest visual refinement removes the Phase 4 preview header entirely.
Controls now sit below the player as a scrubber plus floating icon row: play,
loop, playback speed, mute, restart, timecode, settings, and fullscreen.
Settings owns zoom and reload. The surrounding preview background is
`bg-tl-background`, so light and dark themes use the app surface instead of a
hard-coded black stage.

The follow-up polish pass reduced the bottom chrome height further. The scrubber
now uses a three-pixel visual track with quieter time labels and a slim playhead,
and the icon row uses smaller 28px touch targets so the preview gets more
vertical breathing room.

The final scrubber pass removes the endpoint time labels and replaces the native
range control with a custom accessible slider. At rest the timeline is a
hairline; on hover or scrub it expands like the Frame.io reference and shows a
small timecode bubble at the pointer. The preview stage uses tighter padding so
the composition reaches closer to the player pane border while still leaving a
small app-surface margin.

The latest reference pass keeps the Frame.io-style behavior but makes the rail
more legible and theme-native. The inactive timeline rail is a gray mixed from
the active appearance's foreground and `--tl-background`, the completed segment
uses `--primary`, the playhead uses the active foreground mix, and the hover
timecode uses the app's popover surface. This preserves the Frame.io layout
without hard-coding Frame.io's purple or dark chrome.

The review follow-up keeps only controls that have real behavior in the current
HTML player. Zoom stays because it changes the preview scale immediately, while
quality is omitted until Ripple can connect it to a preview-source, render, or
reload path. The close affordance is tied to the host-provided `onClose`
callback, so both desktop sidebars and mobile preview mode can expose the same
product action without restoring the old top header.

## Context and Orientation

Ripple is being rebuilt from a 1Code-shaped Electron app into a local-first
motion graphics app. Phase 1 removed mandatory auth/provider gates. Phase 2
created a project-first flow that writes HyperFrames project files under
`~/Ripple/<project-name>`. Phase 3 added main-process HyperFrames orchestration
and typed tRPC calls for runtime checks, composition discovery, preview,
snapshot, render, and cancellation.

The existing renderer still has 1Code preview machinery. In desktop chat,
`src/renderer/features/agents/main/active-chat.tsx` can open a right
`ResizableSidebar` containing `AgentPreview`. On mobile,
`src/renderer/features/agents/ui/agents-content.tsx` has a full-screen preview
mode. Those surfaces are the right entry points for Phase 4, but their current
source of truth is coding-agent preview metadata rather than Ripple project
state.

The HyperFrames player should use the selected Ripple project and official
HyperFrames player primitives. The renderer must not spawn shell commands or
trust arbitrary absolute paths. Main-process routes should resolve selected
projects, validate project/composition ownership, and return only structured
data or approved source descriptors needed by the player.

## Plan of Work

First, run the official-package integration spike. Verify the current package
versions, then install or pin the HyperFrames package family as one exact
version. The expected package set is:

- `hyperframes`
- `@hyperframes/player`
- `@hyperframes/core`
- `@hyperframes/studio`, only if a focused primitive is required

Second, prove the smallest renderer smoke. Import the official player
primitive, load a scaffolded Ripple composition through a
main-process-approved source, and prove `ready`, `timeupdate`, `play`,
`pause`, `seek`, `currentTime`, and `duration` work in Electron.

Third, design the main-process source contract. The renderer should pass a
`projectId` and optional `compositionId`. The main process should resolve the
project, reject archived or missing projects, select a saved composition, and
return the structured source data required by the official player. Do not
expose arbitrary file paths.

Fourth, implement `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`.
The component should be a Ripple wrapper around the official player primitive,
not a copy of Studio and not a parallel timing engine. It should provide:

- no persistent top preview header in the normal player surface
- loading, ready, stopped, and error states
- play, pause, seek, restart, loop, speed, mute, reload, and fullscreen controls
- frame/time display with a central timecode
- zoom settings where they still make sense

Fifth, wire preview availability into the existing desktop and mobile preview
entry points. Ripple projects should open the HyperFrames player; existing
coding-agent preview behavior should remain unchanged.

Sixth, validate live in Electron. Phase 4 is not complete until a scaffolded
project visibly plays in the app and the player controls work there.

If the official player cannot be imported, packaged, loaded, or controlled in
Electron, stop and record the exact blocker. Do not ship another substitute
player path without an explicit user decision.

Next, run the Level 2 architecture spike. The goal is not to change the visual
UI. The goal is to run `@hyperframes/player` from a HyperFrames-prepared local
preview URL. Start with a throwaway smoke that compares local URL options in
Electron:

- a `ripple-preview:` prepared preview URL
- a loopback `http://127.0.0.1:<port>` prepared preview URL, only if protocol
  origin behavior blocks `ripple-preview:`

For each mode, record whether the player reaches `ready`, reports `duration`,
emits `timeupdate`, and responds to `play`, `pause`, and `seek`. Also record
whether nested compositions, assets, media, fonts, and runtime scripts load
without CDN requests.

If `src` mode works, prototype the main-process preview-serving adapter. The
adapter should resolve the Ripple `projectId` to a validated project directory,
select the active composition, and serve only read-oriented preview assets
needed by the player. It should reuse HyperFrames preview/core/studio-api
primitives where possible. It should not shell out from the renderer, open
external Studio, expose absolute filesystem paths, or mount broad Studio
mutation routes.

Once the adapter exists, update `HyperFramesPreviewPlayer` to use the prepared
URL through the official player's `src` attribute. Do not keep a renderer
`srcdoc` fallback switch. If the prepared URL path fails in Electron, record
the blocker and stop for an architecture decision rather than shipping a second
player path.

Use the same adapter shape as the foundation for Phase 5 and Phase 6. The
timeline, assets, and compositions panes should ask main-process APIs for
structured HyperFrames/project data, then render Ripple-styled UI. HyperFrames
should own composition structure, timing rules, preview-serving behavior, and
future framework updates; Ripple should own the user-facing panels, controls,
chat, comments, revisions, widgets, and export workflow.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Completed. Re-check package availability:
   `npm view hyperframes version`,
   `npm view @hyperframes/player version`,
   `npm view @hyperframes/core version`, and
   `npm view @hyperframes/studio version`.

2. Completed. Inspect official package entry points after installation:
   `node_modules/@hyperframes/player/package.json`,
   `node_modules/@hyperframes/core/package.json`, and
   `node_modules/@hyperframes/studio/package.json`.

3. Completed. Pin the package family exactly in `package.json` and `bun.lock`.

4. Completed in the renderer component path. Build a small local smoke for the official player. The smoke should load a
   scaffolded Ripple composition, report readiness, expose duration, respond to
   play/pause, and seek to a requested time.

5. Completed. Add a main-process tRPC procedure for the official player source contract.
   It must resolve project/composition ownership and return only the data the
   official player needs.

6. Completed. Implement `HyperFramesPreviewPlayer` around the official player primitive.

7. Completed. Wire `HyperFramesPreviewPlayer` into:
   `src/renderer/features/agents/main/active-chat.tsx` and
   `src/renderer/features/agents/ui/agents-content.tsx`.

8. Completed. Add focused tests for pure utilities and main-process source selection.

9. Completed. Run automated validation and update this plan with exact results.

10. Completed. Ran Electron smoke validation and updated this plan with live
    player notes.

11. Completed. Create a small local spike that exercises
    `@hyperframes/player` with `src` against a prepared preview URL and records
    the `ripple-preview:` origin/readiness behavior.

12. Completed. Inspect the installed HyperFrames preview/core/studio-api
    routes and identify the smallest read-only subset Ripple can reuse for
    embedded preview serving.

13. Completed. Prototype a main-process adapter that maps Ripple `projectId`
    and `compositionId` to a HyperFrames-prepared preview document URL without
    opening external Studio.

14. Completed. Update CSP and protocol/session registration only as required
    by the selected serving strategy. Keep the policy as narrow as practical.

15. Completed. Teach `HyperFramesPreviewPlayer` to use the prepared URL path
    through the official player's `src` attribute, with no renderer `srcdoc`
    fallback.

16. Completed. Add validation coverage for source selection, project-boundary
    enforcement, no-CDN runtime loading, nested compositions, and player
    readiness events.

17. Completed. Extend QA coverage around nested compositions, media, fonts,
    reload-after-edit behavior, bundled runtime/GSAP loading, renderer reload
    cache busting, and packaged-app dependency configuration.

## Validation and Acceptance

Automated validation:

- focused `bun test` for new preview/source utilities
- `bun run test:ripple`
- `bun run build`
- `bun run ts:check`, recording the existing baseline failures if they remain
  and confirming no new Phase 4 files are implicated
- `git diff --check`
- package configuration smoke for HyperFrames package pinning and unpacked
  runtime packages used by packaged preview

Manual/Electron validation:

- Start the app with `bun run dev`.
- Create or open a Ripple project with the default scaffold.
- Open the preview pane using the existing preview affordance.
- Confirm the pane shows the Ripple HyperFrames player, not a blank workspace
  and not a copied Studio page.
- Confirm the preview uses the selected project and active composition.
- Confirm loading, ready, reload/restart, stopped, close, and error states.
- Confirm play, pause, seek, frame/time display, and duration are driven by the
  official HyperFrames player API.
- Confirm the player preserves the correct composition aspect ratio and does
  not overlap controls at narrow or wide pane widths.
- Confirm the implementation does not unexpectedly open the user's external
  browser.
- Confirm normal local use does not require CDN runtime assets.
- Confirm existing non-Ripple coding-agent preview behavior is unaffected.
- Confirm nested compositions resolve their own nested composition sources,
  images, video, audio, and font URLs from the selected project.
- Confirm reload fetches a freshly prepared document after an agent edits the
  active composition file.
- Confirm packaged app configuration includes the HyperFrames packages, GSAP,
  and CLI/runtime assets outside `app.asar` where Electron can load them.
- Confirm the normal player surface has no persistent top composition/status
  header.
- Confirm zoom lives inside settings, while playback speed is a direct player
  control.
- Confirm fullscreen expands the player surface and keeps the floating control
  row available.

Manual result, 2026-04-26:

- Opened `~/Ripple/test1` in the live Electron app with DevTools attached.
- Confirmed the player no longer logs `ERR_UNKNOWN_URL_SCHEME`, CDN CSP
  runtime loading blocks, missing GSAP timeline errors, play-time runtime
  errors, or React `transform-origin` warnings.
- Confirmed the preview reaches ready state, plays, exposes a `0:06` duration,
  and lets the user restart/pause through Ripple-owned controls.
- Confirmed the remaining console warnings are the official player iframe
  sandbox warning, existing Jotai deprecation, and Electron development CSP
  warning.

Manual result, 2026-04-26 visual refinement:

- Started the dev Electron app with `bun run dev` and used Computer Use against
  `com.github.Electron` / `localhost:5173`.
- Confirmed the old `Main` / project / status / reload / close header is gone
  in the dev player surface.
- Confirmed the preview area uses the light app background around the player
  instead of a hard-coded black pane.
- Confirmed play changes to pause, advances the scrubber and timecode, restart
  returns to `00:00:00:00`, and the playback-speed menu updates the visible
  value to `1.5x`.
- Confirmed settings opens quality and zoom submenus, zoom selection updated
  the visible setting to `125%`, and reload remained available inside settings
  during this visual pass. Quality was later removed as a review follow-up until
  it controls a real preview or render path.
- Confirmed fullscreen expands the player surface and the same control row stays
  available with an exit-fullscreen button.

Manual result, 2026-04-26 compact controls refinement:

- Started the dev Electron app and used Computer Use against
  `com.github.Electron` / `localhost:5173`.
- Confirmed the smaller player controls render without overlap in the desktop
  preview pane.
- Confirmed the timeline reads as a thin scrubber with quieter endpoint labels
  and a slim playhead.
- Confirmed play advanced the official player time, restart returned to
  `00:00:00:00`, settings still opened, and fullscreen kept the compact control
  row available.

Manual result, 2026-04-26 Frame.io timeline refinement:

- Replaced the native slider with a custom accessible timeline that supports
  pointer scrubbing, keyboard seek, a hover/scrub timecode bubble, and a
  hairline-to-expanded hover state.
- Removed the small current-time and duration labels on either side of the
  timeline.
- Reduced stage padding so the composition sits closer to the pane border.
- Live Computer Use QA confirmed the endpoint labels are gone, the preview
  sits closer to the pane border with only a small margin, and pointer scrubbing
  expands the timeline while showing a timecode bubble.

Manual result, 2026-04-26 theme-native timeline refinement:

- Increased the timeline rail from the too-thin hairline to a visible
  Frame.io-like track while keeping the hover/scrub expansion behavior.
- Switched timeline rail, playhead, completed progress, and hover timecode to
  active app appearance tokens rather than fixed Frame.io colors.
- Further tightened preview-stage padding so the player reaches almost to the
  pane edges while preserving a small visible app-surface margin.
- Live Computer Use QA confirmed the rail is visible in the current light
  appearance, the preview nearly reaches the right-pane borders, and drag
  scrubbing still updates the central timecode with the hover bubble visible.

Manual result, 2026-04-26 review follow-up:

- Restored the visible close affordance for desktop preview sidebars by
  rendering it whenever the host passes `onClose`.
- Removed the preview quality submenu because it only updated local label state
  and did not affect `getPlayerSource`, the fetched blob source, player state,
  or render output.
- Added `preview-player-controls.test.ts` to keep close visibility, settings
  membership, and zoom options covered by `bun run test:ripple`.

Broadened QA result, 2026-04-26:

- Focused HyperFrames tests passed 17/17. They now cover approved preview URLs,
  project-boundary path rejection, media/font MIME mapping, bundled runtime and
  GSAP loading, legacy starter timing normalization, HyperFrames-prepared
  source documents, no-CDN runtime/GSAP replacement, helper-injected GSAP CDN
  replacement, nested composition/media/font rebasing, reload after project-file
  edits, renderer reload cache busting, blob source diagnostics, CSP support for
  local player channels, and packaged-app dependency configuration.
- `bun run test:ripple` passed 69/69.
- `bun run build` passed.
- `bun run package` passed after the Electron runtime download was allowed. It
  produced `release/mac-arm64/1Code.app`; `@hyperframes/core`,
  `@hyperframes/player`, `@hyperframes/studio`,
  `@hyperframes/core/dist/hyperframe.runtime.iife.js`, and
  `gsap/dist/gsap.min.js` were present under `app.asar.unpacked`.
- `git diff --check` passed.
- `bun run ts:check` still fails on the existing repo-wide baseline in legacy
  credential/auth imports, Claude/router typing, agent/chat preview surfaces,
  plugin source unions, terminal/mention utilities, and remote API typing. No
  new Phase 4 player/source/protocol/helper/package-config test files appeared
  in that failure output.

Acceptance for Phase 4:

- Ripple projects can be previewed from the existing preview pane.
- The player is powered by official HyperFrames player/runtime primitives.
- The player has app-owned controls and clear states in Ripple's current UI
  style.
- The renderer does not spawn HyperFrames, FFmpeg, shell commands, or arbitrary
  filesystem operations.
- The renderer receives only main-process-approved project/composition source
  data.
- The implementation does not introduce the assets/compositions pane, the
  right chat/comment review sidebar, persistent comments, revision workflow, or
  export UI.
- If the official player architecture is blocked, Phase 4 stops at a documented
  blocker and next-step decision.

Acceptance for the next Level 2 architecture pass:

- The user-visible player still looks and behaves like Ripple, not embedded
  HyperFrames Studio.
- `@hyperframes/player` loads an approved local preview URL through `src` and
  reaches `ready` in Electron.
- HyperFrames-owned preview preparation handles runtime loading, nested
  compositions, asset references, and timeline semantics without Ripple
  duplicating those rules in renderer code.
- The app does not open an external browser or full Studio window during normal
  preview.
- The serving adapter exposes only preview-safe read paths for the selected
  Ripple project and composition.
- Normal preview does not request CDN scripts or other network runtime assets.
- Phase 5 can reuse the adapter/project metadata path for timeline controls,
  and Phase 6 can reuse it for the assets/compositions pane.

## Idempotence and Recovery

The official player wrapper should be restartable without leaking listeners,
timers, or player instances. Opening and closing the preview pane should not
leave orphaned playback state.

If package installation creates a version mismatch, revert only the Phase 4
dependency edits and either pin the entire HyperFrames family to one working
version or stop with the exact incompatibility recorded.

If a refactor of `AgentPreview` risks existing coding-agent preview behavior,
keep the HyperFrames player in a separate component until a shared abstraction
is proven safe.

The Level 2 spike should stay focused on the prepared URL path. Do not restore
the renderer `srcdoc` fallback. If `src` mode fails because of player
origin/readiness behavior, preserve the evidence, including console messages
and event traces, then decide whether to adjust the serving origin or
upstream/patch the player readiness bridge.

If a local HTTP serving adapter is introduced, it must have explicit lifecycle
ownership in the main process. Starting, restarting, and stopping the adapter
for the same project should be repeatable. It must not leave orphaned preview
servers after the project changes, the preview pane closes, or the app quits.

If HyperFrames changes package exports or preview route behavior, prefer
adapting the small main-process adapter over pushing compatibility hacks into
renderer UI components.

## Interfaces and Dependencies

Existing interfaces to use:

- `selectedProjectAtom` from `src/renderer/features/agents/atoms`
- `agentsPreviewSidebarOpenAtom` and `agentsPreviewSidebarWidthAtom`
- preview-pane helpers in `src/renderer/features/agents/ui/`
- `ResizableSidebar`
- `trpc.hyperframes.doctor`
- `trpc.hyperframes.listCompositions`
- `window.desktopApi.openExternal`, only for explicit user actions

New interfaces:

- `HyperFramesPreviewPlayer`
- `trpc.hyperframes.getPlayerSource`
- `ripple-preview:` Electron protocol
- `buildHyperframesPlayerSourceDocument`
- `selectHyperframesPlayerComposition`
- `getRipplePreparedPreviewDocument`
- `prewarmRipplePreparedPreviewDocument`
- `prewarmRipplePreviewPlayer`
- `takeRipplePrewarmedPreviewPlayer`

Candidate next interfaces:

- `trpc.hyperframes.getPreparedPreviewSource` or an evolution of
  `getPlayerSource` that returns an approved local preview URL
- main-process HyperFrames preview-serving adapter
- read-only timeline/project/composition/asset metadata APIs for Phase 5 and
  Phase 6
- narrow CSP/protocol allowances for the selected prepared-preview origin

Dependencies and constraints:

- Use React 19, Jotai, tRPC/React Query, Radix wrappers, Tailwind, and lucide
  icons already present in the app.
- Prefer official HyperFrames packages for the player architecture:
  `hyperframes`, `@hyperframes/player`, `@hyperframes/core`, and optionally
  selected `@hyperframes/studio` primitives.
- Pin the HyperFrames package family to exact `0.4.30` versions.
- Keep filesystem and process orchestration in the main process.
- Keep local-first usage free of mandatory auth, GitHub, repo setup, manual
  dependency installs, and provider selection.
- Avoid normal-path CDN dependency for HyperFrames player/runtime assets.
- For the next architecture pass, prefer HyperFrames-owned preparation through
  `@hyperframes/core` / `@hyperframes/studio` preview primitives or the smallest
  equivalent preview-serving subset. Avoid launching the full CLI preview flow
  if it opens an external Studio/browser window.
- Keep a future motion-framework adapter in mind, but do not introduce a broad
  abstraction until the HyperFrames-backed path is stable.

## Artifacts and Notes

Source inspection evidence gathered while creating this plan:

- `src/renderer/features/agents/main/active-chat.tsx` already renders the
  preview pane as a right `ResizableSidebar`.
- `src/renderer/features/agents/ui/agent-preview.tsx` already implements useful
  preview UI patterns: loading, reload, viewport, scale, device presets,
  sizing controls, URL/path display, and external open.
- `src/renderer/features/agents/ui/agents-content.tsx` currently derives
  preview availability from CodeSandbox chat metadata.
- `src/main/lib/trpc/routers/hyperframes.ts` exposes the Phase 3 service calls
  the player-adjacent source contract should build on.
- Local package inspection confirmed `hyperframes@0.4.28` is installed and
  `@hyperframes/player`, `@hyperframes/studio`, and `@hyperframes/core` are not
  installed in this checkout.
- Registry checks on 2026-04-26 found `hyperframes`,
  `@hyperframes/player`, `@hyperframes/studio`, and `@hyperframes/core` at
  `0.4.30`; the package family is now pinned to that version.
- User feedback on 2026-04-26 rejected the temporary non-player implementation
  because it opened HyperFrames Studio externally and did not play in the app.
  Phase 4 must now proceed through the official player architecture or stop for
  discussion.
- `@hyperframes/player` is imported only in the renderer. The main process does
  not import the `@hyperframes/core` package root; it serves the exported
  runtime file through the local protocol.
- Architecture review on 2026-04-26 selected the middle path for the next pass:
  Ripple remains the UI layer, `@hyperframes/player` remains the embedded
  player, and HyperFrames should prepare/serve the preview document wherever
  practical.
- Known blockers to investigate before switching fully to `src`: official
  player readiness across iframe origins, CSP for the selected preview origin,
  avoiding external Studio/browser launches, limiting preview-server routes to
  safe read operations, and proving nested compositions/assets/media work
  without CDN runtime requests.
