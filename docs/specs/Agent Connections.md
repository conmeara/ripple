# Agent Connections

Agent Connections are how the user connects Codex and Claude Code to Ripple.

Agents are core to the product, but setup should not block local project creation, preview, comments, assets, or export. Missing setup should block only the agent action that needs a provider.

[Agent Connection Screenshot: Codex and Claude cards with Ready and Setup needed states]

## Where Connections Appear

Connections can appear in:

- [[Onboarding]] page two.
- [[Settings]] agent/model sections.
- The send flow in [[Chats]] or actionable [[Comments]] when setup is missing.
- Explicit provider setup modals.

Primary setup language should be simple: Codex, Claude Code, Ready, Checking, Setup needed, Connect, Manage connection.

## Provider Cards

Each provider card should show:

- Provider name.
- Runtime detail as secondary text.
- Status badge.
- Connect or Manage connection button.
- Error detail only when useful.

| Status | Meaning |
| --- | --- |
| Checking | Ripple is reading local/provider state |
| Ready | The provider can run agent work |
| Setup needed | The user needs to connect or configure it |
| Error | Status check failed, but local app use continues |

## When Setup Is Missing

If the user sends a chat or creates an actionable comment without a ready provider:

- Keep the user's message/comment.
- Show setup needed in context.
- Offer the provider setup path.
- Do not erase draft content.
- Do not route the whole app back to onboarding.
- Do not block non-agent features.

## Provider Selection

The user can choose Codex or Claude where supported. Model/thinking controls can appear in the chat/comment composer or settings, but they should not dominate the motion workflow.

Switching providers may need a clear confirmation when it changes runtime behavior for an active conversation.

Local/offline provider behavior belongs in [[Offline Mode]]. It should appear as an explicit beta or advanced choice, not as a surprise replacement for the normal Codex/Claude path.

## Approvals And Questions

Agents can ask for permission or clarification while they work. Ripple should present these as clear product decisions, not raw provider protocol events.

| Situation | User-facing behavior |
| --- | --- |
| Project-local safe command | Continue when it matches Ripple's approved local editing policy |
| Network access | Ask before allowing the run to use the network |
| Outside-project file access | Ask before expanding the workspace boundary |
| Provider asks a question | Show the question in the conversation and let the user answer there |
| User cancels | Stop the run, preserve the transcript, and keep project state safe |

Clean app-owned visual-context commands can be allowed when they stay inside the project and match Ripple's expected tooling. Anything broader should be readable and confirmable.

## Setup Modals

Provider setup modals can include provider-specific details such as account auth, API keys, or command setup. That is acceptable because the user explicitly opened setup.

Do not put terminal instructions, OAuth mechanics, or SDK protocol language on the main first-run card.

## What Good Looks Like

The user understands that Ripple can work with their Codex or Claude Code subscription. When setup is ready, agent work starts. When it is not, Ripple shows a clear path without making the whole app feel broken.

## Test Coverage

- `src/main/lib/agent-runtime/connection-registry.test.ts` - Seeds and refreshes default Codex connection rows while preserving manual choices.
- `src/main/lib/agent-runtime/provider-selection.test.ts` - Persists explicit Codex selection and defaults ambiguous/Claude model choices appropriately.
- `src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts` - Normalizes Codex App Server events, approvals, usage, input, and error states.
- `src/main/lib/agent-runtime/providers/claude-agent-sdk-approval.test.ts` - Bridges Claude permission requests, edit approvals, user questions, and MCP elicitation.
- `src/main/lib/agent-runtime/providers/fake-adapter.test.ts` - Keeps the fake provider available for runtime tests.
- `src/renderer/features/agents/lib/provider-auth-prompts.test.ts` - Opens provider setup or queues retries correctly after auth failures.
- `src/renderer/features/agents/lib/models.test.ts` - Keeps primary Claude and Codex model pickers focused on supported choices.
