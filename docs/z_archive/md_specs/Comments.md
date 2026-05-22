# Comments

Comments are frame-based review notes for a motion project. They let the user point at the current frame or a selected timeline range, describe what should change, see agent work in context, compare a proposed version, and accept the result into Main.

The detailed interface behavior spec lives in `docs/specs/Comments.html`. This page keeps the Obsidian product coverage map wired for agents, tests, and release gates.

[Comments Screenshot: review pane with anchored comment cards, status dots, reply composer, timeline markers, and View Main control]

## User Model

The user should feel like they are leaving creative feedback on the piece, not opening a developer issue.

They should be able to:

- Pause on a frame and leave a comment about what they see.
- Select a range and leave timing or motion feedback.
- Get an immediate comment card before screenshots or agent work finish.
- Watch concise status on the card while the agent works.
- Preview the proposed change against Main at the anchored moment.
- Reply, retry, delete, restore, or accept without losing the thread.

## Composer And Anchors

The comment composer is tied to [[Preview]] and [[Timeline]]. A point comment captures the active composition, source, and frame. A range comment captures the selected start/end frames and normalizes reversed selections.

Sending should feel instant. The card appears first, then [[Visual Context]] attaches the current frame or range sheet in the background. If capture fails, the comment remains useful through text, composition, and time context.

## Comment Cards

Cards should be compact and scan-friendly. They show the user note, agent status, short result text, and the actions that matter for the current state.

Status should speak in product language:

| State | User meaning |
| --- | --- |
| Open | The note is waiting or available for review |
| Working | Ripple is generating or updating a proposed change |
| Proposed | A previewable change is ready |
| Answered | The agent responded without source changes |
| Failed | The user can retry or open the conversation |
| Accepted | The proposal has been applied to Main |

Long agent output should expand through Read more instead of making the card tall by default.

## Preview And Timeline

Selecting a comment should seek [[Preview]] to the anchored frame or range. If a proposed revision exists, the preview can switch to that proposal. The Comments pane owns the View Main control while the user is inspecting a proposal, and returning to Main should preserve playback time.

Timeline markers should represent active, working, and proposed comments. Accepted and deleted comments should not clutter the normal preview timeline.

## Replies And Thread History

Replies continue the same conversation and cumulative proposed state. Open in Chat should expose the full history when the user needs more detail, but the card should stay focused on the latest actionable result.

Comment-level history belongs with [[Chats]] and [[Revisions]]. The user should not need to understand worktrees or branches to know which proposed change they are reviewing.

## Accept, Delete, And Recovery

Accept is available only when a proposal is ready and safe to apply. Accepting should apply only that revision, mark the thread accepted, and protect Main with rollback if the operation fails.

Deleting a comment is a soft-delete before acceptance. Restoring brings the thread and history back. Startup recovery should requeue interrupted work and keep comments visible enough for the user to continue.

## Relationship To Other Specs

- [[Preview]] supplies the visual source and playback time.
- [[Timeline]] supplies selected ranges and markers.
- [[Visual Context]] supplies frames, sheets, and snapshots.
- [[Revisions]] supplies proposed versions and accept behavior.
- [[Chats]] supplies full conversation continuity.
- [[Agent Connections]] supplies setup state when a provider is needed.
- [[Local Project Safety]] protects local project files while generated changes are reviewed.

## Test Coverage

- `docs/specs/Comments.html` - Defines the detailed interface behavior spec, status reference, interaction model, and test-plan markers.
- `test/quality/comments-spec-contract.test.ts` - Verifies every Comments.html test-plan marker has matching executable coverage.
- `src/shared/ripple-comments.test.ts` - Covers comment data contracts, anchors, replies, soft delete, restore, and attachment limits.
- `src/main/lib/revisions/comment-revisions.test.ts` - Covers comment-backed revision creation, reply continuation, accept flow, recovery, and stale proposal updates.
- `src/main/lib/revisions/comment-visual-policy.test.ts` - Keeps visual context capture asynchronous and non-blocking for comment creation.
- `src/main/lib/revisions/comment-visuals.test.ts` - Stores and reloads frame and range visual context safely for comment runs.
- `src/renderer/features/comments/comment-pane.test.tsx` - Covers card behavior, filtering, selection, replies, deletes, restore, and preview switching.
- `src/renderer/features/comments/comment-markers.test.tsx` - Covers timeline marker visibility, positioning, and selection behavior.
- `test/e2e/agent-runtime-ui-fixtures.e2e.ts` - Replays sanitized real Claude and Codex sessions through comment cards to check card status, shimmer, revision actions, and raw runtime leakage.
- `test/e2e/agent-runtime-ui-live-fixtures.e2e.ts` - Opt-in replay for live-provider comment-card fixtures before they become canonical coverage.
- `test/e2e/release-qa.e2e.ts` - Exercises the release-level comment and revision workflow in the packaged app surface.
