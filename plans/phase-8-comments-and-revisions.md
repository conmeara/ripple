# Phase 8: Comments And Agent Revisions

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple users can review a motion graphic the way they would
review a video: pause on a frame, leave a comment, and let an agent produce a
separate proposal for that exact piece of feedback. The proposal is previewed
next to the original project and can be accepted, rejected, or followed up with
another comment for changes.

The product should feel Frame.io-inspired without exposing implementation
terms. The user sees comments, replies, proposals, versions, previews, accept,
reject, and request changes. The hidden backend may use git worktrees and chat
sub-sessions, but primary UX must not ask the user to understand branches,
worktrees, commits, or developer setup.

This phase must reuse the useful foundations already in the app:

- Phase 7's right review pane and `Chat` / `Comments` switcher
- Phase 5's timeline range selection and playhead/frame model
- Phase 4's HyperFrames preview player and snapshot/render service paths
- existing chat/sub-chat streaming, provider routing, file/diff/changes panes,
  terminal/process management, and hidden worktree creation
- main-process path validation from `src/main/lib/git/security/*`

The most important safety rule is that comment revisions must be isolated. If
Ripple cannot create or register an isolated revision context, it must mark the
revision failed and show a recoverable error. It must not silently run the agent
against the primary project folder.

## Progress

- [x] 2026-04-27 / User + Codex: Started Phase 8 planning. Product direction:
  comments should borrow heavily from Frame.io, each actionable comment should
  get an agent response in its own isolated worktree, and the user should accept,
  reject, or request changes from the comment thread.
- [x] 2026-04-27 / Codex: Read `PLANS.md`, `ROADMAP.md`, Phase 7 shell plan,
  current schema, chat creation, worktree helper, path-security helpers,
  HyperFrames snapshot routes, timeline selection helpers, and the Phase 7
  `RippleReviewPane` placeholder before drafting this plan.
- [ ] Implement Milestone 1: comment/revision data model and main-process
  service skeleton.
- [ ] Implement Milestone 2: comment capture UI in the Phase 7 review pane,
  preview player, and timeline.
- [ ] Implement Milestone 3: strict isolated revision context creation and
  provider execution routing.
- [ ] Implement Milestone 4: proposal preview, diff, accept, reject, and cleanup.
- [ ] Implement Milestone 5: follow-up comments, proposal history, and recovery
  hardening.

## Surprises & Discoveries

- Observation: Phase 7 already created the right UX insertion point for this
  work.
  Evidence: `src/renderer/features/ripple-shell/RippleReviewPane.tsx` has a
  `CommentsPane` placeholder with filter/search/actions and a timecode-shaped
  comment input, while `RippleShell.tsx` passes `rightPaneMode` into embedded
  `ChatView`.

- Observation: The existing chat worktree path is useful but too permissive for
  comment revisions as-is.
  Evidence: `src/main/lib/trpc/routers/chats.ts` calls `createWorktreeForChat`
  when `useWorktree` is true, but on failure it updates `chats.worktreePath` to
  the primary `project.path`. `src/main/lib/git/worktree.ts` also returns the
  project path as a success case when the project is not a git repository.

- Observation: The timeline already has a durable anchor shape for comments.
  Evidence: `src/shared/hyperframes-timeline-model.ts` defines
  `RippleTimelineRangeSelection` with project, composition, time, frame,
  selector, clip key, and source file fields, and
  `src/renderer/features/hyperframes/timeline-model.test.ts` verifies
  frame-anchored selection data for later comments.

- Observation: Screenshot capture can start from the existing HyperFrames
  snapshot route, but Phase 8 needs a comment-specific artifact contract.
  Evidence: `src/main/lib/trpc/routers/hyperframes.ts` exposes
  `hyperframes.snapshot`, and `src/main/lib/hyperframes/snapshot.ts` writes
  changed snapshot artifacts under project-relative paths.

## Decision Log

- Decision: Treat comments as first-class review threads, not chat messages with
  metadata.
  Rationale: Users need a persistent Frame.io-style review model with anchor,
  status, replies, proposal cards, and accept/reject actions. Chat remains the
  agent execution substrate, not the domain model.
  Date/Author: 2026-04-27 / User + Codex

- Decision: One actionable user comment creates one isolated revision context.
  Rationale: The user asked for each comment to get an agent response in its own
  worktree, and the roadmap requires independently reviewable revisions.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Follow-up comments create new revision contexts rather than editing
  an already-reviewed context in place.
  Rationale: Accept/reject needs a clear proposal boundary. A "request changes"
  follow-up can fork from the previous proposal, but it should become a new
  revision row with its own context, status, diff, preview, and cleanup path.
  Date/Author: 2026-04-27 / Codex

