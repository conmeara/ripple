# Phase 10: Conversations And Proposals

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

Ripple users should experience comments and chat as one coherent creative
conversation model. A user can leave a frame-anchored comment, see only the
agent's useful response in the compact comment card, reply to keep refining the
same generated proposal, accept it into Main, delete it with its temporary
workspace, or open the same work in Chat for a deeper back-and-forth.

The inherited 1Code `chat` plus `sub_chat` split does not match that product.
For Ripple, a `Project` is already the workspace container, a `Conversation` is
the transcript, a `Revision` is the generated proposal, and a `Workspace` is the
main project folder or isolated proposal worktree. The long-term architecture
must remove user-visible and eventually schema-level dependence on `sub_chats`.

## Progress

- [x] 2026-04-30 / Codex: Read `PLANS.md`, `ROADMAP.md`, current Drizzle
  schema, `comment-revisions`, revision queue, and agent runtime boundaries.
- [x] 2026-04-30 / Codex: Recorded the product decision that comments are
  compact conversations with proposal worktrees, not sub-chats.
- [x] 2026-04-30 / Codex: Added the canonical conversation schema,
  conversation message table, compatibility columns, and Drizzle migration
  `0013_clammy_cable`.
- [x] 2026-04-30 / Codex: Started writing agent runtime transcripts to
  conversations while preserving
  existing sub-chat projections until the renderer migrates.
- [x] 2026-04-30 / Codex: Created comment revision conversations alongside
  current hidden chats so current UI keeps working while new code can target
  conversations.
- [x] 2026-04-30 / Codex: Added project/comment conversation service APIs and
  a tRPC router as data-model groundwork, but kept the visible Ripple chat
  renderer on the existing `ChatView` and `NewChatForm` components.
- [x] 2026-04-30 / Codex: Audited and backed out the premature
  conversation-pane renderer cutover after it regressed the chat message UI.
  Comment `Open in Chat` now reveals the existing legacy chat again while the
  canonical conversation records remain attached in the data model.
- [x] 2026-04-30 / Codex: Removed the unused Ripple sub-chat history helper,
  then wired the existing embedded toolbar to list project chats so New Chat
  can open previous chats without replacing message rendering.
- [x] 2026-04-30 / Codex: Synced comment delete/restore/resolve/accept actions
  to the attached conversation status so comment lifecycle matches chat
  history.
- [x] 2026-04-30 / Codex: Restored the Ripple right-pane chat to the existing
  embedded toolbar and prompt-input visual system after the first
  conversation-pane pass regressed the UI shape.
- [x] 2026-04-30 / Codex: Restored chat message rendering to the existing
  `ChatView` path and fixed a stale attachment-only message condition in
  `IsolatedMessageGroup`.
- [x] 2026-04-30 / Codex: Migrated the existing visible chat UI to
  conversation-backed state while preserving the `ChatView` / `NewChatForm`
  renderer path, message bubbles, attachments, tool calls, streaming, history,
  model controls, and comment `Open in Chat` behavior.
- [x] 2026-04-30 / Codex: Removed hidden comment sub-chat execution. Comment
  revisions now queue and complete through `conversationId` and
  `conversation_messages`; generated-change prompts stay on the revision/run
  records instead of a hidden sub-chat transcript.
- [x] 2026-04-30 / Codex: Routed agent runtime chat sends through a
  `conversation` workspace target, while keeping UI-local `subChatId` adapter
  names as stable keys for the existing tab/draft/scroll/streaming stores.
- [x] 2026-04-30 / Codex: Updated `chats` compatibility procedures so normal
  Ripple list/get/create/rename/archive/reveal/delete/diff/export/stat calls
  operate on `conversations` and `conversation_messages`.
- [x] 2026-04-30 / Codex: Retired the physical legacy `sub_chats` table from
  the active Drizzle schema and migration chain. Remaining `subChatId` names
  are compatibility identifiers in existing renderer/provider contracts or
  remote hosted import payloads; normal Ripple chat/comment flows persist to
  `conversations` and `conversation_messages`.
