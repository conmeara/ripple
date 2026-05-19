# Revisions

Revisions are proposed versions of the project.

They are the safety layer behind [[Comments]] and some [[Chats]]. A revision lets the user preview generated changes, compare them to Main, accept them, reject them, or keep working before the accepted project changes.

[Revision Screenshot: proposed changes ready with Accept and View Main controls]

## User Model

The user should understand three states:

- Main is the accepted project.
- Proposed changes are temporary and reviewable.
- Accept brings proposed changes into Main.

They should not have to understand commits, patches, branches, merges, or worktrees.

## Lifecycle

| Status | User-facing meaning | Main changes? |
| --- | --- | --- |
| Queued | Ripple will work on this soon | No |
| Working | Agent is generating changes | No |
| Ready | Proposed changes can be previewed | No |
| Accepted | Changes landed in Main | Yes |
| Rejected/deleted | Proposal is no longer active | No |
| Updating | Proposal is being refreshed against new Main | No |
| Needs attention | Ripple could not safely refresh or finish | No |
| Failed | Work did not complete | No |

Status text should be short. Long details belong in [[Chats]] or [[Advanced Utilities]].

## Previewing A Revision

Previewing should switch [[Preview]] to the revision source and preserve the relevant time.

Expected behavior:

- Comment revisions seek to the comment's frame/range.
- Chat revisions preserve current preview context when possible.
- View Main returns to accepted project state.
- The user always knows which source they are viewing.

## Accepting

Accept means this proposed version becomes part of Main.

Rules:

- Accept is disabled until the revision is ready and safe.
- Accept is serialized per project.
- Accept only applies the selected proposal.
- If accept fails, Main remains unchanged.
- After accept, preview and project data refresh.
- Related comments/conversations update to accepted or resolved state.

Underneath, comment revisions can apply through a patch-style strategy while chat proposals can use a broader merge-style strategy. The UI should simply say changes were accepted.

## Rejecting Or Deleting

Rejecting a revision means the user does not want the proposal to land.

The app may clean temporary work after rejection, but failed work should not be destroyed if recovery would be useful. Soft delete/restore belongs to [[Comments]] when the revision is comment-backed.

## When Main Changes

When Main changes, older proposed versions may become stale.

Ripple should mark affected proposals as Updating or Needs attention, disable Accept while unsafe, and try the cheap refresh path first. If replay works, the proposal becomes Ready again. If not, the user can continue in Chat or ask the agent to resolve the conflict.

See [[Comments#When Main Changes]].

## What Good Looks Like

Revisions make agent work feel safe. The user can let multiple ideas run, compare them visually, and decide what lands, while Ripple prevents stale or unsafe work from slipping into Main.

## Test Coverage

- `src/main/lib/revisions/comment-chat-worktree-flows.test.ts` - Covers accepting multiple comments, chat proposal accepts, stale replay, conflicts, and follow-up base safety.
- `src/main/lib/revisions/revision-staleness.test.ts` - Marks only stale proposed revisions for automatic replay.
- `src/main/lib/agent-runtime/workspace-context.test.ts` - Resolves Main versus temporary workspace kinds from chat/workspace metadata.
- `src/main/lib/agent-runtime/workspace-context.integration.test.ts` - Resolves project conversations to Main and drafts to isolated writable roots.
- `src/renderer/features/comments/comment-filters.test.ts` - Keeps stale proposals from normal preview/reply/reject flows until safe.