- Decision: Revisions must use a strict isolation path that fails closed.
  Rationale: Existing chat creation intentionally falls back to project-local
  editing for normal chat convenience. Comment revisions are different: falling
  back to the primary project would violate the product promise.
  Date/Author: 2026-04-27 / Codex

- Decision: Primary UI labels are comments, replies, proposals, versions,
  accept, reject, and request changes.
  Rationale: Ripple is a motion-design tool. Worktree, branch, commit, PR, and
  cherry-pick belong only in advanced/debug or internal surfaces.
  Date/Author: 2026-04-27 / User + Codex

## Outcomes & Retrospective

Not started.

## Context and Orientation

Ripple is being rebuilt from a coding-agent desktop app into a local-first
motion-graphics app. Earlier phases established project creation, HyperFrames
preview, timeline, assets/compositions, and the center-stage shell. Phase 8 is
the first phase where the review loop becomes real.

Current relevant files:

- `src/main/lib/db/schema/index.ts` has `projects`, `compositions`, `chats`,
  and `sub_chats`, but no comment or revision tables yet.
- `src/main/lib/trpc/routers/chats.ts` owns local chat creation, initial
  message parts, chat reuse, worktree creation, archive/delete behavior,
  diff/status routes, commit actions, and rollback helpers.
- `src/main/lib/trpc/routers/claude.ts` and `src/main/lib/trpc/routers/codex.ts`
  route provider execution and must be checked so revision runs use the
  revision context path, not the primary project path.
- `src/main/lib/git/worktree.ts` creates hidden worktrees under
  `~/.ripple/worktrees/<project-slug>/<generated-folder>` for normal chats.
- `src/main/lib/git/security/path-validation.ts` treats `chats.worktreePath`,
  `projects.localPath`, and `projects.path` as registered filesystem
  boundaries. Phase 8 should extend this boundary to registered revision
  contexts or register revision contexts through hidden chats.
- `src/main/lib/hyperframes/snapshot.ts` can capture HyperFrames snapshots, but
  comment screenshots should be persisted with stable thread/revision metadata.
- `src/shared/hyperframes-timeline-model.ts` provides
  `RippleTimelineRangeSelection`, which is the right starting shape for
  frame/range/clip anchors.
- `src/renderer/features/ripple-shell/RippleShell.tsx` composes the assets
  panel, center HyperFrames preview, and right review pane for selected Ripple
  projects.