- [x] 2026-04-30 / Codex: Audited visible Ripple UI entry points for
  store-backed sub-chat history after QA found the desktop history popover
  regression. The desktop embedded toolbar, mobile chat header, global
  quick-switch affordance, comments actions, utility panes, and settings debug
  labels now either use project conversations or are explicitly treated as
  legacy renderer-local tab adapters.
- [x] 2026-04-30 / Codex: Fixed the Phase 10 review findings from the
  Phase 8/9/10 implementation review. Comment conversation messages now receive
  the generated-change `revisionId` when the revision row is created, so
  `Open in Chat` cannot accidentally start a duplicate normal chat run. Normal
  chat history now lists project conversations only, while comment
  conversations remain reachable through comment actions and direct reveals.
- [x] 2026-04-30 / Codex: Completed the pre-commit Phase 8/9/10 audit follow-up
  for conversation durability. Startup repair now runs before and after Drizzle
  migrations so drifted early `0013` databases can survive the `0014` rebuild,
  conversation creation validates composition/comment/revision ownership against
  the selected project, and generic project conversation lists exclude comment
  conversations.
- [x] 2026-04-30 / Codex: Added the comprehensive pre-commit conversation UX
  coverage pass. New tests cover normal project conversation history excluding
  comment conversations, reusable comment conversations, user replies reopening
  archived/deleted conversations without duplicate generated prompts, rich
  transcript restoration with attachments/tool/reasoning parts, and normal
  chat history switching returning the preview to Main at the current time.

## Surprises & Discoveries

- Observation: Phase 9 already introduced `agent_threads`, `agent_runs`,
  `workspaces`, `agent_run_events`, approvals, and `transcript_messages`.
  Evidence: `src/main/lib/db/schema/index.ts` contains those tables, but
  `agent_threads`, `agent_runs`, and `transcript_messages` still include
  `chat_id` and `sub_chat_id` compatibility columns.
- Observation: Comment revisions originally created a hidden `chats` row plus
  one `sub_chats` row, then attached the revision to both. Phase 10 now creates
  or reuses a canonical conversation and stores comment transcript entries in
  `conversation_messages`.
  Evidence: `src/main/lib/revisions/comment-revisions.ts` writes
  `conversationId` for revisions and uses conversation service helpers for
  prompt/message persistence.
- Observation: Workspaces are already separated from transcripts, but their
  target vocabulary still includes legacy `"chat"`.
  Evidence: `src/main/lib/agent-runtime/workspace-context.ts` resolves targets
  of type `project`, `chat`, and `revision`; revisions already resolve to
  isolated generated-change workspaces.
- Observation: The mature chat renderer uses `subChatId` as a UI-local identity
  key for drafts, mounted tab caching, scroll positions, streaming status,
  model selection, and queue state.
  Evidence: `src/renderer/features/agents/main/active-chat.tsx` and
  `src/renderer/features/agents/stores/sub-chat-store.ts` use that key for
  renderer state even when the backing row is now a conversation.
- Observation: `conversations` cannot own foreign keys back to both
  `comment_threads` and `revisions` while those tables also point at
  `conversations`.
  Evidence: TypeScript reported circular Drizzle initializers for
  `conversations` and `commentThreads`; the migration keeps the reverse IDs as
  indexed nullable text and uses `comment_threads.conversation_id` plus
  `revisions.conversation_id` as the ownership links.
- Observation: The Ripple project shell no longer needs a selected legacy chat
  to render.
  Evidence: `shouldRenderRippleShell` now depends on a selected local Ripple
  project plus the HyperFrames project pane capability, so clicking New Chat no
  longer traps the user away from history.
- Observation: The old renderer-local sub-chat store can still be mounted by
  auxiliary UI even when the main Ripple shell uses project conversations.
  Evidence: The desktop embedded toolbar had already been fixed to accept
  `historySubChats`, but `MobileChatHeader` and the global sub-chat quick
  switcher still read `useAgentSubChatStore().allSubChats`. The mobile header
  now accepts project conversation history, and the global sub-chat quick
  switcher is suppressed while a local Ripple project context is active.
- Observation: Global chat quick-switch can change the selected conversation
  without going through the project rail.
  Evidence: `AgentsContent` previously set only `selectedChatId` for quick
  switch selection. It now also synchronizes `selectedProject` from the
  selected conversation's `projectId` so project-scoped Ripple panes do not
  drift from the active conversation.

