# Phase 14: Agent Visual Context

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple can show an agent what the user is looking at. When a
user leaves a comment on a motion graphic, Ripple captures the current frame and
keeps it with the comment. When a user comments on a time range, Ripple can
capture a small frame sheet for that range. When an agent is asked to create or
revise a HyperFrames composition, Ripple can provide compact visual references
as image attachments plus text metadata so the agent does not have to infer the
current visual state from HTML alone.

The product behavior should feel simple:

- a timestamp comment automatically gets a removable current-frame screenshot
- a range comment can get a compact frame sheet for that range
- chat can include visual context such as current frame or frame sheet
- agents can ask for or receive visual context without exposing project plumbing

The implementation must stay local-first and main-process-owned. The renderer
may request a capture, but it must not launch privileged shell commands, write
arbitrary paths, or hand untrusted absolute paths to the agent runtime. Capture
must use HyperFrames preview/snapshot/player paths and validated project or
revision contexts.

This phase should make agents better at motion work, not turn Ripple into a
generic video thumbnail app. FFmpeg-style contact sheets are a useful reference,
but Ripple's source of truth is the active HyperFrames composition, selected
preview target, timeline time, and isolated generated-change context.

## Progress

- [x] 2026-05-02 / User + Codex: Started Phase 14 planning. User direction:
  automatically attach the current timestamp screenshot to comments; provide an
  easy frame-sheet utility for app agents, Codex, Claude Code, and Codespaces;
  allow flexible sampling such as every second, every few frames, and selected
  ranges; support comments over time ranges.
- [x] 2026-05-02 / Codex: Ran a read-only product and tooling research pass.
  Useful references include HyperFrames `snapshot`, FFmpeg `select` / `fps` /
  `tile` / `drawtext`, PySceneDetect scene sampling, and `vcsi` video contact
  sheets. The conclusion is to build a Ripple visual-context service around
  HyperFrames capture, with FFmpeg-style sheet assembly where useful.
- [x] 2026-05-02 / Codex: Inspected existing Ripple architecture. Relevant
  code exists in `src/main/lib/hyperframes/snapshot.ts`,
  `src/main/lib/hyperframes/project-context.ts`,
  `src/main/lib/revisions/comment-revisions.ts`,
  `src/main/lib/agent-runtime/runtime-attachments.ts`, and
  `src/shared/agent-runtime-attachments.ts`.
- [ ] Implement Milestone 0: capture and sheet-assembly prototype.
- [ ] Implement Milestone 1: visual-context artifact model and safe store.
- [ ] Implement Milestone 2: main-process visual-context service and tRPC API.
- [ ] Implement Milestone 3: automatic comment screenshots and range comments.
- [ ] Implement Milestone 4: agent-runtime visual attachment integration.
- [ ] Implement Milestone 5: agent-friendly CLI/tooling surface.
- [ ] Implement Milestone 6: UI polish, limits, cleanup, and validation.

## Surprises & Discoveries

- Observation: HyperFrames already has the right first primitive. Its CLI
  `snapshot` command can capture PNG frames at explicit timestamps or capture a
  requested number of evenly spaced frames. Ripple should prefer this
  deterministic HyperFrames path over generic video screenshots when capturing
  HTML composition state.

- Observation: Ripple already has a snapshot helper, but it currently resolves
  only the default project context. Phase 14 needs visual context for Main,
  isolated comment revisions, and chat worktree previews. The service should
  use `resolveHyperframesPreviewContext` rather than only
  `resolveHyperframesProjectContext`.

- Observation: `comment_threads.screenshot_path` already exists. It is useful
  for a single current-frame thumbnail, but it is not enough to model frame
  sheets, multiple sampled frames, artifact metadata, cleanup state, dimensions,
  byte size, source preview kind, or manifest paths.

- Observation: Existing manual attachments are serialized into conversation
  message parts as base64 `data-image` / `data-file` entries. That is fine for
  explicit user uploads, but automatic screenshots and frame sheets should not
  blindly add large base64 blobs to long-lived transcript history. Visual
  context should be stored as project-local artifacts and materialized into
  runtime attachments only when an agent run needs them.

