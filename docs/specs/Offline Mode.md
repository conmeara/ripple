# Offline Mode

Offline Mode is an advanced beta path for using local Ollama models when normal provider/network access is unavailable.

The core Ripple promise is still local-first: users can create projects, preview, comment, revise, and export without internet-dependent project plumbing. Offline Mode is specifically about agent/provider fallback.

[Offline Mode Screenshot: beta settings with Offline Mode enabled and Ollama model status]

## User Model

The user should understand three things:

- Normal Ripple project work stays local.
- Codex/Claude agent work may need a provider connection.
- Offline Mode can use a local Ollama model for supported agent-adjacent work when enabled.

It should never silently masquerade as the full online provider experience.

## Settings

Offline Mode belongs in beta or advanced settings.

Expected controls:

| Control | Behavior |
| --- | --- |
| Offline Mode | Shows local-model UI and Ollama status |
| Auto Offline | Allows fallback when network is unavailable |
| Model selector | Lets the user choose an installed/recommended Ollama model |
| Copy install command | Helps install the recommended local model |

Ripple should detect internet and Ollama availability periodically only while the feature is enabled.

## Composer And Runs

When offline UI is enabled and a suitable model is available:

- The model selector can show local Ollama choices.
- The selected local model should be obvious before send.
- Chat title/commit-message helpers can use local generation where supported.
- If no network and no suitable model exists, preserve the message and show a recoverable setup state.

Offline Mode should not weaken [[Local Project Safety]]. Local models still receive only validated project/run context.

## What Good Looks Like

The user can keep working locally and understand exactly when Ripple is using a local model. Missing network or missing Ollama becomes a clear setup problem, not a mysterious failed chat.

## Test Coverage

- `src/main/lib/trpc/routers/ollama.ts` - Provides Ollama status, model discovery, and local helper generation. Focused automated coverage should be added for model availability and failure states.
- `src/main/lib/claude/offline-handler.ts` - Decides when to use Ollama fallback based on settings and connectivity.
- `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx` - Exposes Offline Mode, Auto Offline, model status, and recommended install copy.
- `test/e2e/release-qa.e2e.ts` - Covers offline packaged create/preview/comment/export posture for the core local workflow.