## Decision Log

- Decision: Ripple will use `Conversation` as the canonical transcript model.
  `Chat` may remain a UI word, but code should not introduce new `subChat`
  dependencies for Ripple flows.
  Rationale: The roadmap target domain model names `AgentSession`, comments,
  revisions, and projects, but treats chat/sub-chat as inherited codebase
  reality. The user confirmed there are no current-user migration constraints.
  Date/Author: 2026-04-30 / Codex.
- Decision: A comment is a compact conversation with a visual anchor.
  Rationale: The comment card should show the useful review loop, while
  `Open in Chat` opens the same underlying conversation for deeper work.
  Date/Author: 2026-04-30 / Codex.
- Decision: A worktree belongs to a `Revision`/proposal or workspace record, not
  to a sub-chat.
  Rationale: Worktrees are isolation mechanics for generated changes. Chats and
  comments are user intent/transcripts; mixing these causes confusing UI and
  brittle state.
  Date/Author: 2026-04-30 / Codex.
- Decision: The conversation data model migration must be decoupled from the
  visible chat renderer migration.
  Rationale: The first renderer cutover replaced mature chat message UI with a
  thinner conversation pane. Ripple can add canonical conversation records now,
  but the user-facing `ChatView` experience should stay unchanged until a
  deliberate parity-preserving migration exists.
  Date/Author: 2026-04-30 / Codex.
- Decision: Phase 10 should complete the migration to
  `project -> conversation -> conversation_messages` without changing the
  visible chat UX.
  Rationale: There are no current-user migration constraints, and the test
  projects can be recreated. The right implementation is not to keep
  `sub_chats` indefinitely, but to move the existing UI contract onto
  conversations while preserving behavior.
  Date/Author: 2026-04-30 / Codex.
- Decision: Keep the existing renderer's `subChatId` variable/store names as a
  temporary adapter, but make those IDs point to conversation IDs.
  Rationale: Renaming renderer-local identity keys would be a large visual-risk
  refactor with no product benefit in this phase. The product/data model change
  is that persisted transcript state is stored in `conversation_messages`, not
  hidden nested sub-chat rows.
  Date/Author: 2026-04-30 / Codex.
- Decision: The migration can be breaking in final form, but the implementation
  should still use additive milestones while the current dirty worktree has
  ongoing Phase 9 changes.
  Rationale: Additive milestones let tests keep passing and prevent accidental
  loss of in-flight provider-runtime work.
  Date/Author: 2026-04-30 / Codex.

## Outcomes & Retrospective

First implementation slice completed on 2026-04-30:

- `ROADMAP.md` names project-level conversations as the target model and now
  records the physical `sub_chats` table as retired from the active schema.
- `src/main/lib/db/schema/index.ts` now has `conversations`,
  `conversation_messages`, and `conversationId` columns for comments,
  revisions, agent threads/runs, and transcript messages.
- `drizzle/0013_clammy_cable.sql` and
  `drizzle/meta/0013_snapshot.json` capture the additive migration.
- `src/main/lib/conversations/service.ts` creates/reuses comment
  conversations and appends canonical conversation messages.
- Agent runtime calls can receive `conversationId`; generated-change runs pass
  the revision conversation through; transcript projection writes assistant
  output to `conversation_messages`.
- Comment threads append user-facing comment/reply messages into their
  conversation. Generated-change user prompts stay in `transcript_messages`
  only, so the future comment chat does not show the expanded hidden prompt as
  if the user typed it.

Second implementation slice completed on 2026-04-30:

- `src/shared/ripple-conversations.ts` defines the shared conversation view
  types and title helper used by the main-process API and renderer.
- `src/main/lib/conversations/service.ts` now lists, creates, reads, and
  appends canonical project/comment conversation records.
- `src/main/lib/trpc/routers/conversations.ts` exposes project conversation
  list/get/create/rename/archive APIs.
- The visible Ripple chat pane intentionally remains on
  `src/renderer/features/agents/main/active-chat.tsx` and
  `src/renderer/features/agents/main/new-chat-form.tsx`; the attempted
  `RippleConversationPane` renderer was removed after audit because it
  regressed message UI behavior.
