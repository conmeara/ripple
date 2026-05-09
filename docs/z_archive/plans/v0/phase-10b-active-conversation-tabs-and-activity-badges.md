# Phase 10B: Active Conversations And Activity Badges

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this change, Ripple users can keep several conversations visible as
active tabs or chips in the right `Chat` pane, close a chip when it is no
longer part of their immediate work, and still find the conversation later in
history. Closing a chip is not archiving, deleting, or resolving the
conversation. It only removes the conversation from the user's current active
work set.

The active conversation strip is a focus and navigation tool, not a scope or
ownership model. A normal project conversation is not permanently attached to
`Main`, `index.html`, a composition, or a future sequence. The user can talk
about whatever they want inside that conversation. Comment conversations are
still comment-backed because they come from a frame/time/element thread, but
opening one in Chat only makes that thread easier to follow up on; it does not
change the general rule that active tabs represent user attention, not file
ownership.

The left project browser should also show lightweight activity badges on
composition rows, and later sequence rows, so users can see when there are new
comment changes that are working, ready, or need attention. These badges are
notifications. They disappear after the user clicks the row or badge, and they
reappear only when new activity happens afterward. If an agent is still running
after the user acknowledges it, the unread badge should disappear; a very quiet
live indicator can remain only if it is needed to avoid making background work
feel lost.

## Progress

- [x] 2026-05-02 / User + Codex: Started planning active chat tabs/chips and
  composition/sequence activity badges. User decision: active conversation tabs
  must not be tied to a specific `index`, composition, or `Main`; the user can
  decide what a conversation is about.
- [x] 2026-05-02 / Codex: Read `PLANS.md`, the Phase 10 roadmap section, the
  Phase 10 conversation plan, Phase 7 shell plan, Phase 8 comments plan, and
  current right-pane/project-pane code before drafting this plan.
- [x] 2026-05-02 / Codex: Implemented Milestone 1: active conversation state
  model and tests.
- [x] 2026-05-02 / Codex: Implemented Milestone 2: right-pane active
  conversation tab strip.
- [x] 2026-05-02 / Codex: Implemented Milestone 3: activity summary and
  acknowledgement model for composition rows.
- [x] 2026-05-02 / Codex: Implemented Milestone 4: project browser badges with
  future sequence-ready shared helpers.
- [x] 2026-05-02 / Codex: Completed Milestone 5 validation with focused tests,
  `bun run test:ripple`, `bun run ts:check`, and `bun run build`. Electron dev
  smoke loaded the Ripple shell, selected project, composition browser,
  preview/timeline, and right chat pane; chat history reopen worked in the live
  shell. Live badge visuals were not exercised because the active project did
  not have pending revision activity.

## Surprises & Discoveries

- Observation: The old inherited tab strip still exists, but it is built around
  `SubChatSelector` and `useAgentSubChatStore` names.
  Evidence: `src/renderer/features/agents/ui/sub-chat-selector.tsx` renders
  closeable tabs, history search, unseen dots, pending question dots, pinning,
  and split panes. `src/renderer/features/agents/stores/sub-chat-store.ts`
  stores `openSubChatIds`, active ID, pinned IDs, and split state.

- Observation: The current Ripple right pane intentionally hides the old full
  tab header.
  Evidence: `src/renderer/features/ripple-shell/RippleShell.tsx` renders
  `ChatView` with `hideHeader` and `suppressSecondarySidebars`. Inside that
  mode, `src/renderer/features/agents/main/active-chat.tsx` renders
  `RippleEmbeddedChatToolbar`, which currently exposes only worktree actions,
  history search, and New Chat.

- Observation: Ripple's backing data model is already ready for conversation
  IDs to be the unit of navigation.
  Evidence: `src/main/lib/db/schema/index.ts` defines `conversations` with
  `projectId`, optional `compositionId`, optional `commentThreadId`, optional
  `revisionId`, `kind`, `title`, `status`, timestamps, and worktree fields.
  `ROADMAP.md` says old `subChatId` names are compatibility identifiers and new
  Ripple work should use project conversations.

- Observation: Normal chat history deliberately excludes comment conversations,
  while comments remain reachable through the comment pane and `Open in Chat`.
  Evidence: `src/main/lib/trpc/routers/chats.ts` has `list` filtered to
  `conversations.kind = "project"`, and `RippleCommentsPane` opens a revision
  conversation through `onOpenChat`.

