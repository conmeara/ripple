# Phase 8: Comments And Agent Revisions

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple users can review a motion graphic the way they would
review a video: pause on a frame, leave a comment, and let an agent produce a
separate generated change for that exact piece of feedback. The change is
previewed next to Main and can be accepted, deleted, or followed up with another
comment for changes.

The product should feel Frame.io-inspired without exposing implementation
terms. Comment UI uses comments, replies, generated changes, previews, accept,
delete, restore, and follow-up language. Chat may expose `Main` and `Worktree`
as the editing-mode choice. The hidden backend may use git worktrees and chat
sub-sessions, but primary comment UX must not ask the user to understand
branches, worktrees, commits, or developer setup.

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
- [x] 2026-04-27 / User + Codex: Settled key interaction choices: hidden
  worktrees remain the isolation model; each revision should be backed by a
  hidden chat/sub-chat; comment cards should show terse one-line agent status
  and results; selecting a proposed comment previews its revision at the
  anchored time; selecting away returns to the primary preview; accepted
  proposals apply back to the primary project; deleted comments are soft-deleted
  and recoverable through comment filters.
- [ ] Implement Milestone 1: comment/revision data model and main-process
  service skeleton.
- [ ] Implement Milestone 2: comment capture UI in the Phase 7 review pane,
  preview player, and timeline.
- [ ] Implement Milestone 3: strict isolated revision context creation and
  provider execution routing.
- [ ] Implement Milestone 4: generated-change preview, diff, accept,
  delete/discard, and cleanup.
- [ ] Implement Milestone 5: follow-up comments, proposal history, and recovery
  hardening.
- [x] 2026-04-27 / Codex: Added the first working Phase 8 implementation
  slice: comment/revision tables and migration, `revisions` tRPC router,
  main-process comment/revision service, hidden revision chats, strict worktree
  failure handling, soft delete/restore, accept/reject/refresh actions,
  revision-aware HyperFrames preview contexts, and a Frame.io-inspired comments
  pane wired into the Ripple shell.
- [x] 2026-04-27 / Codex: Added focused comment helper tests and expanded
  `bun run test:ripple` to include shared comment helpers and the renderer
  comments feature.
- [x] 2026-04-27 / User + Codex: Corrected the Comments pane product model:
  remove public-review affordances such as `Comments` / `Fields`, user avatar,
  author identity, public/private visibility, and reactions. Comments are local
  user-to-agent revision threads and should reuse chat-like bubbles, composer,
  and send controls.
- [x] 2026-04-27 / User + Codex: Added the chat-style agent/model selector to
  the comment composer. New comment revisions persist the selected provider and
  model into the hidden revision chat so opening the proposal in Chat keeps the
  same execution choice.
- [x] 2026-04-27 / Codex: Implemented the strict worktree functionality for
  comment-created revisions. Ripple project creation and import now prepare or
  adopt Git at the project root, comment revisions
  store the base commit and register a true hidden worktree through the existing
  chat worktree plumbing, accept commits applied proposals back into the hidden
  managed baseline, and focused tests plus a Computer Use smoke verify that a
  new comment reaches `Agent ready in revision chat` instead of the failed
  isolation state.
- [x] 2026-04-27 / Codex: Promoted managed Git setup into the project lifecycle
  itself. `createRippleProject` and `openExistingRippleProject` call the
  shared project Git helper, the starter scaffold writes a default `.gitignore`
  for generated outputs, and a Computer Use smoke created `git smoke 427` with
  a clean managed Git root before any comment was made.
- [x] Remaining follow-up: background provider execution from comments should
  be promoted from "hidden chat is prepared and opens into the existing chat
  runner" to a first-class queued background run that updates revision status
  automatically when the provider stream finishes.
- [x] 2026-04-27 / Codex: Added the compact background comment-runner path.
  Queued comment revisions now start their hidden chat from the comments pane,
  show a single chat-style shimmer line such as `Exploring files` while the
  provider stream is active, and finalize into a one-line proposal summary in
  the comment card while keeping `Open in Chat` available for the full
  transcript and deeper follow-up.
- [x] 2026-04-27 / User + Codex: Tightened the compact runner after UI smoke
  feedback. The status line now sits directly on the comment card background
  without its own box, and queued comment revisions use the same stored-message
  `regenerate()` path as the full chat view so the agent begins from Comments
  instead of waiting for `Open in Chat`.
- [x] 2026-04-27 / User + Codex: Corrected the completed comment summary and
  chat handoff. Comment cards now show the final assistant response from the
  hidden revision chat, not an intermediate progress paragraph or diff-only
  fallback, and `Open in Chat` switches the preview surface to that revision
  workspace while opening the full transcript.
- [x] 2026-04-27 / User + Codex: Tightened reply-thread rendering. Each user
  comment or reply now keeps the compact one-line agent status/result directly
  below that user bubble, so a thread reads response, reply, response without a
  separate `Follow-up` label or a latest-status line floating under the whole
  card.
