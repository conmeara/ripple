# Automations and Inbox

Automations and Inbox are beta surfaces for remote-triggered agent work.

They are not part of the primary motion-review loop, but they exist in the app and need a clear product contract so they do not blur local Ripple project work with cloud/sandbox work.

[Automations Screenshot: automations page with templates, enabled automation, and inbox unread count]

## Automations

Automations let a user configure repeatable workflows triggered by services like GitHub or Linear.

Expected behavior:

| Surface | User sees |
| --- | --- |
| Automations list | Existing automations, status, trigger source, and recent activity |
| Templates | Starting points for common trigger/workflow patterns |
| Detail view | Trigger, configuration, past runs, and enable/disable controls |
| Gating | Clear paid-plan or beta availability messaging |

Automation language can mention GitHub, Linear, remote sandboxes, and runs because the user is inside a beta/advanced surface.

## Inbox

Inbox collects remote/sandbox chats produced by automations.

Expected behavior:

- Show unread and read items with useful repo/automation context.
- Let the user filter unread/read state.
- Selecting an item opens the related remote chat.
- Mark read and mark all read update counts immediately.
- Inbox should not be confused with local project [[Comments]].

Inbox items may look conversational, but they are not the same as local project chats unless explicitly forked or opened into the local workflow.

## Relationship To Ripple Projects

Automations should not silently edit a local Ripple project. If remote work needs to become local work, the handoff should be explicit and understandable.

Core local work remains governed by [[Project Management]], [[Chats]], [[Comments]], [[Revisions]], and [[Local Project Safety]].

## What Good Looks Like

Automations feel like an optional beta command center. Users who never enable them still get the full Ripple motion tool. Users who do enable them can distinguish remote-triggered work from local project review.

## Test Coverage

- `src/renderer/features/agents/lib/agents-actions.test.ts` - Covers opening and closing workspace/automation-style surfaces from agent actions.
- `src/renderer/features/automations/automations-view.tsx` - Implements list, templates, gating, and navigation. Focused automated coverage should be added for beta enablement and empty/loading states.
- `src/renderer/features/automations/automations-detail-view.tsx` - Implements detail, trigger, run history, and configuration presentation. Focused automated coverage should be added for edit/enable flows.
- `src/renderer/features/automations/inbox-view.tsx` - Implements unread/read filtering, remote chat selection, and read-state mutations. Focused automated coverage should be added for inbox counts and selection.