- Comment cards retain canonical `conversationId` data, and `Open in Chat`
  reveals that conversation through the mature chat renderer for deeper work.
- Comment delete/restore/resolve/accept now update the attached conversation's
  status, and user replies reopen the conversation.
- The Ripple shell now renders for local projects without requiring a selected
  legacy chat, which fixes the New Chat -> open previous chat dead end.
- The old `ripple-chat-history` helper and test were removed; the existing
  `RippleEmbeddedChatToolbar` now accepts project chat history while preserving
  the old toolbar and message renderer.
- `src/renderer/features/agents/main/isolated-message-group.tsx` no longer
  references the removed `isImageOnlyMessage` helper, and attachment-only
  messages keep the existing bubble/attachment behavior.

Third implementation slice completed on 2026-04-30:

- `src/main/lib/trpc/routers/chats.ts` now treats each compatibility “chat” as
  a conversation and returns one conversation-shaped `subChats` adapter entry
  for the existing `ChatView`.
- Normal chat create/list/get/rename/archive/reveal/delete/diff/export/stat
  procedures read and write `conversations` plus `conversation_messages`.
- `src/renderer/features/agents/lib/agent-runtime-chat-transport.ts` starts
  main-process agent runs with a `conversation` target and passes the active
  conversation ID as `conversationId`.
- `src/main/lib/agent-runtime/workspace-context.ts` resolves conversation
  targets directly while preserving legacy `chat` resolution for older code.
- `src/main/lib/agent-runtime/transcript-projection.ts` writes runtime
  transcript messages to `conversation_messages`.
- `src/main/lib/revisions/comment-revisions.ts` no longer creates hidden chats
  or hidden sub-chats for comment proposals. Comment replies append compact
  user-visible messages to the comment conversation, and generated-change runs
  use the revision prompt plus conversation attachments.
- `src/main/lib/revisions/revision-queue.ts` claims runnable generated changes
  by `conversationId` and uses conversation mode/messages for provider/model
  context.
- `src/renderer/features/comments/RippleCommentsPane.tsx` opens the revision's
  canonical `conversationId` in Chat.
- `drizzle/0014_light_the_captain.sql` removes the physical `sub_chats` table
  and rebuilds dependent legacy compatibility columns as plain nullable text.
- Older provider/import/debug surfaces that still expose `subChatId` names now
  resolve those identifiers as conversation IDs. Hosted sandbox import keeps
  the remote `subChats` payload name because that is the external export shape.

## Context and Orientation

Current state after this phase slice:

- `projects` are the Ripple project records.
- `conversations` are the canonical Ripple transcripts for project chat and
  comment/proposal work. The compatibility chat router maps these records back
  into the shape expected by the existing `ChatView`.
- `conversation_messages` store user, assistant, system, tool, attachment, and
  generated-change transcript entries for those conversations.
- `chats` is legacy compatibility scaffolding for older non-Ripple surfaces.
  The physical `sub_chats` table is retired; UI-local `subChatId` names now
  identify conversation IDs at the adapter boundary.
- `comment_threads` are Ripple frame/time/element anchors.
- `revisions` are generated proposals. They store the desired Ripple fields
  (`thread_id`, `project_id`, `context_path`, status, provider, agent thread/run
  IDs) plus nullable legacy `chat_id`/`sub_chat_id` columns that remain only for
  compatibility.
- `workspaces` point at the main project folder, a conversation workspace, or an
  isolated generated-change workspace.
- `agent_threads` and `agent_runs` are the Phase 9 main-process provider
  execution records.
- `transcript_messages` stores projected agent transcript rows. Current chat
  rendering reads conversation messages through the compatibility adapter
  instead of a sub-chat JSON projection.

Target terms:

- `Conversation`: one user-facing chat thread. It belongs to a project and may
  be attached to a composition, comment thread, revision/proposal, export job,
  or support/debug context.
- `ConversationMessage`: one transcript message in a conversation.
- `CommentThread`: a visual review anchor and compact review object.
- `Revision` or `Proposal`: an isolated generated change, usually backed by a
  worktree or similar workspace.
- `Workspace`: a validated filesystem root for main project work or proposal
  work. This owns paths; renderer code should not provide authoritative paths.

## Plan of Work