- [x] 2026-04-27 / User + Codex: Refined the final Phase 8 UX language.
  Comments should not expose `proposal`, `revision`, or `worktree` terminology.
  A comment shows compact states such as `Working`, `Changes ready`, `Accepted`,
  and `Needs attention`; clicking a comment previews its generated changes;
  `Accept` applies/merges those changes; `Delete` hides the comment and discards
  any unaccepted generated work. Chat may expose `Main` and `Worktree` because
  that surface is closer to power-user editing. The existing `Agent` / `Plan`
  selector should be replaced or repurposed as an icon-first `Main` / `Worktree`
  selector that defaults to `Main`, while the model selector remains separate.
  Worktree chats should show a simple `Worktree` label without the generated Git
  worktree name, provide a clear `Accept` path back to `Main`, and support chat
  cleanup through archive/delete flows. Any worktree preview state should also
  expose an explicit `View Main` affordance instead of relying on a generic
  circular-arrow icon whose destination is unclear.
- [x] 2026-04-27 / Codex: Began implementing the refined direction. The new-chat
  composer now uses an icon-first `Main` / `Worktree` selector, Worktree chat
  creation fails closed instead of falling back to Main, embedded Worktree chats
  show `Worktree`, `View Main`, `View Worktree`, and `Accept`, comment cards use
  `View changes` / `Accept changes` / `Delete comment` wording, deleting a
  comment discards any unaccepted generated work, and project settings list
  archived chats with restore/delete actions.
- [x] 2026-04-27 / Codex: Fixed review-loop lifecycle hardening. Follow-up
  replies now append to the existing hidden revision chat and create a new
  revision row that reuses the same registered worktree, so earlier generated
  changes persist across the thread. Accept now only applies `proposed` changes,
  background completion/failure updates are guarded against stale terminal
  states, and hidden agent prompts include frame/range/element context from the
  comment anchor.
- [x] 2026-04-28 / User + Codex: Replaced the stale-accept blocker UX with an
  automatic generated-change update loop. After accepting one comment, other
  ready comments based on the older Main commit move into an internal
  `updating` state. Their accept control becomes a disabled spinner with a
  tooltip, not a new card status line. Ripple first tries to refresh the
  generated change onto the latest Main with Git; if that cannot apply cleanly,
  it queues the existing hidden agent thread to recreate the change from the
  latest project state.
- [x] 2026-04-28 / Codex: Hardened the Phase 8 architecture around long-term
  ownership boundaries. Revision queue claiming and stale-generated-change
  processing now live in the main process, the Comments pane is only a review
  surface, and a shell-level worker runs queued hidden chats without tying
  execution to comment-card rendering. Comment acceptance and Worktree chat
  acceptance now share the same isolated-workspace acceptance service, and
  multi-row comment/revision state updates are grouped through database
  transactions.
- [x] 2026-04-28 / Codex: Added the next durability rails for Phase 8. Accepts
  are serialized per project inside the shared isolated-workspace acceptance
  service; comment and reply creation now carry client request ids with unique
  database indexes to prevent duplicate submits; app launch recovers stuck
  `preparing` / `running` generated changes back into the queue when their
  hidden chat/workspace is available; rejected and superseded orphaned
  worktrees are reconciled on launch; and the revisions router exposes internal
  queue diagnostics plus explicit recovery/cleanup procedures for debugging.
- [x] 2026-04-28 / User + Codex: Paused Phase 8 at the provider integration
  boundary. The comment/generated-change domain, queue, stale-update handling,
  recovery, and acceptance services are in place, but the actual provider
  stream still runs through the shell-level `RippleRevisionQueueWorker` and
  renderer chat transports. Phase 11 will replace that execution bridge with
  Codex App Server and Claude Agent SDK provider runs before Phase 8 polish
  resumes.
- [x] 2026-04-28 / User + Oracle + Codex: Clarified the Phase 8 handoff:
  Phase 11 should preserve Phase 8's product semantics and safety guarantees,
  but may replace hidden chat/sub-chat execution internals, transcript storage,
  and `RevisionQueueRun` shape with provider-native agent threads, agent runs,
  events, approvals, workspace contexts, and transcript projection.
- [ ] After Phase 11: resume Phase 8 polish on comment-card details,
  generated-change summaries, stale update/resolution UX, Chat handoff,
  restore/delete edge cases, and visual QA using the new main-process provider
  runner.

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

- Observation: HyperFrames Studio already has a useful Shift-drag range edit
  pattern, but it is not a persisted comment or agent execution contract.
  Evidence: `node_modules/@hyperframes/studio/src/player/components/Timeline.tsx`
  tracks `shiftHeld`, `isRangeSelecting`, `rangeAnchorTime`, and
  `rangeSelection`, shows `EditPopover` for ranges over about 0.2 seconds, and
  converts Shift-click on a clip into that clip's full range.
  `node_modules/@hyperframes/studio/src/player/components/EditModal.tsx` shows
  a small prompt popover with `Copy Prompt` and `Copy to Agent`.
  `node_modules/@hyperframes/studio/src/player/components/timelineEditing.ts`
  builds a text prompt from range start/end, elements in range, and the user's
  prompt, but the action writes to the clipboard instead of creating a comment,
  agent run, or revision.

- Observation: New local Ripple projects can create real revision worktrees
  once the app prepares a hidden local Git baseline first.
  Evidence: `src/main/lib/ripple-projects/project-git.ts` initializes and
  configures a managed repo only when needed, `bun run test:ripple` covers the
  managed/non-managed behavior, and a Computer Use dev-app smoke created a new
  comment whose latest revision was `queued` with `context_path` under
  `~/.ripple/worktrees/...` while the primary project stayed clean.

