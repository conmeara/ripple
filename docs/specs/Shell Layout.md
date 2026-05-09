# Shell Layout

The Ripple shell should feel like a motion-review workspace with the preview and timeline at the center.

The layout is not a code editor with a preview attached. It is a center-stage motion surface with project context on the left and review/agent context on the right.

[Shell Screenshot: default workspace with project pane, preview, timeline, and Chat/Comments pane]

## Main Regions

| Region | Purpose | Primary specs |
| --- | --- | --- |
| Far-left app rail | Projects, search, settings, global navigation | [[Project Management]], [[Settings]] |
| Left project pane | Compositions and assets | [[Compositions]], [[Assets]] |
| Center stage | Preview and timeline | [[Preview]], [[Timeline]] |
| Right review pane | Chat, comments, renders, utilities | [[Chats]], [[Comments]], [[Exports]], [[Advanced Utilities]] |

The preview should get the most visual weight. Panels are context, not the point.

## Panel Behavior

Panels are connected parts of the workspace, not drawers floating over the app.

- Assets/compositions can hide so the center stage expands.
- Review pane can hide so the center stage expands to the right.
- Center preview can hide only when the user intentionally wants another surface.
- Hidden panels return through top-right controls and keyboard shortcuts.
- Panel state should be reversible from visible controls, even when the far-left rail is hidden.

## Right Pane

The right pane has a compact Chat / Comments switcher. A utility menu opens additional right-pane pages: Renders, Details, Files, Changes, Plan, Terminal, and MCP.

Opening a utility should not create another permanent column. It should replace the right-pane content while preserving the project and preview context.

See [[Advanced Utilities]] and [[Exports]].

## Top Controls

Top-right controls represent major panels and utility pages. They should be icon-forward, compact, and tooltip-backed.

Controls should not read as colorful product badges or detached pills. They should blend with the pane background and make the layout easy to recover.

## State Continuity

Changing panels should not reset the user's creative state.

- Hiding or showing panes should not reset preview time.
- Switching Chat/Comments should preserve selected comment context where possible.
- Opening Renders should respect the current preview source.
- Opening Files/Changes should not lose the active project/composition.
- Starting a new chat should not remount the entire shell or reset preview to `00:00`.

## What Good Looks Like

The user can rearrange the workspace without getting lost. The center stays about the motion piece, the side panes stay about context and review, and every hidden panel has an obvious way back.

## Test Coverage

- `src/renderer/features/ripple-shell/ripple-shell-layout.test.ts` - Verifies panel visibility, right-pane modes, utility transitions, and keyboard recovery.
- `src/renderer/features/ripple-shell/ripple-shell-routing.test.ts` - Keeps the Ripple shell scoped to local motion projects and stable across chat selection changes.
- `src/renderer/features/agents/utils/project-pane-layout.test.ts` - Keeps the project pane, chat controls, and rail recovery behavior correct across local and non-Ripple workspaces.
- `src/renderer/components/ui/resizable-sidebar.test.ts` - Clamps resizable panel widths within configured bounds.
