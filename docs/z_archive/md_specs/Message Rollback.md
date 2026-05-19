# Message Rollback

Message Rollback lets a user return a conversation and its files to an earlier safe point.

It is a beta recovery feature for agent work. The normal review path is still [[Revisions]]: preview proposed changes, compare with Main, accept, reject, or keep chatting.

[Rollback Screenshot: chat message menu with rollback action and confirmation]

## User Model

Rollback means "take this conversation back to here."

The user should not need to understand checkpoints, stashes, or provider session UUIDs. They should understand:

- Later messages will be removed from the visible thread.
- Files in that proposal workspace will be restored to match the selected point.
- The next send can continue from that point when supported.
- Main stays safe unless the user had already accepted changes.

## When It Appears

Rollback should appear only when the app has enough information to do it safely.

| State | Expected behavior |
| --- | --- |
| Beta disabled | No rollback action in normal chat UI |
| Checkpoint available | Show rollback action with confirmation |
| Checkpoint missing | Hide or disable rollback with a short reason |
| Restore failed | Keep current state and show failure |
| Rollback succeeded | Truncate the thread and mark the target message resumable |

## Safety

Rollback must restore files before truncating visible history. If file restore fails, the conversation should not pretend it rolled back.

Comment-backed revisions should stay connected to their review state. Rolling back a comment conversation should not silently accept, reject, or delete the comment.

## What Good Looks Like

Rollback gives advanced users a clean escape hatch when an agent takes a bad direction. It feels like undoing a proposal thread, not rewriting the accepted project behind the user's back.

## Test Coverage

- `src/main/lib/trpc/routers/chats.ts` - Implements rollback-to-message by restoring a checkpoint before truncating conversation messages. Focused automated coverage should be added for success, missing checkpoint, failed restore, and resumable-message metadata.
- `src/main/lib/git/stash.ts` - Creates and applies rollback checkpoints for proposal workspaces.
- `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx` - Gates Rollback behind the beta settings toggle.