- Observation: The full chat view was auto-starting hidden revision chats by
  regenerating the stored initial user message, while the compact comment
  runner was trying to drive the raw chat object separately.
  Evidence: `active-chat.tsx` calls `regenerate()` when a sub-chat has one
  stored user message and no stream, so opening the hidden chat began the run.
  `RippleCommentsPane.tsx` now seeds the same stored messages into the hidden
  runtime chat and calls `regenerate()` from the compact runner.

- Observation: The comment card was reading the first assistant prose because
  the persisted response can include multiple assistant text blocks before the
  final answer.
  Evidence: The `git smoke 427` smoke thread rendered `I'm going to locate...`
  in Comments while the full Chat showed a final `RESPONSE` line. The summary
  extraction now scans assistant parts from the end and a dev-app smoke showed
  the comment card as `At 00:00:00:00, the main title now reads "hi"...`.

- Observation: Opening the hidden revision chat did not automatically move the
  preview to the revision worktree.
  Evidence: Before the fix, `Open in Chat` only selected the hidden chat and
  changed the right-pane mode. After passing the revision id and time through
  the handoff, a dev-app smoke opened the chat and the preview iframe displayed
  the worktree change with heading `hi`.

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

- Decision: Follow-up comments continue the same hidden revision chat and
  registered worktree while creating a new reviewable revision row.
  Rationale: A reply such as "make that larger" depends on the prior generated
  changes already present in the worktree and transcript. Keeping one context
  preserves iteration continuity, while a new revision row preserves clear
  status, preview, accept/delete, and audit boundaries.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Revisions must use a strict isolation path that fails closed.
  Rationale: Existing chat creation intentionally falls back to project-local
  editing for normal chat convenience. Comment revisions are different: falling
  back to the primary project would violate the product promise.
  Date/Author: 2026-04-27 / Codex

- Decision: Primary comment UI avoids proposal, revision, and worktree language.
  Comments use plain states and actions: working, changes ready, accepted, needs
  attention, preview, accept, delete, and restore. Chat may expose `Main` and
  `Worktree`, but branch, commit, PR, and cherry-pick still belong only in
  advanced/debug or internal surfaces.
  Rationale: Comments should feel like frame-anchored review notes with generated
  changes behind them, not a formal proposal workflow. Chat is closer to
  power-user editing, so `Worktree` is acceptable there when paired with `Main`.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Use one hidden chat-backed worktree per generated change attempt.
  Rationale: Existing chats own the worktree path and provider transcript. A
  comment thread can hold many generated change attempts over time, so each one
  needs its own hidden chat/sub-chat while the visible thread stays concise.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Comments mode should show terse agent feedback, not the full agent
  transcript.
  Rationale: Frame/time comments are usually small change requests. The normal
  card should show one shimmering status line while work is running and one
  short result line when done, with `Open in Chat` available for longer
  debugging or continuation.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Keep the Comments pane local and chat-like rather than public
  review-site-like.
  Rationale: Ripple comments are between the local user and the agent, not
  public or private team comments. The pane should not show `Fields`, author
  avatars, public/private visibility, reactions, or social identity controls.
  The durable UI pattern is the existing agent chat surface: compact thread
  cards, rounded message bubbles, chat-style composer, and the shared send
  button.
  Date/Author: 2026-04-27 / User + Codex

- Decision: The comment composer should expose the same model selector as chat.
  Rationale: A frame comment immediately creates a hidden revision chat, so the
  model choice belongs at the moment the user submits the comment. The selected
  provider/model should be stored on the hidden revision chat metadata and
  per-subchat model preferences, not treated as a temporary UI-only selection.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Replace the visible chat `Agent` / `Plan` mode choice with a quiet
  `Main` / `Worktree` editing-mode selector.
  Rationale: Ripple will use agent execution for both chat and comments, so the
  old plan-agent distinction is not the primary user choice. The default chat
  mode is `Main`, which edits the current project directly. `Worktree` creates a
  temporary editing context that can be accepted into `Main` or deleted. The
  control should be icon-first to avoid crowding the model selector, with full
  labels and one-line descriptions inside the menu.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Preview switching needs explicit `View Main` and `View Worktree`
  affordances.
  Rationale: When a user is inspecting a comment-generated change or chat
  worktree, the UI should make it obvious whether the center preview is showing
  `Main` or temporary work. A generic restore/circular-arrow button is too
  ambiguous for this job. Worktree surfaces should carry a simple `Worktree`
  label plus a direct `View Main` action; Main surfaces can offer `View
  Worktree` when a temporary edit context is selected.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Chat cleanup should center on archive first, with permanent delete
  and worktree cleanup in explicit management surfaces.
  Rationale: Chat history needs a lightweight cleanup gesture. The chat history
  menu should show a hover archive button, mirroring project cleanup. Archived
  chats should be manageable under project settings, alongside active/archived
  project management, with restore and permanent delete actions. Deleting a
  worktree chat cleans up its temporary worktree; archiving only hides it.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Initialize app-managed Git only for projects that need Ripple's
  hidden revision baseline, and do not silently commit dirty unmanaged
  repositories.
  Rationale: App-created local projects need Git history so the legacy worktree
  helper can create true isolated contexts, but existing user-managed Git repos
  should not get surprise commits. Managed repos are marked with
  `ripple.revisionManaged=true`, refreshed before revision creation, and
  committed after accepted proposals so future revisions start from the current
  primary project.
  Date/Author: 2026-04-27 / Codex