Start with an additive foundation because Phase 9 provider-runtime changes are
already in the worktree. Add `conversations` and `conversation_messages`, add
`conversation_id` compatibility columns to agent runtime, comments, and
revisions, then teach transcript projection to write canonical conversation
messages whenever a run has a `conversationId`.

The first implementation slice created conversations for comment revisions while
still creating hidden legacy chat/sub-chat rows. That gave the current UI
continuity while establishing the canonical record for new code.

The completed Phase 10 slice keeps the visible renderer and interaction design
intact but replaces its backing contract. A conversation-backed adapter feeds the
current chat components the message, selection, streaming, draft, model, history,
and attachment state they already expect. Project chats and comment `Open in
Chat` use `conversationId`; comment-generated proposals continue through the
same conversation. Hidden sub-chat execution/projection has been removed from
normal Ripple flows. The physical `sub_chats` table is no longer part of the
active schema; remaining legacy names are adapter/API compatibility only.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Update `ROADMAP.md` target domain model and Phase 9 notes to state that
   conversations replace sub-chats and comments are compact conversations with
   proposal workspaces.
2. Add `conversations` and `conversation_messages` to
   `src/main/lib/db/schema/index.ts`; add `conversationId` columns to
   `comment_threads`, `revisions`, `agent_threads`, `agent_runs`, and
   `transcript_messages`.
3. Generate or hand-write a Drizzle migration for those additive schema changes.
4. Add a small `src/main/lib/conversations/*` service for creating project,
   comment, and revision conversations and appending messages.
5. Update `StartAgentRunInput`, `startAgentRun`, and transcript projection so
   agent runtime writes canonical conversation messages when available.
6. Update `createRevisionForThread` and follow-up revision creation to create
   or reuse a comment conversation, attach it to the revision, and pass it to
   the generated-change scheduler.
7. Add focused tests for conversation schema helpers and comment revision
   conversation attachment.
8. Add a conversations tRPC router and conversation-backed UI adapter that can
   replace the `sub_chats` data source without changing the visible chat UI.
9. Route New Chat, chat history, normal sends, comment replies, generated
   proposals, and comment `Open in Chat` through canonical conversations.
10. Remove physical `sub_chats` persistence/projection. Keep UI-local
   `subChatId` store names only where they are stable adapter keys for the
   existing renderer, not a nested persistence model.
11. Run focused tests, then `bun run ts:check` if available. If `tsgo` is still
   missing, run `bun x tsc --noEmit --pretty false` and record unrelated
   failures separately.

## Validation and Acceptance

Validation commands:

- `bun test src/main/lib/conversations src/main/lib/revisions src/main/lib/agent-runtime`
- `bun test src/renderer/features/ripple-shell`
- `bun run ts:check`
- fallback when `tsgo` is unavailable: `bun x tsc --noEmit --pretty false`

Validation log:

- `bun test src/shared/ripple-comments.test.ts src/main/lib/revisions/comment-revisions.test.ts src/main/lib/agent-runtime`
  passed on 2026-04-30.
- `bun test src/renderer/features/comments src/renderer/features/hyperframes/preview-comment-markers.test.ts src/renderer/features/ripple-shell`
  passed on 2026-04-30.
- `bun run db:generate` reported no schema changes after the migration cleanup
  on 2026-04-30.
- `sqlite3 /private/tmp/ripple-migration-smoke-0013.db ".read ..."` applied
  migrations `0000` through `0013` and listed the new `conversations` and
  `conversation_messages` tables on 2026-04-30.
- `bun run ts:check` still fails because `tsgo` is not installed in this
  checkout.
- `bun test src/shared/ripple-conversations.test.ts src/shared/ripple-comments.test.ts src/renderer/features/ripple-shell src/renderer/features/comments src/renderer/features/hyperframes/preview-comment-markers.test.ts src/main/lib/agent-runtime src/main/lib/revisions/comment-revisions.test.ts`
  passed on 2026-04-30 with 71 tests after restoring the existing `ChatView`
  and `NewChatForm` renderer path.
- `bun x tsc --noEmit --pretty false` now only reports the pre-existing
  `Headers.entries` errors in `src/main/windows/main.ts` and
  `src/renderer/lib/api-fetch.ts`; the `IsolatedMessageGroup` attachment
  condition error is fixed.