- `src/renderer/features/ripple-shell/RippleReviewPane.tsx` contains the current
  placeholder Comments mode.
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` owns the
  current player/timeline surface and should emit current time, playhead frame,
  and optional range/element selection to the comment composer.
- `src/renderer/features/details-sidebar/*`,
  `src/renderer/features/changes/*`, and
  `src/renderer/features/ripple-shell/RippleEmbeddedUtilityPane.tsx` contain the
  existing surfaces that can show files, changes, terminal output, and details
  for a worktree-backed proposal.

Terms:

- A comment thread is a review conversation attached to a composition, frame or
  range, and optionally a visible element.
- A comment message is one user, assistant, or system entry inside a thread.
- A revision is one isolated agent proposal created from a user comment or
  request-changes reply.
- A revision context is the hidden filesystem workspace where the agent edits.
  The implementation may be a git worktree, but the UI should call it a
  revision or proposal.
- Accept applies a revision proposal to the primary project.
- Reject discards a revision proposal without changing the primary project.
- Request changes adds a follow-up comment and starts a new revision proposal.

## Plan of Work

Milestone 1 builds the durable model and service boundary. Add comment thread,
comment message, and revision tables to `src/main/lib/db/schema/index.ts` plus
Drizzle migration output. Add a `src/main/lib/revisions/` service layer and a
`src/main/lib/trpc/routers/revisions.ts` router. The first router should support
listing threads for a project/composition, creating a comment thread, adding a
message, reading revision status, and marking safe terminal states. It should
not yet run agents.

Suggested schema fields:

- `comment_threads`: `id`, `projectId`, `compositionId`, `anchorType`,
  `startTime`, `endTime`, `startFrame`, `endFrame`, `elementSelector`,
  `clipKey`, `sourceFile`, `screenshotPath`, `status`, `latestRevisionId`,
  `createdAt`, `updatedAt`, `resolvedAt`
- `comment_messages`: `id`, `threadId`, `revisionId`, `role`, `body`,
  `metadataJson`, `createdAt`
- `revisions`: `id`, `threadId`, `projectId`, `compositionId`, `chatId`,
  `subChatId`, `baseRevisionId`, `baseProjectCommit`, `baseProjectHash`,
  `contextPath`, `branch`, `prompt`, `status`, `previewProjectId` or
  `previewContextKey`, `diffSummary`, `errorMessage`, `createdAt`,
  `updatedAt`, `resolvedAt`

Status values should be narrow and explicit. A practical starting set is:

- thread status: `open`, `resolved`, `archived`
- message role: `user`, `assistant`, `system`
- revision status: `queued`, `preparing`, `running`, `proposed`, `accepted`,
  `rejected`, `superseded`, `failed`

Milestone 2 turns the Comments pane into a real review UI. Replace the
placeholder `CommentsPane` with a feature boundary under
`src/renderer/features/comments/`. The pane should show thread filters, a
thread list, a selected thread transcript, status chips, proposal cards, and a
comment composer. The composer should default to the active playhead timecode
and active composition. If the user has a timeline range selected, include that
range. If the user selected a clip or element, include selector and source file
when available.

For a first working version, support frame/time and timeline-range comments.
Element-pinned comments can be added in the same phase after frame comments are
solid, using HyperFrames runtime selector data from the player iframe or Studio
helpers if they are stable enough. The preview may show comment markers on the
timeline before adding full on-frame pins.

Milestone 3 creates strict isolated revision contexts and routes agents into
them. Do not call `chats.create` directly unless it gains an explicit
`requireIsolatedContext` or equivalent option that removes both fallback paths:
worktree creation failure and non-git project success returning `project.path`.
Prefer a Ripple-owned `createRevisionContext` service that can reuse
`createWorktreeForChat` internals but validates that the returned path is not
the primary project path and is registered for the revision.

This milestone must also settle how local Ripple projects become worktree-ready.
If project creation already initialized a hidden git repo by this point, use it.
If not, Phase 8 should add an app-managed preparation step that initializes or
refreshes the hidden revision base before the first comment revision. This step
must be invisible in normal UX and must fail with a comment-level error if it
cannot safely prepare the base.

The hidden agent prompt should combine:

- the user's comment text
- project and composition identity
- frame/time/range values and timecode
- element selector, clip key, and source file if present
- screenshot path or embedded image part when available
- HyperFrames authoring rules from `AGENTS.md` / `ROADMAP.md`
- explicit instruction to edit only within the revision context and preserve
  HyperFrames data attributes, GSAP timeline registration, and project assets

Milestone 4 implements proposal review. When an agent run completes, compute a
diff summary for the revision context and show a proposal card in the thread.
The card should offer:

- preview proposal
- changed files
- accept
- reject
- request changes

Preview should reuse the Phase 4 player path, but it must be able to resolve a
revision context instead of only a primary project ID. Add a main-process
resolver that accepts a `revisionId` and validates the revision context before
building player source, timeline model, snapshot, or project browser data. Do
not let the renderer send an arbitrary absolute path.

Accept should apply the proposal to the primary project as an atomic product
action. The first implementation can require a clean primary project and fail
with a clear conflict state if the primary project changed since the revision's
base. Do not partially apply changes. After a successful accept, refresh
compositions, assets, preview source, timeline model, and project browser state,
mark the revision accepted, mark prior proposals in the thread superseded where
appropriate, and resolve the thread if the user chooses to resolve it.

Reject should mark the revision rejected and remove or archive its isolated
context through a guarded cleanup path. Cleanup failure should not change the
primary project; it should leave a recoverable maintenance warning.

Milestone 5 hardens the loop. A request-changes reply should create a new
revision based on the selected proposal or current primary project, depending
on the user's action. Multiple revisions can run at once across different
threads, but the UI should make their status obvious. Accept should be
serialized per project so two revisions cannot apply at the same time. A
restarted app should recover queued/running/proposed/failed states without
losing the thread transcript.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Re-read `PLANS.md`, `ROADMAP.md`,
   `plans/phase-7-ripple-shell-and-review-sidebar.md`, and this plan.

2. Inspect the current implementation files named in Context and Orientation,
   especially `src/main/lib/trpc/routers/chats.ts`,
   `src/main/lib/git/worktree.ts`,
   `src/main/lib/git/security/path-validation.ts`,
   `src/main/lib/trpc/routers/claude.ts`,
   `src/main/lib/trpc/routers/codex.ts`,
   `src/renderer/features/ripple-shell/RippleReviewPane.tsx`, and
   `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`.

3. Add Drizzle schema for comment threads, comment messages, and revisions.
   Generate a migration with `bun run db:generate` and inspect it before
   continuing.

4. Add shared TypeScript types for comment anchors, revision statuses, proposal
   cards, and request/response shapes. Prefer `src/shared/` for structures used
   by both main and renderer.

5. Add `src/main/lib/revisions/` with small services for creating threads,
   adding messages, preparing prompt context, creating strict isolated contexts,
   reading revision status, computing proposal diffs, accepting, rejecting, and
   cleaning up.

6. Add `src/main/lib/trpc/routers/revisions.ts` and register it with the main
   tRPC router. Inputs must use `projectId`, `compositionId`, `threadId`, and
   `revisionId`; avoid renderer-supplied absolute paths.

7. Extend or wrap the HyperFrames project context resolver so preview, timeline,
   snapshot, and project browser operations can target either a primary
   `projectId` or a validated `revisionId`.

8. Build `src/renderer/features/comments/` with query hooks, pure state helpers,
   comment composer, thread list, selected thread view, proposal card, status
   chip, and accept/reject/request-changes actions.

9. Wire the comments feature into
   `src/renderer/features/ripple-shell/RippleReviewPane.tsx` and
   `src/renderer/features/ripple-shell/RippleShell.tsx`. Keep regular chat in
   the same review pane and keep non-Ripple workspaces on their current path.

10. Wire playhead/range context from
    `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` and
    `src/renderer/features/hyperframes/HyperFramesTimeline.tsx` into the comment
    composer. Start with current frame/time and selected timeline range.

11. Add revision-aware agent execution. Either add a strict option to
    `chats.create` and provider routers or create a revision-specific execution
    route that reuses their internals. Verify the provider current working
    directory is the revision context.

12. Add proposal preview and diff surfaces. Reuse existing Changes/Files
    utilities where practical, but label them as proposal review in Comments
    mode.

13. Add accept/reject/request-changes flows with project-level serialization,
    conflict checks, refresh/invalidation, and safe cleanup.

14. Add focused tests for schema/state/service behavior as the code lands. Keep
    this plan updated with progress, discoveries, validation evidence, and
    scope changes.

## Validation and Acceptance

Automated validation:

- New schema tests or migration checks cover comment threads, messages,
  revisions, cascade behavior, indexes, and status defaults.
- Main-process revision service tests cover anchor normalization, prompt
  context creation, strict isolation failure, successful revision context
  creation, non-git or worktree-failure behavior, diff summary creation, accept,
  reject, cleanup, and repeated recovery calls.
- Provider routing tests prove Claude and Codex runs for comment revisions use
  the revision context path.
- HyperFrames resolver tests prove preview/timeline/snapshot/project-browser
  calls can target a revision only by `revisionId`, never by arbitrary renderer
  path.
- Renderer tests cover Comments mode, empty state, comment composer timecode,
  timeline range attachment, thread selection, proposal card states,
  accept/reject/request-changes actions, and disabled/error states.
- Existing focused suites continue to pass:
  `bun run test:hyperframes`, `bun run test:ripple`, `bun run build`, and
  `git diff --check`.
- `bun run ts:check` is run, or its known baseline failures are recorded with
  confirmation that new Phase 8 files are not implicated.

Manual/Electron acceptance:

- A user can open a local Ripple project, switch to Comments, pause on a frame,
  write a comment, and see a persistent thread with timecode and screenshot or
  still context.
- A user can Shift-select or otherwise mark a timeline range and create a range
  comment with start/end frame context.
- The agent starts from that comment and the thread shows running/progress
  feedback without taking over the normal Chat tab.
- The agent edits only the isolated revision context. The primary project does
  not change while the proposal is running.
- Multiple comments can have separate running or proposed revisions.
- A proposed revision can be previewed, and its changed files can be reviewed
  from the comment thread.
- Accept applies the proposed changes to the primary project, refreshes the
  HyperFrames preview/timeline/assets, and marks the proposal accepted.
- Reject discards the proposal and leaves the primary project unchanged.
- Request changes adds a follow-up comment and creates a new isolated proposal.
- If isolation cannot be prepared, the thread shows a recoverable error and no
  primary project files are edited.
- Primary UX uses comments, proposals, versions, accept, reject, and request
  changes. It does not expose worktree/branch/PR language.

Suggested command sequence near completion:

1. `bun test src/main/lib/revisions`
2. `bun test src/renderer/features/comments`
3. `bun run test:hyperframes`
4. `bun run test:ripple`
5. `bun run build`
6. `git diff --check`
7. `bun run ts:check`

## Idempotence and Recovery

Thread creation should use a client request ID or equivalent duplicate guard so
a double-click or retry does not create two identical revision runs. Adding a
message to a thread should be repeat-safe when the client retries after an IPC
or network-style interruption.

Revision creation must fail closed. If the project is not ready for isolated
revision work, if git/worktree creation fails, if the returned context path is
the primary project path, or if the context cannot be registered, mark the
revision `failed`, add a system message to the thread, and leave the project
untouched.

The app should recover cleanly after restart. `queued` and `preparing`
revisions can be marked `failed` with a retry affordance if no process exists.
`running` revisions should be reconciled with provider process/session state if
available; otherwise mark them failed with a clear message. `proposed`
revisions should remain previewable as long as their context path exists and is
registered.

Accept must be serialized per project and transactional in product terms. If
the primary project changed since the revision base, show a conflict state
instead of applying a partial patch. If accept fails mid-operation, recover by
leaving the revision proposed or failed with enough detail to retry or reject;
do not mark it accepted until the project files and database refresh succeed.

Reject and cleanup should be safe to repeat. Removing an already-removed
revision context should leave the revision rejected or archived. Cleanup should
use the same guarded worktree removal patterns as existing chat archive/delete
flows and must never delete the primary project path.

Comments, proposal cards, and thread status should tolerate missing screenshots
or stale preview artifacts. Missing visual artifacts should degrade to timecode
and composition labels, not block thread rendering.

## Interfaces and Dependencies

Existing dependencies:

- Electron main process, tRPC IPC, Drizzle SQLite, React 19, Jotai, TanStack
  Query, Radix, Tailwind, existing app UI wrappers, and lucide icons.
- Existing chat/sub-chat provider execution and streaming.
- Existing worktree helper in `src/main/lib/git/worktree.ts`.
- Existing path security helpers in `src/main/lib/git/security/*`.
- Existing HyperFrames preview, timeline, project browser, and snapshot
  services.
- Existing Phase 7 shell and right review pane.

Likely new or changed main-process interfaces:

- `src/main/lib/revisions/index.ts`
- `src/main/lib/revisions/comment-service.ts`
- `src/main/lib/revisions/revision-context.ts`
- `src/main/lib/revisions/revision-acceptance.ts`
- `src/main/lib/revisions/revision-prompts.ts`
- `src/main/lib/trpc/routers/revisions.ts`
- schema tables and exported types in `src/main/lib/db/schema/index.ts`
- route registration wherever the root tRPC router is assembled
- revision-aware context resolver in `src/main/lib/hyperframes/project-context.ts`
  or a sibling module
- strict isolation option or wrapper around `createWorktreeForChat`
- provider cwd/context changes in `src/main/lib/trpc/routers/claude.ts` and
  `src/main/lib/trpc/routers/codex.ts`

Likely new or changed renderer interfaces:

- `src/renderer/features/comments/CommentsPane.tsx`
- `src/renderer/features/comments/CommentComposer.tsx`
- `src/renderer/features/comments/CommentThreadList.tsx`
- `src/renderer/features/comments/CommentThreadView.tsx`
- `src/renderer/features/comments/RevisionProposalCard.tsx`
- `src/renderer/features/comments/comment-state.ts`
- `src/renderer/features/comments/comment-formatting.ts`
- `src/renderer/features/ripple-shell/RippleReviewPane.tsx`
- `src/renderer/features/ripple-shell/RippleShell.tsx`
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`
- `src/renderer/features/hyperframes/HyperFramesTimeline.tsx`
- `src/renderer/features/ripple-shell/RippleEmbeddedUtilityPane.tsx` if changes
  and files need proposal-specific labels or context.

Shared types likely needed:

- comment anchor type
- comment thread status
- comment message role
- revision status
- proposal summary
- revision-aware HyperFrames target, such as
  `{ kind: "project"; projectId: string } | { kind: "revision"; revisionId: string }`

## Artifacts and Notes

Implementation should keep the Phase 7 shell direction intact. Comments mode is
the durable home for review threads and proposal cards; Chat mode remains the
general project conversation. Utility modes such as Files, Changes, Plan,
Terminal, and MCP remain secondary right-pane surfaces.

Current high-risk seams to review during implementation:

- worktree fallback to the primary project path
- non-git Ripple projects that are not yet worktree-ready
- provider cwd resolution for revision runs
- path validation for revision previews and file reads
- accepting a proposal after the primary project changed
- cleaning up rejected or failed revision contexts
- stale preview/player/timeline state when switching between primary project
  and proposed revision previews
- hidden generated paths such as snapshots, exports, `.ripple`, and worktree
  metadata appearing in asset/file views

Phase 8 should not implement final export UX. It may use snapshot and preview
services to support comment context and proposal review, but Phase 9 remains the
dedicated export phase.