- Decision: Selecting a comment with generated changes previews those changes at
  the anchored time.
  Rationale: Users need a fast before/after loop. Clicking a comment with
  generated changes should switch the center preview to the hidden revision
  context and seek to the comment frame; clicking away, using `View Main`, or
  toggling the same comment returns to the primary project preview.
  Date/Author: 2026-04-27 / User + Codex

- Decision: A stale comment's accept control should become a spinner while
  Ripple updates it against the latest project.
  Rationale: If one comment is accepted, other independently generated comments
  may be based on the previous Main version. The user should not choose pull,
  rebase, merge, or conflict-resolution actions. A checkmark means the generated
  change is safe to accept; a spinner means Ripple is making it safe. The card
  should stay visually calm, with short hover/focus tooltip text: `Updating`
  for the automatic Git refresh and `Resolving` for the hidden agent thread.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Main owns revision queue state; the renderer only hosts the
  provider stream until chat execution is extracted into callable main-process
  services.
  Rationale: Queued, stale, running, complete, and failed generated changes are
  product lifecycle state, not a side effect of whether a comment card is
  mounted. Keeping claim/update decisions in main prevents duplicate runners,
  lets stale work be processed before the next run is claimed, and gives the
  app a single recovery point after restart. The renderer worker remains a
  transitional bridge because the current Claude/Codex streaming transports are
  still renderer-driven.
  Date/Author: 2026-04-28 / Codex

- Decision: Accepting generated changes uses one shared isolated-workspace
  service.
  Rationale: Comment-generated changes and Worktree chat changes both represent
  isolated edits that must be accepted into Main only when Main is clean and the
  workspace is separate from the primary project. A shared service keeps patch,
  merge, untracked-file, rollback, and managed-baseline commit behavior in one
  place instead of duplicating safety logic across routers and comment code.
  Date/Author: 2026-04-28 / Codex

- Decision: Comment/revision lifecycle updates that touch multiple tables should
  be transaction grouped.
  Rationale: Thread messages, latest revision pointers, hidden chat transcript
  updates, revision statuses, and stale-marking state must move together. A
  partially updated review thread is worse than a failed operation because it
  can leave the UI pointing at the wrong generated change.
  Date/Author: 2026-04-28 / Codex

- Decision: Accepting generated changes is serialized per project.
  Rationale: Accept mutates Main. Running two accepts for the same project at
  the same time can create stale-base confusion or partial filesystem state.
  The shared acceptance service now queues accepts by normalized project path so
  the second accept observes the result of the first before doing its own clean
  Main and base checks.
  Date/Author: 2026-04-28 / Codex

- Decision: Comment submit retries use client request ids.
  Rationale: Users can double-click, renderer mutations can retry, and IPC can
  fail after the main process already created the row. A client request id lets
  main return the existing comment or reply instead of creating a duplicate
  thread, duplicate message, and duplicate hidden agent run.
  Date/Author: 2026-04-28 / Codex

- Decision: Startup recovery should requeue recoverable hidden revision runs
  and fail only incomplete preparation records.
  Rationale: A generated change should not remain stuck forever in `Working`
  after a quit, crash, or sleep/wake interruption. If the hidden chat and
  isolated workspace exist, Ripple can safely put the run back into the queue.
  If preparation never reached a usable hidden chat/workspace, the thread gets a
  clear recoverable failure.
  Date/Author: 2026-04-28 / Codex

- Decision: Automatic worktree cleanup skips failed revisions.
  Rationale: Failed generated changes may still contain useful work and should
  remain recoverable through `Open in Chat`. Automatic cleanup is limited to
  rejected and superseded orphaned contexts with no active sibling using the
  same workspace.
  Date/Author: 2026-04-28 / Codex

- Decision: Pause Phase 8 final polish until Phase 11 replaces provider
  execution with main-process Codex App Server and Claude Agent SDK runs.
  Rationale: Phase 8 found and hardened the right domain boundary: Comments is
  a review surface, main owns queue/recovery/acceptance decisions, and hidden
  chats/workspaces hold generated work. The remaining weakness is the
  transitional shell-level worker that executes provider streams through
  renderer chat transports. Polishing around that worker would make temporary
  architecture harder to remove.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Preserve Phase 8 product semantics but not necessarily Phase 8
  execution internals.
  Rationale: The durable Phase 8 work is frame comments, generated changes,
  strict isolation, explicit accept/delete, stale-update safety, recovery, and
  calm Comments UX. Hidden chats, sub-chats, `sub_chats.messages`,
  `RevisionQueueRun`, and provider inference from model metadata are inherited
  implementation scaffolding. Phase 11 may replace them with agent
  threads/runs/events/approvals/workspaces as long as the user-visible review
  semantics and safety guarantees survive.
  Date/Author: 2026-04-28 / User + Oracle + Codex

