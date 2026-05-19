# Active Conversations

Active Conversations are the small chips or tabs that keep the user's current chat threads within reach.

They are an attention tool, not a project ownership model. Closing one chip should not archive, delete, accept, reject, or resolve anything.

[Active Conversations Screenshot: chat chips with a normal chat and a comment conversation]

## Why They Exist

Ripple users may have several pieces of agent work happening at once:

- A general project chat.
- A comment thread open in Chat.
- A follow-up on a proposed change.
- A question about assets or timing.

The active strip lets the user move between these without losing the right-pane context.

## Chip Behavior

| Action | Expected behavior |
| --- | --- |
| Click chip | Open that conversation in [[Chats]] |
| Close chip | Remove from active strip only |
| Open comment in Chat | Add that comment conversation to active set |
| Start new chat | Add or focus the new project conversation |
| Switch project | Load that project's active conversation set |

Closing a chip is like clearing a tab from the desk. The conversation remains in history.

## Relationship To Comments

When a [[Comments|comment]] opens in Chat, its chip should still feel attached to the comment thread.

The user should be able to go from comment card to full chat, then back to comments, without wondering whether they created a new generic conversation.

## Activity Badges

Active conversations and [[Compositions]] can show activity badges.

| Activity | Badge meaning |
| --- | --- |
| Agent running | Work is happening |
| New proposed changes | Review is ready |
| Failed/needs update | Attention needed |
| User acknowledged | Badge can clear |

Badges are notifications. Acknowledging a badge should not stop the agent or change the revision. If work is still running after acknowledgement, a quieter live indicator can remain.

## Persistence

Active conversation chips should persist per project enough to help continuity. They should prune conversations that no longer exist and avoid cross-project leakage.

## What Good Looks Like

The user can keep several creative threads open without turning the right pane into a messy inbox. The chips help attention and navigation, but they never carry hidden destructive meaning.

## Test Coverage

- `src/renderer/features/ripple-shell/active-conversations.test.ts` - Adds, closes, prunes, reveals, and displays active conversation chips without destructive side effects.
- `src/renderer/features/ripple-shell/activity-acknowledgements.test.ts` - Acknowledges only the current activity signature.
- `src/shared/ripple-activity.test.ts` - Maps revision statuses to badge states and summarizes comment activity by composition.
- `src/renderer/features/hyperframes/composition-activity-badges.test.ts` - Prioritizes needs-attention badges and hides acknowledged working states.