- Observation: The composition rows do not currently have an activity slot.
  Evidence: `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`
  `CompositionRow` shows a thumbnail, display name, and file path only.

- Observation: Comment and preview marker tone logic already has the core
  states needed for badges.
  Evidence: `src/renderer/features/comments/RippleCommentsPane.tsx` maps
  running states to `Working`, failed to `Needs attention`, and proposed or
  accepted to `Done`. `src/renderer/features/hyperframes/preview-comment-markers.ts`
  maps similar states to `in-progress`, `needs-input`, and `done`.

- Observation: The first Electron dev smoke attempt opened a blank 1Code window
  and exited without actionable renderer logs, but a later relaunch produced a
  usable Ripple shell.
  Evidence: the successful `bun run dev` pass started the renderer on
  `localhost:5173`, logged `[Main] Window 1 ready to show` and `[Main] Page
  finished loading in window 1`, loaded the `new-timeline` project, rendered the
  composition browser, preview/timeline, and right chat pane, and reopened the
  existing `hi` chat from history.

## Decision Log

- Decision: Active conversation chips are an attention set, not conversation
  ownership or scope.
  Rationale: The user explicitly does not want a conversation to be attached to
  `index`, `Main`, or a composition. Users can talk about multiple things in
  one chat, and the UI should not turn composition selection into a hidden
  conversation routing rule.
  Date/Author: 2026-05-02 / User + Codex.

- Decision: Closing a chip removes it from active chats and keeps it in
  history.
  Rationale: The desired interaction is like closing a visible tab: the `X`
  appears on hover or focus, and the conversation remains recoverable through
  history. It must not call archive, delete, reject, accept, or resolve.
  Date/Author: 2026-05-02 / User + Codex.

- Decision: Badges on composition and future sequence rows represent
  unacknowledged activity, not all activity forever.
  Rationale: The user wants badges to disappear once clicked. A later status
  change, such as `Working` becoming `Changes ready`, should create a new
  unacknowledged activity signature and show a badge again.
  Date/Author: 2026-05-02 / User + Codex.

- Decision: Badge acknowledgement can be local UI state in the first pass.
  Rationale: Ripple is local-first and the badge is an attention cue, not the
  source of truth for comments or revisions. Store acknowledgements by project
  and activity scope in renderer storage first, and promote to SQLite only if
  cross-window or multi-device sync becomes a product requirement.
  Date/Author: 2026-05-02 / Codex.

- Decision: Resurface the original app's tab UX by adapting the inherited
  `SubChatSelector` code and visual behavior, but do not mount the entire
  legacy component unchanged.
  Rationale: The original tab strip looked and behaved well: close-on-hover,
  overflow gradients, history search, unread/pending dots, inline rename, and
  compact density are all worth preserving. The inherited component also
  assumes a parent chat/sub-chat hierarchy, split panes, and coding-workspace
  controls, so Ripple should extract or wrap the useful tab strip behavior while
  feeding it project conversation IDs and Ripple language.
  Date/Author: 2026-05-02 / Codex.

## Outcomes & Retrospective

Implemented active conversation tabs as renderer UI state and composition
activity badges as local acknowledgements over a main-process summary route.
Closing a tab only mutates the active UI set; it does not call archive, delete,
accept, reject, resolve, or any other destructive API. Normal project
conversations remain independent from composition selection.

The remaining visual QA caveat is narrow: the real Electron shell loaded and
history reopening worked, but badge visuals were not exercised against live
pending revision data. Badge state, priority, and acknowledgement behavior are
covered by the focused tests.

## Context and Orientation

Ripple's current visible shell is split into a left project rail, a
compositions/assets pane, the center HyperFrames preview/timeline, and a right
review pane. The right pane can show `Chat`, `Comments`, `Renders`, and utility
surfaces. `RippleReviewPane` owns the right-pane mode switcher, while
`RippleShell` mounts either `ChatView`, `RippleCommentsPane`, or other panes.

The current embedded chat path is:

- `src/renderer/features/ripple-shell/RippleShell.tsx` receives the selected
  project and selected conversation ID, lists project chat history through
  `trpc.chats.list({ projectId })`, and passes history into `ChatView`.
- `src/renderer/features/agents/main/active-chat.tsx` renders `ChatView`. In
  Ripple embedded mode it suppresses the full inherited chat header and renders
  `RippleEmbeddedChatToolbar`.
- `src/renderer/features/ripple-shell/RippleEmbeddedChatToolbar.tsx` shows a
  history search button and New Chat button, but no visible active conversation
  strip.