- Decision: Deleting comments is a recoverable soft-delete.
  Rationale: Review tools let users clean up the visible list without losing
  context. Deleted threads should disappear from `All comments` but remain
  available through a `Deleted` or similar filter, with restore clearing the
  deleted marker. If a deleted comment has unaccepted generated changes, delete
  should discard or clean up that hidden work after a clear confirmation. If the
  changes were already accepted, deleting the comment must not undo the project
  change.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Borrow HyperFrames Studio's Shift-drag and Shift-click range
  selection behavior, but keep the implementation Ripple-owned.
  Rationale: Studio's interaction is exactly the right timeline gesture for
  comment-driven agent edits, but its `EditPopover` and prompt builders are
  private package internals and only copy prompt text to the clipboard. Ripple
  needs durable comment threads, revision rows, hidden worktrees, and
  main-process agent execution.
  Date/Author: 2026-04-27 / User + Codex

## Outcomes & Retrospective

First implementation slice landed. A user can create frame/range comments from
the current preview context, get a hidden chat-backed revision proposal
workspace, open that proposal in Chat, refresh the proposal diff summary,
preview the revision context in the center player, accept or reject the
proposal, and soft-delete/restore comment threads.

The strict worktree pass fixed the failed-isolation path shown when comments
were created on non-git Ripple projects. The current implementation now
prepares an app-managed baseline, creates a true hidden worktree, registers it
on the hidden chat, and fails closed if the legacy helper ever returns the
primary project path.

The automatic background provider pass now starts queued comment revisions from
the comments pane by reusing the existing chat transports against the hidden
revision chat/sub-chat. Comments mode intentionally renders only one compact
status/result line; full provider events, tool calls, changed files, and
continuation remain available through `Open in Chat`.

The architecture hardening pass moved orchestration out of the visible Comments
pane. Main now claims the next queued generated change and processes stale
updates first; the shell mounts one invisible worker for the selected project to
execute the claimed hidden chat. Acceptance is centralized through a guarded
isolated-workspace service that supports both patch-based comment accepts and
merge-based Worktree chat accepts. This keeps the product model healthier:
Comments reviews state, main owns lifecycle decisions, and acceptance safety is
not duplicated.

The durability pass added guardrails around the parts users should never have
to think about: duplicate sends, overlapping accepts, app restarts, and leftover
temporary work. These are mostly invisible by design. The user-facing effect is
that comments do not double-post, accepts happen in a safe order, interrupted
generated changes can resume through the queue, and rejected/superseded
temporary work is cleaned without deleting failed work the user may still want
to recover.

Phase 8 is intentionally paused here. The implementation has reached the
provider boundary that Phase 11 now owns: `src/main/lib/revisions/revision-queue.ts`
decides what generated change should run next, while
`src/renderer/features/comments/RippleRevisionQueueWorker.tsx` still performs
the actual hidden-chat provider stream from the renderer. Phase 11 will replace
that bridge with main-process Codex App Server and Claude Agent SDK provider
runs. Phase 11 may also replace hidden chat/sub-chat execution internals with a
canonical agent thread/run/event model. After Phase 11 lands, Phase 8 should
resume with product polish and regression testing rather than another
provider-transport refactor.

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
- Delete removes a thread from the normal comment list without destroying its
  history. Restore brings the thread back from the deleted filter.

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
  `createdAt`, `updatedAt`, `resolvedAt`, `deletedAt`
- `comment_messages`: `id`, `threadId`, `revisionId`, `role`, `body`,
  `metadataJson`, `createdAt`
- `revisions`: `id`, `threadId`, `projectId`, `compositionId`, `chatId`,
  `subChatId`, `baseRevisionId`, `baseProjectCommit`, `baseProjectHash`,
  `contextPath`, `branch`, `prompt`, `status`, `previewProjectId` or
  `previewContextKey`, `diffSummary`, `errorMessage`, `createdAt`,
  `updatedAt`, `resolvedAt`

Status values should be narrow and explicit. A practical starting set is:

- thread status: `open`, `resolved`, `archived`, with `deletedAt` as a
  recoverable visibility marker rather than a destructive delete
- message role: `user`, `assistant`, `system`
- revision status: `queued`, `preparing`, `running`, `proposed`, `accepted`,
  `rejected`, `superseded`, `failed`

Milestone 2 turns the Comments pane into a real review UI. Replace the
placeholder `CommentsPane` with a feature boundary under
`src/renderer/features/comments/`. Borrow Frame.io's frame-anchored review
rhythm, but not its public review-site chrome. Do not add a segmented
`Comments` / `Fields` control, public/private visibility, avatars, author
identity blocks, or reaction buttons. The pane should reuse the existing chat
surface as much as possible: compact filter row, rounded chat-like thread
cards, timecode pill, comment number, selected-card border, inline reply
composer, threaded follow-ups, proposal status cards, the shared chat send
button, and the chat-style agent/model selector. Deleted threads should be
hidden from `All comments` and recoverable through a `Deleted` filter. The
composer should default to the active playhead timecode and active composition.
If the user has a timeline range selected, include that range. If the user
selected a clip or element, include selector and source file when available.

The timeline comment gesture should borrow from HyperFrames Studio:
Shift-drag on the timeline creates a visible range selection and opens the
comment composer for that range; Shift-click on a clip anchors the comment to
the full clip range. Studio uses a small local `EditPopover` and a `Copy to
Agent` button, but Ripple should route the prompt through
`revisions.createFromComment` or the equivalent tRPC mutation instead of
copying text to the clipboard. Ripple should also keep the selection as a
durable comment anchor and store the elements/clips overlapping the range as
structured context.

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
Project creation and project import now initialize or adopt Git at the Ripple
project root. For projects that are not already their own Git repositories,
Ripple creates an app-managed repository, records a local baseline, and hides
the machinery from normal UX. Revision creation can still refresh that managed
baseline before creating an isolated worktree, but comments should not be the
first normal path that discovers whether the project can support worktrees.