- Observation: The runtime attachment path is already close to what Phase 14
  needs. `prepareRuntimeAttachments` validates size/count limits, writes files
  under `.ripple/tmp/agent-attachments/<runId>`, adds provider-native image
  blocks when possible, and includes a text fallback path list.

- Observation: The package already includes `@ffmpeg-installer/ffmpeg` and
  `@ffprobe-installer/ffprobe`. FFmpeg can be used for sheet assembly or
  fallback extraction, but capture from HyperFrames compositions should remain
  HyperFrames/player driven.

- Observation: Vision-provider costs and limits matter. A giant contact sheet
  may be worse than a compact 3x2 or 4x3 sheet plus a manifest. The default
  should optimize for context-window usefulness: readable enough, small enough,
  and backed by individual frames if higher detail is needed.

## Decision Log

- Decision: The product and code concept for this phase is `Visual Context`.
  User-facing labels should be "screenshot", "current frame", "frame sheet",
  and "visual reference". Primary UI should avoid "snapshot", "artifact",
  "worktree", "branch", or "manifest".
  Rationale: The feature is about helping users and agents reason about motion,
  not exposing the capture pipeline.
  Date/Author: 2026-05-02 / User + Codex

- Decision: Automatic current-frame capture belongs on comments by default.
  Rationale: A frame/time comment without a visual reference forces the agent
  to reconstruct the user's visual target. A still makes comment feedback much
  more actionable with little user effort.
  Date/Author: 2026-05-02 / User + Codex

- Decision: Time-range comments are part of Phase 14, not a later addon.
  Rationale: Motion feedback is often about a transition or beat across time.
  Range comments should preserve `startTime`, `endTime`, `startFrame`, and
  `endFrame`, and can optionally include a range frame sheet.
  Date/Author: 2026-05-02 / User + Codex

- Decision: Frame sheets are visual evidence bundles, not just one image.
  Rationale: The agent needs to know which cell corresponds to which timestamp,
  frame, composition, and preview source. Each frame sheet should have a sidecar
  manifest and, where practical, individual frames that can be inspected at
  higher fidelity.
  Date/Author: 2026-05-02 / Codex

- Decision: Visual context artifacts should be stored as files plus database
  references, not as base64 transcript payloads.
  Rationale: Base64 images in conversation history increase database size,
  repeated payload size, and provider latency. Agent runs can materialize file
  references into attachments at execution time.
  Date/Author: 2026-05-02 / Codex

- Decision: In-app capture is main-process-owned. A portable CLI can share the
  same core capture/sheet code, but the renderer must not launch shell commands
  or trust arbitrary absolute paths.
  Rationale: Phase 14 touches filesystem writes, provider inputs, revision
  contexts, and preview execution. Those belong behind typed, validated
  main-process boundaries.
  Date/Author: 2026-05-02 / Codex

## Outcomes & Retrospective

This section is intentionally empty until implementation begins. Update it with
what shipped, what changed from the plan, and what follow-up remains.

## Context and Orientation

Ripple is a local-first desktop app for creating short HyperFrames motion
graphics with chat, frame-anchored comments, generated changes, preview, and
export. By Phase 14, earlier phases are expected to provide:

- Phase 4 and 5: HyperFrames preview player and timeline/playhead state.
- Phase 7: the Ripple shell with center preview/timeline and right review pane.
- Phase 8: comments, range anchors, isolated generated-change contexts, and
  accept/delete/recover flows.
- Phase 9: Codex and Claude provider execution through the main-process agent
  runtime.
- Phase 10: conversation storage and comment chat handoff.
- Phase 11: export job architecture, safe destinations, Producer integration,
  and lessons for durable artifact jobs.
- Phase 12: template/starters work for valid HyperFrames projects.
- Phase 13: HyperFrames-aware agent prompting and skills. If Phase 13 is not
  fully complete, this phase should add only the minimal agent instructions
  needed for visual-context use and leave broader prompt cleanup to Phase 13.