- `src/main/lib/trpc/routers/chats.ts` exposes chat-shaped compatibility APIs
  backed by `conversations` rows. Normal `list` returns project conversations
  only. Comment conversation reveal uses `chats.reveal`.

The current comments path is:

- `src/renderer/features/comments/RippleCommentsPane.tsx` lists comments for
  the active composition through `trpc.revisions.listThreads({ projectId,
  compositionId, filter })`.
- Comment cards already display a small state dot and can open the associated
  revision conversation in Chat.
- `src/main/lib/revisions/comment-revisions.ts` can list all comment threads
  for a project if `compositionId` is omitted, but that returns full thread
  views. For badges, a lighter summary route is preferable.

The current composition browser path is:

- `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx` lists
  compositions and assets.
- `CompositionRow` is the right place to display activity badges for current
  composition rows.
- There is no sequence model yet. This plan should keep helper names generic
  enough that future sequence rows can use the same activity summary and
  acknowledgement logic without creating fake sequence schema now.

Definitions:

- Active conversation: a conversation the user has kept visible in the right
  pane chip strip. This is UI state.
- History: persisted project conversations reachable through search/history.
  Closing an active chip leaves the conversation in history.
- Activity badge: a small notification indicator on a composition or future
  sequence row, derived from unacknowledged comment/revision activity.
- Activity signature: a stable value for the latest meaningful state of a row,
  such as latest comment/revision update time plus status counts. When the
  signature changes after acknowledgement, the badge appears again.
- Acknowledgement: local record that the user clicked a row or badge after a
  particular activity signature.

## Plan of Work

Milestone 1 builds a small active-conversation state layer for Ripple. Create
helpers under `src/renderer/features/ripple-shell/` that store active
conversation IDs per project in window storage or local storage. The state
should support add, close, set active, reorder if drag support is later added,
and prune IDs that no longer appear in history. Opening a chat from history,
creating a new chat, or opening a comment chat should add that conversation ID
to the active set. Closing a chip should remove the ID from the active set only.

Milestone 2 adds the visible right-pane tab/chip strip. Start from the original
app's inherited tab implementation in `SubChatSelector` and preserve the parts
that made it feel good: tight horizontal tabs, active/inactive treatments,
subtle text truncation, edge fade gradients, close-on-hover/focus, history
search, unread/pending dots, and the compact New Chat affordance. Implement it
as a Ripple-owned adapter or extracted component, such as
`RippleActiveConversationTabs`, rather than mounting the full legacy component
unchanged. The strip should sit inside the `Chat` mode, below the `Chat` /
`Comments` switcher and above the transcript. Tabs show the conversation title,
a compact type/status cue when useful, and an `X` on hover or keyboard focus.
The `X` tooltip should say "Close tab, keep in history" or similar. The
history button remains available for closed conversations, and New Chat remains
available. When there are many active chats, the strip should use the original
tab strip's horizontal scroll/fade behavior without resizing the chat body.
Split panes, coding-workspace controls, and parent/sub-chat assumptions should
stay out of the first Ripple version unless the product deliberately re-adds
them later.

Do not wire tab selection to the active composition. If the user selects
`index`, Ripple should not automatically switch to an `index` chat. If the user
switches chat tabs, Ripple should not automatically switch compositions unless
that chat is a comment conversation opened from a specific comment and the
existing comment handoff intentionally seeks/previews that revision. For normal
project chats, composition selection and chat selection are independent.

Milestone 3 adds a lightweight activity summary for the project browser. Prefer
a main-process tRPC route such as `revisions.listActivitySummary` that returns
per-composition summaries without loading full messages for every thread. The
summary should include counts or booleans for working, ready, needsAttention,
open, and latestActivityAt, plus an `activitySignature`. The first pass can
derive this from comment threads and revisions only. Do not infer that a normal
project chat belongs to a composition.

Milestone 4 renders activity badges in `HyperFramesProjectPane`. Add a small
badge group to `CompositionRow`, with helper functions that can later be reused
for sequences. A badge click should select the composition, open `Comments`,
and acknowledge the current activity signature. A row click should select the
composition and acknowledge the signature as well. If the user clicks a row
while the agent is still working, the unread badge disappears. If the activity
later changes to ready or needs attention, the signature changes and the badge
appears again.

