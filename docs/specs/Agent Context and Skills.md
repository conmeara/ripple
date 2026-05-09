# Agent Context and Skills

Agent Context is what Ripple gives an agent so it can edit motion work correctly.

The agent should know the active project, active composition, preview source, current frame or range, relevant assets, HyperFrames rules, user instructions, and whether it is working on Main or a proposed version.

[Agent Context Screenshot: advanced context and skills surface showing project notes and HyperFrames skill readiness]

## What Context Should Include

For normal work, the agent should receive:

- Project identity and safe working directory.
- Active [[Compositions|composition]].
- Current [[Preview]] source: Main, comment proposal, or chat proposal.
- Current time, frame, FPS, and selected [[Timeline]] range.
- Relevant [[Assets]].
- Relevant [[Comments]] or [[Chats]] history.
- [[Visual Context]] when useful.
- App-owned HyperFrames editing guidance.
- Project notes such as brand rules, style preferences, and commands.

The user should not need to manually paste this every time.

## App Policy Versus Project Notes

Ripple app policy is non-negotiable product guidance: local-first behavior, HyperFrames-first editing, no silent Main edits, project/revision boundaries, path safety, review semantics, and motion-editor language.

Project notes are user-editable. They can describe brand rules, project preferences, commands, naming conventions, or creative direction.

New projects can get short note files. Existing projects should be checked on open, not silently rewritten.

## Skills

HyperFrames skills should be app-managed by default.

The user should not install prompt bundles or copy skill folders to get normal editing. Ripple can expose app-owned skills to Codex and Claude through provider-native mechanisms.

Project-local skill folders can exist for portability or customization, but writing them should be explicit.

## Readiness And Portable Setup

Settings can expose explicit actions for agent readiness:

| Action | Expected behavior |
| --- | --- |
| Check assistant readiness | Inspect provider, skill, MCP, and project-note state without rewriting the project |
| Add project notes for AI | Create short editable notes only when the user asks |
| Update project notes | Preserve user edits and make changes explainable |
| Make AI setup portable | Copy project-local skills or instructions only as an explicit action |

These actions should be idempotent. Running a check twice should not churn files, and opening an existing project should not silently overwrite notes.

## Custom Agents, Plugins, And Commands

Advanced users can install or select custom agents, plugin-provided capabilities, MCP servers, and slash commands. These should feel like configurable helpers, not requirements for normal Ripple use.

| Surface | User expectation |
| --- | --- |
| Custom agents | Create or choose specialized agents for a project or workflow |
| Plugin skills | Discover read-only capabilities contributed by enabled plugins |
| Plugin MCP servers | Use only approved plugin servers in agent runs |
| Slash commands | Insert repeatable prompt/actions from the chat composer |

Plugin or project-provided capabilities should be labeled by source. Disabling a plugin should remove its capabilities from future runs without corrupting past conversations.

## When The Agent Runs

| Run source | Context behavior |
| --- | --- |
| Project chat | Work from active project and preview context |
| Comment | Include anchor time/range, short user note, and visual capture when available |
| Comment follow-up | Continue from the existing revision/conversation |
| Proposed preview | Tell the agent the user is looking at a proposed version |
| Advanced utility | Include only the context needed for that utility |

## Boundaries

Agent work must stay inside the active project or registered isolated revision context. The renderer should not hand providers arbitrary absolute paths. Main process services should assemble and validate runtime context.

## What Good Looks Like

The agent behaves like it has been watching the same motion piece as the user. It knows the frame, the composition, the rules of the project, and the safe place to edit, without the user turning into a prompt engineer.

## Test Coverage

- `src/main/lib/agent-runtime/agent-run-context-resolver.test.ts` - Separates app policy, project notes, and app-managed skill roots for each provider run.
- `src/main/lib/agent-runtime/runtime-context.test.ts` - Builds provider-only prompt context from validated project state and rejects arbitrary renderer fields.
- `src/main/lib/agent-runtime/runtime-attachments.test.ts` - Writes attachments into hidden run folders, enforces limits, and appends automatic visuals only when safe.
- `src/main/lib/agent-runtime/prompt-mentions.test.ts` - Converts skill/agent/MCP mentions into provider-readable instructions while stripping unsafe markup.
- `src/main/lib/agent-runtime/cli-tools-env.test.ts` - Injects Ripple, HyperFrames, provider, and visual-context tool environment for agent runs.
- `src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts` - Appends Ripple policy and loads managed Claude visual-context skill/plugin capabilities.
- `src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts` - Checks provider-native skills/list inputs, preview-capture defaults, model/thinking selection, and environment filtering.
- `src/main/lib/ripple-projects/agent-instructions.test.ts` - Creates short user-editable Codex/Claude project notes without overwriting user changes.
- `src/main/lib/ripple-projects/hyperframes-skills.test.ts` - Reports app-managed HyperFrames skills and copies portable project skills only on explicit action.
- `src/renderer/components/dialogs/settings-tabs/agents-capability-settings.test.ts` - Lets users manage skills, slash commands, and MCP servers from settings.