The hidden agent prompt should combine:

- the user's comment text
- project and composition identity
- frame/time/range values and timecode
- element selector, clip key, and source file if present
- screenshot path or embedded image part when available
- HyperFrames authoring rules from `AGENTS.md` / `ROADMAP.md`
- explicit instruction to edit only within the revision context and preserve
  HyperFrames data attributes, GSAP timeline registration, and project assets

The visible agent response in Comments mode should be intentionally small. Use
the existing chat-style single-line generating/shimmer pattern while the agent
is running, such as "Adjusting lower-third timing...". When the proposal is
ready, show one short line such as "Updated the title fade and spacing." The
full provider transcript, tool output, file changes, and longer explanation
belong behind `Open in Chat` or proposal details, not in the default comment
card.

Milestone 4 implements proposal review. When an agent run completes, compute a
diff summary for the revision context and show a proposal card in the thread.
The card should offer:

- preview proposal
- changed files
- accept
- reject
- request changes
- open in chat

Preview should reuse the Phase 4 player path, but it must be able to resolve a
revision context instead of only a primary project ID. Add a main-process
resolver that accepts a `revisionId` and validates the revision context before
building player source, timeline model, snapshot, or project browser data. Do
not let the renderer send an arbitrary absolute path.

Selecting a comment that has a proposed revision should set a revision preview
target for the center player and seek to the thread's anchored time/frame. The
selected card should stay highlighted while the center stage shows the proposed
revision. Clicking the selected comment again, choosing the primary preview
affordance, or selecting outside the proposal should return the center player to
the primary project preview at the same time when possible.

Accept should apply the proposal to the primary project as an atomic product
action. It still requires a clean primary project and must not partially apply
changes. After a successful accept, refresh compositions, assets, preview
source, timeline model, and project browser state, mark the revision accepted,
mark prior proposals in the thread superseded where appropriate, and resolve the
thread if the user chooses to resolve it. Other ready comment changes created
from an older Main commit should move into an internal `updating` state. The
renderer should show only a disabled spinner accept control with a hover/focus
tooltip. The background updater should try a Git-level refresh onto the latest
Main first; if that fails, keep the hidden revision context and generated work
intact, then queue the existing hidden agent thread with the terse instruction
`Pull and Resolve from Main`.

Reject should mark the revision rejected and remove or archive its isolated
context through a guarded cleanup path. Cleanup failure should not change the
primary project; it should leave a recoverable maintenance warning. Deleting a
comment thread is separate from rejecting a proposal: delete soft-hides the
thread and leaves audit/recovery data intact; reject is the explicit product
decision that discards a proposal.

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

7. Add soft-delete and restore routes for comment threads. Deleting should set
   `deletedAt`, hide the thread from normal filters, preserve messages and
   proposal records, and make the thread visible through a deleted filter.
   Restoring should clear `deletedAt` without creating a new thread.

8. Extend or wrap the HyperFrames project context resolver so preview, timeline,
   snapshot, and project browser operations can target either a primary
   `projectId` or a validated `revisionId`.

9. Build `src/renderer/features/comments/` with query hooks, pure state helpers,
   comment composer, thread list, selected thread view, proposal card, status
   chip, delete/restore affordances, and accept/reject/request-changes actions.

10. Wire the comments feature into
   `src/renderer/features/ripple-shell/RippleReviewPane.tsx` and
   `src/renderer/features/ripple-shell/RippleShell.tsx`. Keep regular chat in
   the same review pane and keep non-Ripple workspaces on their current path.

11. Wire playhead/range context from
    `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` and
    `src/renderer/features/hyperframes/HyperFramesTimeline.tsx` into the comment
    composer. Start with current frame/time and selected timeline range.

12. Add HyperFrames-Studio-inspired range composition. Shift-drag should create
    a timeline range, show a compact comment composer/popover, and include
    elements or clips overlapping the selected range. Shift-clicking a clip
    should create a full-clip range anchor. Use Ripple-owned helpers modeled on
    Studio's `buildTimelineAgentPrompt`, not private imports from
    `@hyperframes/studio/src/player/components/timelineEditing.ts`.

13. Add revision-aware agent execution. Either add a strict option to
    `chats.create` and provider routers or create a revision-specific execution
    route that reuses their internals. Verify the provider current working
    directory is the revision context.

14. Add terse comment-card agent status. Reuse the existing generating/shimmer
    visual language, but show only one short status line while running and one
    short result line after the proposal is ready. Add `Open in Chat` for the
    full transcript and long-running back-and-forth.

15. Add proposal preview and diff surfaces. Reuse existing Changes/Files
    utilities where practical, but label them as proposal review in Comments
    mode. Add selected-comment preview targeting so clicking a proposed comment
    shows that revision context in the center player at the anchored time, and
    clicking out returns to the primary project preview.

16. Add accept/reject/request-changes flows with project-level serialization,
    conflict checks, refresh/invalidation, and safe cleanup.

17. Add focused tests for schema/state/service behavior as the code lands. Keep
    this plan updated with progress, discoveries, validation evidence, and
    scope changes.

## Validation and Acceptance