Milestone 5 validates the end-to-end behavior in tests and a desktop smoke. The
implementation must verify that closing a chip does not archive or delete a
conversation, history can reopen closed chips, comment `Open in Chat` adds the
comment conversation to active chats, normal project chats do not attach to the
selected composition, and badges acknowledge/reappear according to activity
signature changes.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Read the relevant current files:
   `src/renderer/features/ripple-shell/RippleShell.tsx`,
   `src/renderer/features/ripple-shell/RippleEmbeddedChatToolbar.tsx`,
   `src/renderer/features/ripple-shell/RippleReviewPane.tsx`,
   `src/renderer/features/agents/main/active-chat.tsx`,
   `src/renderer/features/agents/ui/sub-chat-selector.tsx`,
   `src/renderer/features/agents/stores/sub-chat-store.ts`,
   `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`,
   `src/renderer/features/comments/RippleCommentsPane.tsx`,
   `src/renderer/features/hyperframes/preview-comment-markers.ts`,
   `src/main/lib/trpc/routers/chats.ts`,
   `src/main/lib/trpc/routers/revisions.ts`,
   and `src/main/lib/revisions/comment-revisions.ts`.
2. Add pure helpers for active conversation state under
   `src/renderer/features/ripple-shell/active-conversations.ts`.
   Include tests for add, close, prune, and no-archive semantics.
3. Add `RippleActiveConversationTabs.tsx` under
   `src/renderer/features/ripple-shell/`. Reuse or extract the original
   `SubChatSelector` tab-strip behavior where practical: horizontal tab
   layout, active treatment, close-on-hover, truncation gradients, history
   search, New Chat button, unread/pending indicators, and overflow behavior.
   Adapt the data contract to project conversation IDs and remove legacy
   parent/sub-chat and coding-workspace controls from the first pass.
4. Wire `RippleShell` and `ChatView` so selected project conversations update
   the active set when opened from history, created, or opened from comments.
   Keep `selectedChatId` as the actual active transcript ID.
5. Keep normal project chats unscoped. Do not write `compositionId` on normal
   chat creation merely because a composition is selected.
6. Add a shared activity helper, likely
   `src/shared/ripple-activity.ts`, that maps comment/revision statuses into
   badge summary states and activity signatures.
7. Add a main-process summary function and tRPC route, likely in
   `src/main/lib/revisions/comment-revisions.ts` and
   `src/main/lib/trpc/routers/revisions.ts`, for project-level activity by
   composition. Keep the return payload small.
8. Add a renderer acknowledgement helper under
   `src/renderer/features/ripple-shell/activity-acknowledgements.ts` or
   `src/renderer/features/hyperframes/`. Key acknowledgements by project ID,
   scope kind, and scope ID.
9. Update `CompositionRow` in
   `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx` to render
   badges and call acknowledgement when the row or badge is clicked.
10. Add focused tests for active conversation tabs, activity summary derivation,
    acknowledgement behavior, and the project pane click behavior.
11. Run validation commands and update this ExecPlan with exact outcomes.

## Validation and Acceptance

Validation commands:

- `bun test src/renderer/features/ripple-shell` passed on 2026-05-02.
- `bun test src/renderer/features/hyperframes` passed on 2026-05-02.
- `bun test src/main/lib/revisions src/main/lib/conversations` passed on
  2026-05-02.
- `bun run test:ripple` passed on 2026-05-02 with 304 tests.
- `bun run ts:check` passed on 2026-05-02.
- `bun run build` passed on 2026-05-02.

Acceptance criteria:

- The Chat pane shows a compact row of active conversation chips when more than
  one conversation is active.
- The active conversation strip visibly resembles the original app's polished
  tab strip rather than a generic new set of pills.
- Hovering or focusing a chip exposes an `X`; using it removes the chip from
  active chats but leaves the conversation available in history.
- Opening a conversation from history adds it back to active chips.
- Creating a new chat adds it to active chips and makes it active.
- Opening a comment conversation through `Open in Chat` adds that conversation
  to active chips.
- Selecting a composition does not automatically select or create a
  composition-specific normal chat.
- Selecting a normal active chat does not automatically switch the composition.
- Composition rows show badges for unacknowledged working, ready, and
  needs-attention comment activity.
- Clicking a composition row or badge clears the badge for the current activity
  signature.
- A later comment/revision status change for that composition causes a badge to
  appear again.
- Badges use Ripple comment language and avoid branch, worktree, PR, repo, or
  developer terminology in the primary surface.

Manual smoke:

- `bun run dev` was attempted on 2026-05-02. The first pass built the Electron
  main and preload bundles and started a renderer dev server on
  `localhost:5174`, but the captured Electron window stayed blank white and the
  process exited with code 0 without a useful renderer error.
- A later relaunch started the renderer dev server on `localhost:5173`, loaded
  the Ripple shell, opened the `new-timeline` project, showed the composition
  browser, preview/timeline, and right chat pane, and reopened the existing
  `hi` chat from the chat history popover without changing the selected
  composition. The active project had no live pending revision activity, so
  badge acknowledgement was not visually exercised in this smoke pass.

## Idempotence and Recovery

Active conversation state is renderer UI state and can be safely rebuilt from
conversation history. If stored active IDs point to deleted or unavailable
conversations, prune them on load and fall back to the selected conversation or
New Chat form.

Closing a chip must not call destructive APIs. If a close handler accidentally
uses archive/delete during development, revert that wiring and add a regression
test proving that chip close only updates active UI state.

Badge acknowledgement state can be cleared without data loss. If activity
signatures are wrong or acknowledgements get stuck, deleting the renderer
storage key should only make badges reappear; it should not affect comments,
revisions, or generated changes.

The activity summary route should be additive. If the new summary route fails,
the project pane can hide badges and log/report the error without blocking
composition selection, preview, comments, or chat.

## Interfaces and Dependencies

New or changed renderer interfaces:

- `RippleActiveConversationTabs` component, owned by
  `src/renderer/features/ripple-shell/`, adapted from the original
  `SubChatSelector` tab-strip behavior where practical.
- Active conversation helper/store keyed by project ID.
- Activity acknowledgement helper keyed by `projectId`, `scopeKind`, and
  `scopeId`.
- `HyperFramesProjectPane` receives activity summaries and acknowledgements for
  each `CompositionRow`.

New or changed main-process/shared interfaces:

- Shared activity summary types and status mapping helpers.
- Optional `revisions.listActivitySummary` tRPC procedure returning compact
  per-composition activity.
- Existing `chats.list`, `chats.get`, `chats.reveal`, `chats.create`, and
  `revisions.listThreads` behavior should remain compatible.

Dependencies and constraints:

- Use existing Radix/Tailwind component patterns.
- Use lucide icons for close/history/new/status affordances where icons are
  needed.
- Do not introduce a new persisted `sub_chats` model.
- Do not make renderer code launch shell commands.
- Do not expose worktree/branch/repo language in this primary UX.
- Keep future sequence support generic, but do not create sequence schema in
  this phase unless a sequence model already exists by implementation time.

## Artifacts and Notes

This plan intentionally avoids automatic conversation scoping. Future work can
add optional context chips in the composer, such as `@index` or `@sequence`, but
that should be explicit user-provided context, not a hidden binding between the
active composition row and the current chat.

The visual and interaction reference for active chat tabs is the original app's
legacy tab strip, especially `SubChatSelector`. The implementation should reuse
or extract that code where doing so keeps the original feel without carrying
forward the legacy parent/sub-chat product model.

Potential UI wording:

- Chip close tooltip: `Close tab, keep in history`.
- History tooltip: `Chat history`.
- Ready badge tooltip: `Changes ready`.
- Working badge tooltip: `Working`.
- Needs-attention badge tooltip: `Needs attention`.

Potential first-pass file list:

- `src/renderer/features/ripple-shell/RippleActiveConversationTabs.tsx`
- `src/renderer/features/ripple-shell/active-conversations.ts`
- `src/renderer/features/ripple-shell/active-conversations.test.ts`
- `src/renderer/features/ripple-shell/activity-acknowledgements.ts`
- `src/renderer/features/ripple-shell/activity-acknowledgements.test.ts`
- `src/shared/ripple-activity.ts`
- `src/shared/ripple-activity.test.ts`
- `src/main/lib/revisions/comment-revisions.ts`
- `src/main/lib/trpc/routers/revisions.ts`
- `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`
- `src/renderer/features/hyperframes/composition-activity-badges.ts`
- `src/renderer/features/hyperframes/composition-activity-badges.test.ts`
- focused tests near each changed module

Implementation notes:

- `src/main/lib/trpc/routers/chats.ts` now returns lightweight conversation
  kind/status context from chat-shaped APIs so comment conversations can appear
  correctly in active tabs after `Open in Chat`.
- `package.json` now includes `src/shared/ripple-activity.test.ts` in
  `bun run test:ripple`.