- `bun x tsc --noEmit --pretty false` on 2026-04-30 still reports only the two
  pre-existing `Headers.entries` errors in `src/main/windows/main.ts` and
  `src/renderer/lib/api-fetch.ts`.
- `bun run test:ripple` passed on 2026-04-30 with 216 tests.
- `bun test` passed on 2026-04-30 with 219 tests.
- `bun run db:generate` reported no schema changes on 2026-04-30 after adding
  the conversation compatibility columns and indexes to the migration snapshot.
- `bun run build` passed on 2026-04-30 with existing Vite chunk/eval warnings.
- QA on 2026-04-30 found the Chat history popover showed the full project
  conversation list only on the blank new-chat pane; once a conversation opened,
  `ChatView`'s embedded toolbar fell back to the UI-local sub-chat store and
  only saw the active conversation. `RippleShell` now passes project history
  into both toolbar mount paths, and history selection switches the selected
  conversation.
- Follow-up UI audit on 2026-04-30 found the same old-store risk in the
  mobile/narrow chat header and global sub-chat quick-switch UI. Mobile chat
  history now accepts the same project conversation history source as the
  desktop toolbar. The global legacy sub-chat quick-switcher no longer opens
  while a local Ripple project context is active. Global chat quick-switch now
  synchronizes the selected project from the selected conversation. The
  Settings debug database row now labels `conversations` instead of
  `Sub-chats`, and `/clear` no longer describes new chats as sub-chats.
- `bun test src/renderer/features/ripple-shell` passed on 2026-04-30 with 15
  tests after the history toolbar fix.
- `bun x tsc --noEmit --pretty false` on 2026-04-30 still reports only the two
  pre-existing `Headers.entries` errors in `src/main/windows/main.ts` and
  `src/renderer/lib/api-fetch.ts`.
- `bun run test:ripple` passed on 2026-04-30 with 216 tests after the history
  toolbar fix.
- `bun run build` passed on 2026-04-30 with existing Vite chunk/eval warnings.
- `bun run db:generate` generated `0014_light_the_captain` on 2026-04-30 to
  remove `sub_chats`; the migration was hand-adjusted so SQLite foreign keys
  stay disabled through the full table rebuild sequence.
- Fresh SQLite migration smoke through `0014_light_the_captain` passed on
  2026-04-30: `conversations` and `conversation_messages` exist, and
  `sub_chats` is absent.
- `bun x tsc --noEmit --pretty false` on 2026-04-30 reports only the two
  pre-existing `Headers.entries` errors in `src/main/windows/main.ts` and
  `src/renderer/lib/api-fetch.ts`.
- `bun run test:ripple` passed on 2026-04-30 with 216 tests.
- `bun test` passed on 2026-04-30 with 219 tests.
- `bun run build` passed on 2026-04-30 with existing Vite chunk/eval warnings.
- `git diff --check` passed on 2026-04-30.
- QA on 2026-04-30 found existing dev databases could have applied the early
  `0013` conversation table without later compatibility columns such as
  `mode`, and `0014` table rebuilds failed under Drizzle while SQLite foreign
  keys were enabled. `src/main/lib/db/schema-repair.ts` now repairs drifted
  conversation tables at startup, and `src/main/lib/db/index.ts` disables
  foreign-key checks around the migration batch before re-enabling them for
  runtime.
- `bun test src/main/lib/db/index.test.ts` passed on 2026-04-30 with 2 tests.
- `bun x tsc --noEmit --pretty false` on 2026-04-30 still reports only the two
  pre-existing `Headers.entries` errors in `src/main/windows/main.ts` and
  `src/renderer/lib/api-fetch.ts`.
- `bun run test:ripple` passed on 2026-04-30 with 216 tests after the startup
  schema repair.
- `bun test` passed on 2026-04-30 with 221 tests after the startup schema
  repair.
- `bun run build` passed on 2026-04-30 with existing Vite chunk/eval warnings.
- `bun x tsc --noEmit --pretty false` on 2026-04-30 after the UI audit still
  reports only the two pre-existing `Headers.entries` errors in
  `src/main/windows/main.ts` and `src/renderer/lib/api-fetch.ts`.