Important current code paths:

- `src/main/lib/hyperframes/snapshot.ts` wraps `hyperframes snapshot` and
  validates that snapshot artifacts exist.
- `src/main/lib/hyperframes/project-context.ts` resolves Main, revision, and
  chat-worktree preview contexts.
- `src/main/lib/trpc/routers/hyperframes.ts` currently exposes a snapshot
  mutation for project-level capture.
- `src/main/lib/revisions/comment-revisions.ts` creates comment threads,
  comment messages, hidden revision conversations, and generated-change runs.
- `src/main/lib/agent-runtime/runtime-attachments.ts` prepares image/file
  attachments for providers and hidden run folders.
- `src/renderer/features/comments/RippleCommentsPane.tsx` builds and submits
  comment anchors, manual attachments, replies, and comment cards.
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` and related
  timeline helpers own current preview/playhead data in the renderer.
- `src/main/lib/exports/*` is the model for durable main-process jobs, safe
  paths, cancellation, output validation, and recovery.

Suggested artifact vocabulary for implementation:

- `current_frame`: one still image at one time/frame.
- `range_sheet`: a compact sheet tied to a user-selected comment range.
- `frame_sheet`: a sheet sampled across a composition or arbitrary range for
  agent inspection.
- `frame_sequence`: optional individual frame files that back a sheet.
- `manifest`: JSON describing source, samples, paths, dimensions, and limits.

## Plan of Work

### Milestone 0: Capture And Sheet Prototype

Prove the capture pipeline before adding schema and UI. Use a fixture Ripple
project and, if available, a generated-change preview context.

Questions to answer:

- Can the current `captureHyperframesSnapshot` helper be adapted to accept a
  `HyperframesProjectContext` from `resolveHyperframesPreviewContext`?
- Does `hyperframes snapshot --at` produce deterministic frame images for the
  active project, a revision worktree, and a chat worktree?
- What is the best sheet assembly path for v1: FFmpeg `tile`, a generated HTML
  contact sheet captured by Chromium/Electron, or another lightweight local
  approach?
- How small can the default sheet be while remaining useful to an agent?
- How should failed capture degrade in the comment composer?

Expected outcome:

- A prototype command or test helper can capture specific timestamps and create
  a small labeled sheet with a manifest.
- The plan records the selected assembly approach and rejects the alternatives
  with evidence.

### Milestone 1: Artifact Model And Safe Store

Add a first-class visual-context artifact model. Keep the existing
`comment_threads.screenshot_path` as the fast single-thumbnail field, but add a
broader model for screenshots and frame sheets.

Likely table: `visual_context_artifacts`.

Likely fields:

- `id`
- `projectId`
- `compositionId`
- `conversationId`
- `commentThreadId`
- `revisionId`
- `agentRunId`
- `sourceKind`: `main`, `comment_revision`, `chat_worktree`, or `project_dir`
- `sourceContextKey`
- `kind`: `current_frame`, `range_sheet`, `frame_sheet`, or `frame_sequence`
- `relativePath`
- `manifestPath`
- `thumbnailPath`
- `mediaType`
- `width`
- `height`
- `sizeBytes`
- `fps`
- `startTimeMs`
- `endTimeMs`
- `startFrame`
- `endFrame`
- `sampleCount`
- `metadataJson`
- `createdAt`
- `deletedAt`

Store generated files under the canonical project root, not inside a disposable
revision worktree:

```text
.ripple/
  visual-context/
    <artifact-id>/
      current-frame.png
      frame-sheet.webp
      frames/
        frame-000-at-0.000s.png
      manifest.json
```

When the capture source is a revision or chat worktree, the service may capture
temporary files inside that context, but the durable artifact copied into the
primary project store must be path-validated and realpath-checked. Do not leave
the only copy in a generated-change workspace that cleanup may remove.

### Milestone 2: Main-Process Visual Context Service

Create a main-process service, likely:

- `src/main/lib/hyperframes/visual-context.ts`
- `src/main/lib/hyperframes/frame-sheet.ts`
- `src/shared/ripple-visual-context.ts`
- a `visualContext` tRPC router, or additions to `hyperframes` if that fits the
  existing router shape better

Core service operations:

- `captureCurrentFrame(input)`
- `captureFrameSheet(input)`
- `listVisualContextArtifacts(input)`
- `getVisualContextArtifact(input)`
- `deleteVisualContextArtifact(input)`
- `materializeVisualContextAttachments(input)`

The capture input should support:

- `projectId`
- optional `compositionId`
- optional `revisionId`
- optional `chatId`
- optional `conversationId` and `commentThreadId`
- `timeMs` or `frame`
- `startTimeMs` / `endTimeMs`
- `startFrame` / `endFrame`
- sampling by `samples`, `everyMs`, or `everyFrames`
- `includeEndpoints`
- output profile such as `thumbnail`, `agentCompact`, or `reviewLarge`

Validation rules:

- Resolve source through `resolveHyperframesPreviewContext`.
- Select composition with existing HyperFrames composition selection helpers.
- Clamp times and frames to known duration/fps when available.
- Enforce a max sample count for v1. Start with 12 or fewer by default.
- Enforce byte limits compatible with existing runtime attachment limits.
- Write only under canonical project `.ripple/visual-context`.
- Use realpath checks for artifact directories and final files.

### Milestone 3: Comment Screenshots And Range Comments

Add automatic capture to the comment submission path.

Expected user behavior:

- When a user starts a frame comment, the composer shows a small current-frame
  visual chip once capture succeeds.
- The chip can be removed before sending.
- Submitting the comment stores `comment_threads.screenshot_path`.
- If capture fails, the comment can still be submitted with a clear lightweight
  warning. The failure should not silently create wrong context.
- A range selection in the timeline can create a range comment.
- A range comment stores start/end time and frame values and can include a
  compact range sheet.

Likely renderer work:

- Extend `RippleCommentsPane.tsx` comment draft state with visual-context
  references, not base64 payloads.
- Reuse existing attachment chips visually, but distinguish automatic visual
  context from manually uploaded files.
- Add range affordances where the timeline already exposes selected range data.
- Show the saved thumbnail on comment cards.

Likely main-process work:

- Extend `createCommentThread` and `addCommentReply` input contracts to accept
  visual-context artifact refs in addition to manual attachments.
- Validate that artifact refs belong to the same project, composition, source
  context, and comment draft.
- Keep manual uploads working through the existing attachment path.

### Milestone 4: Agent Runtime Integration

Feed visual context to agents without bloating transcripts.

Current manual attachments are stored in conversation parts as base64
`data-image` / `data-file`. For automatic visual context, add a reference-based
message part or metadata shape such as:

```json
{
  "type": "visual-context-ref",
  "artifactId": "vc_...",
  "role": "current_frame"
}
```

Runtime behavior:

- Generated-change scheduler and normal chat runtime should resolve
  `visual-context-ref` parts immediately before execution.
- Resolution reads the artifact file from the validated project store and turns
  it into an `AgentRuntimeAttachment`.
- Providers with image support receive native image blocks or local image
  inputs through the existing adapter paths.
- Providers without image support receive text fallback metadata: composition,
  source, time range, sampled timestamps, frame numbers, and artifact file
  paths.
- The prompt for comment-generated changes should mention the visual reference
  in motion language, not implementation language.

Update `src/main/lib/revisions/comment-prompt.ts` so generated-change prompts
include visual context facts, for example:

- "The comment includes a current-frame screenshot at 00:02.400, frame 72."
- "The range sheet samples 00:02.000, 00:02.500, 00:03.000, and 00:03.500."
- "Use the visual reference to judge layout, motion state, visible text, and
  timing."

### Milestone 5: Agent-Friendly CLI / Tooling Surface

Build a reusable tool that agents can call inside a project without knowing
Electron internals. The in-app service and CLI should share as much core logic
as possible.

Target first-pass CLI shape:

```bash
ripple visual-context frame --dir . --at 2.4 --json
ripple visual-context sheet --dir . --range 2.0..6.0 --samples 8 --json
ripple visual-context sheet --dir . --range 2.0..6.0 --every 0.5s --json
ripple visual-context sheet --dir . --range 2.0..6.0 --every-frames 5 --json
```

If the app does not yet have a stable public `ripple` binary, start with an
app-managed script or bundled helper command and keep the command contract
stable. Do not block the main app behavior on packaging a public npm package.

CLI requirements:

- Works from a plain HyperFrames project directory without app database access.
- Writes to `.ripple/visual-context`.
- Prints machine-readable JSON by default or with `--json`.
- Never requires interactive prompts.
- Supports clear error output for missing Node, FFmpeg, FFprobe, Chrome, or
  invalid HyperFrames project structure.
- Can be referenced by Phase 13 skills/prompt context for Codex, Claude Code,
  and Codespaces.

### Milestone 6: UX Polish, Cleanup, Limits, And Validation

Keep the visible UI small and motion-tool-like.

Expected UI:

- Comment composer: visual chip for current frame or range sheet.
- Comment card: thumbnail near the anchor/time label.
- Chat composer: compact controls for current frame and frame sheet visual
  context, probably near existing attachment controls.
- No new right-pane mode for visual context in v1.
- No primary-path terms like artifact, worktree, branch, snapshot, or manifest.

Cleanup and limits:

- Add cleanup for deleted comments, discarded generated changes, and old
  temporary capture outputs.
- Keep accepted/comment history artifacts unless the user deletes the comment or
  clears project-generated visual context.
- Enforce per-artifact and per-project visual-context size limits.
- Prefer WebP or JPEG for frame sheets when transparent alpha is not needed;
  use PNG for exact stills and transparent compositions.

## Concrete Steps

1. Re-read this plan, `ROADMAP.md`, `PLANS.md`, and relevant current code paths.
2. Prototype capture for Main with `hyperframes snapshot --at`.
3. Prototype capture for a revision/chat preview context using
   `resolveHyperframesPreviewContext`.
4. Prototype frame-sheet assembly from captured PNGs and record the selected
   approach in `Surprises & Discoveries` and `Decision Log`.
5. Add shared visual-context types in `src/shared/ripple-visual-context.ts`.
6. Add Drizzle schema and migration for `visual_context_artifacts`.
7. Build `src/main/lib/hyperframes/visual-context.ts` and path helpers.
8. Add tRPC mutations/queries for capture, list, get, and delete.
9. Add focused tests for path validation, source-context resolution, sampling
   math, manifest writing, and artifact cleanup.
10. Wire automatic current-frame capture into comment draft creation and submit.
11. Add range-comment visual context support from timeline selection.
12. Add visual-context refs to comment/conversation message storage without
    base64 image bloat.
13. Teach generated-change scheduler and normal runtime sends to materialize
    visual-context refs into runtime attachments.
14. Add prompt fallback text for non-vision providers.
15. Add the agent-friendly CLI/helper command and ensure it shares core logic.
16. Add renderer UI polish and visual chips.
17. Run validation and update this plan with results.

## Validation and Acceptance

Focused validation:

- Unit tests for sampling:
  - timestamp list
  - every N milliseconds
  - every N frames
  - evenly sampled ranges
  - include endpoints
  - duration/fps clamping
- Unit tests for artifact paths:
  - no absolute writes
  - no traversal
  - symlink escape rejection
  - revision source copied into canonical project visual-context store
- Unit tests for runtime integration:
  - visual-context ref materializes into an image attachment
  - missing/deleted artifact gives a clear non-crashing fallback
  - non-vision path includes timecode and composition metadata
- Renderer tests for:
  - comment composer visual chip
  - removable automatic screenshot
  - range comment metadata
  - comment card thumbnail display

Project-level commands:

```bash
bun run test:hyperframes
bun run test:ripple
bun test
bun run ts:check
bun run build
git diff --check
```

Manual / smoke validation:

- Create or open a Ripple project.
- Select a composition and pause at a visible frame.
- Create a comment and verify a current-frame thumbnail appears.
- Submit the comment and verify the generated-change agent receives the image
  or the text fallback.
- Select a time range, create a range comment, and verify a compact frame sheet
  is produced and referenced.
- Generate visual context for Main and for a generated-change preview, and
  verify the artifacts come from the selected preview target.
- Run the CLI/helper command from a project directory and verify it creates a
  manifest and sheet without app UI.

Acceptance criteria:

- New comments automatically include a current-frame screenshot when capture is
  available.
- Time-range comments store start/end time and frame anchors.
- Frame sheets can be generated for Main and isolated generated changes.
- Agent runs can consume current-frame and frame-sheet context as image
  attachments when supported.
- Non-vision providers still receive useful text metadata.
- No renderer path can write or attach arbitrary filesystem locations.
- Visual-context artifacts are project-local, size-limited, and cleanable.
- Primary UI uses Ripple motion-review language only.

## Idempotence and Recovery

- Capture operations should be idempotent for a given client request id where
  they are tied to a comment draft or submit.
- Retrying a failed capture should create a new artifact or replace only the
  unfinished artifact directory for that capture request.
- If a comment submit succeeds but capture fails, the comment remains valid and
  records no screenshot path. The UI can offer retry capture for that comment.
- If an artifact row exists but the file is missing, list/detail APIs should
  report a recoverable missing-artifact state and the runtime should fall back
  to text metadata.
- Cleanup must ignore artifacts still referenced by live comments,
  conversations, or agent runs.
- Deleting a comment should soft-delete or orphan-clean related visual-context
  artifacts according to the same recoverable deletion model used for comments.
- App startup recovery should mark unfinished visual-context jobs failed or
  clean up partial temp folders.

## Interfaces and Dependencies

Internal dependencies:

- `resolveHyperframesPreviewContext` for Main/revision/chat-worktree capture.
- HyperFrames snapshot/player/runtime for deterministic HTML composition frames.
- `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe` for sheet
  assembly or rendered-video fallback if chosen.
- Existing runtime attachment validation and provider adapter paths.
- Existing comment/revision/conversation storage and generated-change scheduler.
- Existing export path validation patterns for realpath and symlink safety.

External references summarized for this plan:

- HyperFrames `snapshot` captures PNG frames by timestamp or frame count.
- FFmpeg can sample and tile frames with filters such as `select`, `fps`,
  `thumbnail`, `tile`, `drawtext`, and `scale`.
- PySceneDetect can detect scene changes and save representative scene images.
- `vcsi` is a mature CLI reference for video contact sheets with timestamps,
  grids, metadata, and manual timestamp support.
- Vision models charge and resize image inputs differently, so compact default
  sheets and text manifests are important.

## Artifacts and Notes

Initial proposed manifest shape:

```json
{
  "version": 1,
  "artifactId": "vc_123",
  "kind": "range_sheet",
  "projectId": "project_123",
  "compositionId": "comp_123",
  "compositionName": "Lower Third",
  "compositionFile": "compositions/lower-third.html",
  "sourceKind": "comment_revision",
  "sourceLabel": "Current Preview",
  "timeRangeMs": [2000, 6000],
  "frameRange": [60, 180],
  "fps": 30,
  "sheet": {
    "path": ".ripple/visual-context/vc_123/frame-sheet.webp",
    "width": 1280,
    "height": 900,
    "columns": 4,
    "rows": 3
  },
  "samples": [
    {
      "cell": 1,
      "timeMs": 2000,
      "frame": 60,
      "path": ".ripple/visual-context/vc_123/frames/frame-000-at-2.000s.png"
    }
  ]
}
```

Open planning questions:

- Should v1 always store individual frames, or only store them for range sheets
  above a certain sample count?
- Should automatic comment still capture happen as soon as the composer opens,
  or only when the user submits?
- Should the default range sheet be 3x2, 4x3, or adaptive by duration?
- Should chat visual context default to current frame only, with frame sheet as
  an explicit control?
- Should the CLI command live under the eventual Ripple app binary, a standalone
  helper, or both?