Automated validation:

- New schema tests or migration checks cover comment threads, messages,
  revisions, soft-delete/restore behavior, cascade behavior, indexes, and
  status defaults.
- Main-process revision service tests cover anchor normalization, prompt
  context creation, strict isolation failure, successful revision context
  creation, non-git or worktree-failure behavior, diff summary creation, accept,
  reject, soft-delete, restore, cleanup, and repeated recovery calls.
- Provider routing tests prove Claude and Codex runs for comment revisions use
  the revision context path.
- HyperFrames resolver tests prove preview/timeline/snapshot/project-browser
  calls can target a revision only by `revisionId`, never by arbitrary renderer
  path.
- Renderer tests cover Comments mode, empty state, comment composer timecode,
  timeline range attachment, Shift-drag range comment creation, Shift-click
  full-clip comment creation, thread selection, proposal card states, terse
  running/done agent lines, selected proposal preview targeting, delete/restore
  filters, accept/reject/request-changes actions, and disabled/error states.
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
- A user can Shift-click a clip and create a comment anchored to that full clip
  range.
- The agent starts from that comment and the thread shows running/progress
  feedback without taking over the normal Chat tab.
- The agent edits only the isolated revision context. The primary project does
  not change while the proposal is running.
- Multiple comments can have separate running or proposed revisions.
- A proposed revision can be previewed, and its changed files can be reviewed
  from the comment thread.
- Clicking a proposed comment switches the center preview to that revision at
  the comment's anchored time; clicking out or toggling it again returns to the
  primary project preview.
- Accept applies the proposed changes to the primary project, refreshes the
  HyperFrames preview/timeline/assets, and marks the proposal accepted.
- Delete discards unaccepted generated changes and leaves the primary project
  unchanged.
- Request changes adds a follow-up comment and creates a new isolated proposal.
- Deleting a comment removes it from the normal list, and a deleted-comments
  filter can restore it without losing messages or proposal history.
- If isolation cannot be prepared, the thread shows a recoverable error and no
  primary project files are edited.
- Primary comment UX uses comments, generated changes, preview, accept, delete,
  restore, and follow-up language. It does not expose worktree/branch/PR
  language.

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

Deleting and restoring comments must be repeat-safe. Deleting an already
deleted thread should leave `deletedAt` set and preserve messages, screenshots,
and accepted change history. If a deleted thread has unaccepted generated
changes, delete should discard that temporary work without applying it to Main.
Restoring an already-visible thread should be a no-op.

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

Selected proposal preview state should be reversible. If the revision preview
fails to load, the center player should return to the primary project and keep
the selected comment visible with an error state. Clearing selection, switching
filters, deleting the selected thread, or restoring the primary preview should
not mutate the primary project.

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
- `src/renderer/features/comments/comment-filters.ts`
- `src/renderer/features/comments/timeline-comment-prompt.ts`
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
- comment visibility filter, including active/resolved/deleted views
- timeline comment prompt context, based on range start/end plus overlapping
  clip/element summaries
- revision-aware HyperFrames target, such as
  `{ kind: "project"; projectId: string } | { kind: "revision"; revisionId: string }`

## Artifacts and Notes

Implementation should keep the Phase 7 shell direction intact. Comments mode is
the durable home for review threads and proposal cards; Chat mode remains the
general project conversation. Utility modes such as Files, Changes, Plan,
Terminal, and MCP remain secondary right-pane surfaces.

Implementation evidence from 2026-04-27:

- New schema and migration: `src/main/lib/db/schema/index.ts` and
  `drizzle/0010_married_jasper_sitwell.sql` add `comment_threads`,
  `comment_messages`, `revisions`, and hidden chats via `chats.is_hidden`.
- New main-process surface:
  `src/main/lib/revisions/comment-revisions.ts` plus
  `src/main/lib/trpc/routers/revisions.ts`.
- New renderer surface:
  `src/renderer/features/comments/RippleCommentsPane.tsx` and helpers under
  `src/renderer/features/comments/`, wired through
  `src/renderer/features/ripple-shell/RippleReviewPane.tsx` and
  `src/renderer/features/ripple-shell/RippleShell.tsx`.
- Revision preview uses validated revision IDs, not renderer-supplied paths.
  `src/main/lib/hyperframes/project-context.ts`,
  `src/main/lib/hyperframes/player-source-protocol.ts`, and
  `src/main/lib/trpc/routers/hyperframes.ts` resolve `revisionId` into a
  registered revision context before serving player/timeline content.
- Validation: `bun test src/shared/ripple-comments.test.ts
  src/renderer/features/comments` passed, `bun test
  src/renderer/features/hyperframes src/renderer/features/ripple-shell` passed,
  `bun run test:ripple` passed, `bun run build` passed, and `git diff --check`
  passed. `bun run ts:check` still fails on existing baseline errors in older
  auth/agent/remote surfaces; a filtered scan found no `ts:check` errors in the
  changed Phase 8 paths.
- Worktree hardening evidence from 2026-04-27: new
  `src/main/lib/ripple-projects/project-git.ts` and
  `src/main/lib/ripple-projects/project-git.test.ts` cover managed baseline
  initialization, managed baseline refresh, dirty unmanaged repo behavior, and
  accepted-proposal commits. `bun run test:ripple`, `bun run build`, and
  `git diff --check` passed. `bun run ts:check` still fails in the existing
  baseline outside the new revision workspace files. A Computer Use smoke in
  the dev app created a new comment and showed `Agent ready in revision chat`;
  the dev database recorded a queued revision whose `context_path` and hidden
  chat `worktree_path` both pointed under `~/.ripple/worktrees/...`, separate
  from the primary `/Users/comeara/Ripple/test1` project path.
