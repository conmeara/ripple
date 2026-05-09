# Advanced Utilities

Advanced Utilities are secondary panes for users or agents who need deeper inspection.

They are useful, but they are not the primary motion-design experience. The normal path is [[Preview]], [[Timeline]], [[Chats]], [[Comments]], [[Revisions]], and [[Exports]].

[Advanced Utilities Screenshot: Changes utility open beside preview]

## Where They Live

Advanced utilities open in the right pane through the utility menu in [[Shell Layout]].

Utilities can include:

- Details.
- Files.
- Changes.
- Plan.
- Terminal.
- MCP.

Opening one should replace the right-pane content, not create a new permanent column or push the preview into a cramped state.

## Utility Roles

| Utility | Purpose |
| --- | --- |
| Details | Compact project/run/task context |
| Files | Inspect, search, open, rename, and manage project files when needed |
| Changes | Review changed files, diffs, history, and generated-change details behind a proposal |
| Plan | Inspect agent plan/todo context |
| Terminal | Advanced command/process view |
| MCP | Manage or inspect connected tools/servers |

These surfaces may use more technical language than the primary UX, but they should still respect the user's project and local safety.

Files and Changes should still translate technical facts into useful review language. A designer may need to know "three files changed and the lower-third composition was edited"; they should not have to understand every internal command to decide whether to accept work.

## Files

The Files utility is for inspection and recovery, not normal authoring.

Expected behavior:

- Show project files without exposing hidden/generated folders by default.
- Search and recent-file affordances should help users find context quickly.
- Text files can be viewed; binary/media files should show safe metadata or previews where supported.
- Rename and delete/move-to-trash actions need clear confirmation when they can affect project files.
- Pasted text or created files should land inside the project boundary.

## Changes And History

Changes should help the user understand what a proposal or project state contains.

Expected behavior:

- Show a changed-file summary before deep diffs.
- Let the user inspect diffs without accepting the revision.
- Keep generated-change review connected to [[Revisions]] and [[Comments]].
- Show history/remote details only in advanced context.
- Keep staging, commit, and sync language out of the primary review loop.

## Relationship To Product UI

Advanced utilities should help recover, inspect, or debug. They should not be required to complete normal workflows.

Examples:

- A user can accept a comment without opening Changes.
- A user can export without opening Terminal.
- A user can connect a provider from Settings without reading MCP internals.
- A user can understand a comment result without reading raw tool logs.

## Risky Actions

Advanced utilities can expose powerful actions. Anything destructive, externally visible, or outside the project boundary needs confirmation.

Examples include deleting files, changing MCP/server config, running commands, writing outside the project, or revealing credentials.

## What Good Looks Like

Advanced utilities are there when the user or agent needs detail, but they do not leak into the everyday creative loop. They make Ripple inspectable without making it feel like a developer workstation.

## Test Coverage

- `src/renderer/components/dialogs/settings-tabs/agents-capability-settings.test.ts` - Verifies advanced skill, slash-command, and MCP management surfaces.
- `src/renderer/features/agents/lib/agents-actions.test.ts` - Covers opening and closing the Kanban/workspace board from another surface.
- `src/renderer/features/agents/commands/builtin-commands.test.ts` - Keeps command filtering and chat-facing command availability stable.
- `src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts` - Normalizes advanced provider tool, MCP, approval, and usage events for UI inspection.