- Focused UI audit tests passed on 2026-04-30 with 37 tests:
  `bun test src/renderer/features/ripple-shell src/renderer/features/comments
  src/renderer/features/agents/utils/project-pane-layout.test.ts
  src/renderer/features/agents/lib/agents-actions.test.ts
  src/shared/ripple-conversations.test.ts src/shared/ripple-comments.test.ts`.
- `bun run test:ripple` passed on 2026-04-30 with 216 tests after the UI audit.
- `bun test` passed on 2026-04-30 with 221 tests after the UI audit.
- `git diff --check` passed on 2026-04-30 after the UI audit.
- `bun run build` passed on 2026-04-30 after the UI audit with existing Vite
  eval/chunk warnings.
- Pre-commit audit validation on 2026-04-30 passed `bun test` with 224 tests,
  `bun run test:ripple` with 218 tests, `bun run db:generate` with no schema
  changes, `bun run build` with the existing Vite eval/chunk warnings, and
  `git diff --check`. `bun run ts:check` still fails because `tsgo` is missing;
  fallback `bun x tsc --noEmit --pretty false` still reports only the two
  pre-existing `Headers.entries` errors in `src/main/windows/main.ts` and
  `src/renderer/lib/api-fetch.ts`.
- Comprehensive UX coverage validation on 2026-04-30 passed `bun run
  test:ripple` with 245 tests across 57 files, `bun test` with 248 tests across
  58 files, `bun run db:generate` with no schema changes, `bun run build` with
  the existing Vite eval/chunk warnings, and `git diff --check`. `bun run
  ts:check` remains blocked by missing `tsgo`; fallback `bun x tsc --noEmit
  --pretty false` still reports only the two pre-existing `Headers.entries`
  diagnostics.

Acceptance criteria:

- A newly created comment thread has a canonical conversation attached.
- A comment-generated revision stores `conversationId` in the revision row.
- Agent runtime runs with a `conversationId` append user and assistant
  transcript rows to `conversation_messages`.
- Existing chat UI and UX are unchanged, but it reads and writes conversations
  and conversation messages instead of `sub_chats.messages`.
- New Chat in the Ripple shell creates or opens project conversations, and the
  history button opens previous conversations through the existing renderer.
- Opening a comment in Chat opens the comment's canonical conversation while
  preserving the same generated proposal context.
- Deleting, restoring, resolving, and accepting a comment updates the attached
  conversation so chat history reflects the same lifecycle.
- No new primary-path UI copy says `sub-chat`, branch, or worktree.

## Idempotence and Recovery

The schema migration can be breaking for local test data. Service helpers must
remain idempotent by accepting a client request ID or existing `conversationId`
and returning the existing conversation when present.

If a later milestone fails, preserve the current UI components and roll forward
through the adapter rather than introducing a new visual chat pane. The retired
physical `sub_chats` table should not be reintroduced for Ripple flows; fix
adapter regressions against `conversations` and `conversation_messages`.

## Interfaces and Dependencies

New or changed interfaces:

- `conversations` table.
- `conversation_messages` table.
- `sub_chats` table removed from the active schema.
- `conversationId` on comment threads, revisions, agent threads, agent runs,
  and transcript messages.
- `StartAgentRunInput.conversationId`.
- Conversation service helpers for creation and message appends.

Existing dependencies:

- `src/main/lib/agent-runtime/service.ts`
- `src/main/lib/agent-runtime/transcript-projection.ts`
- `src/main/lib/agent-runtime/generated-change-scheduler.ts`
- `src/main/lib/revisions/comment-revisions.ts`
- `src/main/lib/revisions/revision-queue.ts`
- `src/renderer/features/comments/RippleCommentsPane.tsx`
- `src/renderer/features/ripple-shell/*`

## Artifacts and Notes

- The current worktree has many Phase 9 and preview/comment changes that are
  not part of this plan. Treat them as in-flight user/agent work and do not
  revert them.
- `bun run ts:check` currently fails in this checkout because `tsgo` is not
  installed. The fallback TypeScript command now reports only the existing
  `Headers.entries` errors in `src/main/windows/main.ts` and
  `src/renderer/lib/api-fetch.ts`.