- Automatic stale-change update evidence from 2026-04-28:
  `src/main/lib/revisions/revision-acceptance.ts` can test-apply a generated
  change onto the latest Main commit and then reset the hidden revision
  worktree to that latest base. If the Git-level refresh cannot apply cleanly,
  `src/main/lib/revisions/comment-revisions.ts` keeps the existing generated
  work intact and queues the existing hidden agent thread with `Pull and Resolve
  from Main`. `RippleCommentsPane.tsx` renders that state as a disabled spinner
  accept control with short hover/focus tooltips (`Updating` or `Resolving`) and
  no extra card status line. Validation passed: `bun test
  src/main/lib/revisions/comment-revisions.test.ts`, `bun test
  src/renderer/features/comments src/shared/ripple-comments.test.ts`,
  `bun run test:ripple`, `bun run build`, and `git diff --check`.
- Architecture hardening evidence from 2026-04-28:
  `src/main/lib/revisions/revision-queue.ts` owns queued revision claims and
  stale-update processing; `src/renderer/features/comments/RippleRevisionQueueWorker.tsx`
  executes one claimed hidden chat at a time from the shell; and
  `src/renderer/features/comments/RippleCommentsPane.tsx` no longer owns
  background run orchestration. `src/main/lib/revisions/isolated-workspace-acceptance.ts`
  centralizes guarded accept behavior for comment revisions and Worktree chats,
  and `src/main/lib/trpc/routers/chats.ts` now uses it for `acceptWorktree`.
  Comment thread/message/revision/chat updates in
  `src/main/lib/revisions/comment-revisions.ts` were grouped into
  transactions where a single product action spans multiple rows. Validation
  passed: `bun test src/main/lib/revisions src/renderer/features/comments
  src/renderer/features/ripple-shell`, `bun run test:ripple`,
  `bun run build`, and `git diff --check`. `bun run ts:check` still fails on
  the known broader app baseline in older Electron/auth/agent/remote surfaces;
  the current run did not report errors in the new Phase 8 queue, acceptance,
  comments, or shell files.
- Durability rail evidence from 2026-04-28:
  `src/main/lib/revisions/isolated-workspace-acceptance.ts` now serializes
  accepts per project path. `src/main/lib/revisions/comment-revisions.ts`,
  `src/main/lib/db/schema/index.ts`, and
  `drizzle/0011_violet_purifiers.sql` add duplicate-submit protection with
  `client_request_id` columns and unique indexes for comment threads and
  messages. `src/main/lib/revisions/revision-queue.ts` now exposes startup
  recovery, terminal worktree cleanup, and diagnostics; `src/main/index.ts`
  invokes recovery and cleanup after database initialization. Failed revisions
  are intentionally preserved for `Open in Chat` recovery. Validation passed:
  `bun test src/main/lib/revisions src/renderer/features/comments
  src/renderer/features/ripple-shell`, `bun run test:ripple`, `bun run build`,
  and `git diff --check`. Additional validation passed:
  `bun test src/main/lib/revisions src/renderer/features/comments
  src/renderer/features/ripple-shell src/shared/ripple-comments.test.ts`.
  `bun run ts:check` still fails on the known broader app baseline, but after
  fixing the accept-lock helper it no longer reports errors in the new Phase 8
  durability files. Broader validation also passed: `bun run test:ripple`,
  `bun run build`, and `git diff --check`.
- Phase 11 pause/handoff note from 2026-04-28:
  Phase 8 should not continue by polishing or expanding the shell-level
  `RippleRevisionQueueWorker` as permanent architecture. The durable handoff to
  Phase 11 is the product semantics and safety boundaries: queued/runnable
  generated-change decisions, guarded acceptance in
  `src/main/lib/revisions/isolated-workspace-acceptance.ts`, fail-closed
  isolation, stale-update behavior, and the comment/generated-change UI state
  in `src/renderer/features/comments/RippleCommentsPane.tsx`.
  `RevisionQueueRun` from `src/main/lib/revisions/revision-queue.ts` is the
  current bridge shape, not a long-term constraint. Phase 11 should consume or
  replace that bridge and move provider execution into main. Phase 8 should
  then resume polish on the new agent-run foundation.

Current high-risk seams to review during implementation:

- importing private HyperFrames Studio internals instead of copying the stable
  behavior into Ripple-owned helpers
- worktree fallback to the primary project path
- non-git Ripple projects that are not yet worktree-ready
- provider cwd resolution for revision runs
- path validation for revision previews and file reads
- accepting a proposal after the primary project changed
- cleaning up rejected or failed revision contexts
- stale preview/player/timeline state when switching between primary project
  and proposed revision previews
- selected deleted comments leaving the preview pointed at a hidden revision
- hidden generated paths such as snapshots, exports, `.ripple`, and worktree
  metadata appearing in asset/file views

Phase 8 should not implement final export UX. It may use snapshot and preview
services to support comment context and proposal review, but Phase 9 remains the
dedicated export phase.
