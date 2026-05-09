# Settings

Settings is where the user changes preferences, provider connections, privacy choices, updates, and advanced setup without interrupting creative work.

Settings should never make local project work feel gated by accounts or services.

[Settings Screenshot: settings window with agent, privacy, update, and advanced sections]

## Settings Areas

Settings can include:

- [[Agent Connections]] for Codex and Claude Code.
- Model/provider preferences.
- [[Analytics and Privacy]] consent.
- Optional Ripple email/update contact preferences.
- [[App Updates]] controls.
- Appearance, keyboard, and workspace preferences.
- Advanced utilities for tools, MCP, skills, provider diagnostics, and project readiness.

The exact tab layout can evolve, but the product contract should stay stable: ordinary settings use plain product language; advanced provider/tool details stay behind explicit advanced surfaces.

## Non-Blocking Behavior

Changing settings should not interrupt [[Preview]], [[Comments]], [[Chats]], or [[Exports]] unless the setting directly affects that feature.

Examples:

| Change | Expected behavior |
| --- | --- |
| Toggle analytics | Applies to future analytics events, app keeps working |
| Toggle automatic updates | Saves preference, no project interruption |
| Connect provider | Future agent actions can use provider |
| Change model | Future sends use new model where applicable |
| Disable provider | Active run should not be silently killed unless required |
| Open MCP/settings utility | Stays inside advanced context |

## Privacy Settings

Analytics must be readable and reversible.

The user should see whether analytics are on or off, what kind of data can be sent, and a link to the public transparency doc. Turning analytics off should stop future product analytics without breaking local work.

See [[Analytics and Privacy]].

## Agent Settings

Agent settings should help the user answer:

- Is Codex ready?
- Is Claude Code ready?
- Which model will my next run use?
- Are required tools/skills available?
- Where do I manage MCP or advanced provider setup?

If a provider needs setup, Settings can show details. The main project workflow should only show a concise setup-needed state.

## Risky Actions

Settings actions that can delete, reset, disconnect, overwrite, or expose data need confirmation.

Examples:

- Moving project files to Trash.
- Removing a provider credential.
- Resetting onboarding.
- Installing project-portable skills over existing files.
- Changing advanced tool/MCP configuration.

## What Good Looks Like

Settings gives the user control without making Ripple feel fragile. The creative workspace keeps running, and the user can adjust trust, provider, update, and advanced behavior when they choose.

## Test Coverage

- `src/renderer/components/dialogs/settings-tabs/agents-capability-settings.test.ts` - Covers skill, slash-command, and MCP management from settings.
- `src/renderer/components/update-banner.test.ts` - Ensures downloaded updates require explicit restart and release links open correctly.
- `src/main/lib/update-release-config.test.ts` - Verifies update settings copy avoids inherited developer-tool language.
- `src/main/lib/analytics.test.ts` - Covers persisted analytics/contact preferences exposed through settings.
