# Phase 11: Codex And Claude Integrations

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple users can ask the agent to edit a motion project from
normal Chat or from a frame-anchored comment, choose Codex or Claude, and see
the run stream, pause, fail, recover, or complete without needing to understand
repos, worktrees, CLIs, terminals, or provider internals.

The visible behavior is provider choice inside a motion-design workflow. A user
creates or opens a Ripple project, asks for a lower third, comment revision, or
follow-up change, and Ripple starts the chosen provider inside the active
project or isolated generated-change workspace. The Chat and Comments panes
show one persisted transcript and one persisted run status. Closing a pane,
switching filters, or restarting the app cannot duplicate or orphan work.

The architectural center of the phase is a main-process `AgentRuntimeService`.
Renderer components become viewers and controllers. Main owns provider
connection setup checks, working-directory validation, launch, stream
persistence, cancellation, approval handling, queue claiming, restart recovery,
and terminal run state.

This phase chooses the long-term provider paths now:

- Codex uses Codex App Server as the first-class integration path. App Server
  is the richer Codex client protocol for app UIs, threads, turns, streaming
  events, approvals, auth/account state, skills/apps/connectors, and session
  persistence.
- Claude uses the Claude Agent SDK as the first-class integration path. The SDK
  exposes the Claude Code agent loop, tools, permissions, sessions, hooks,
  subagents, MCP, skills, and plugins through TypeScript.

Ripple standardizes above those provider protocols, not below them. The shared
contract is an agent execution domain: workspace contexts, agent threads, agent
runs, run events, approvals, transcript projections, provider-native ids,
status, cancellation, errors, generated-change completion, and named provider
connections. Existing `chats`, `sub_chats`, and Phase 8 `revisions` can be
bridged during migration, but they should not remain the canonical execution
log if they fight Codex App Server threads/turns or Claude Agent SDK
sessions/messages.

## Progress

- [x] 2026-04-28 / User + Codex: Researched Phase 11 provider direction with
  online sources and subagents. Settled on Codex App Server and Claude Agent
  SDK as the long-term paths for Ripple.
- [x] 2026-04-28 / User + Codex: Confirmed the repo currently carries
  `@anthropic-ai/claude-agent-sdk`, `@zed-industries/codex-acp`,
  `@mcpc-tech/acp-ai-provider`, bundled Claude Code download scripts, and
  bundled Codex CLI download scripts.
- [x] 2026-04-28 / User + Codex: Tested the bundled Claude Agent SDK CLI login
  flow against the user's Deloitte account. `auth status --json` reported
  `authMethod: "claude.ai"`, `apiProvider: "firstParty"`, org `Deloitte`, and
  `subscriptionType: "enterprise"`.
- [x] 2026-04-28 / Codex: Ran a tiny no-tools Claude Agent SDK probe after
  Enterprise login. It reached Claude through the first-party Enterprise login
  and returned a provider-side budget stop with nonzero model usage, proving
  the SDK path can use the logged-in Enterprise Claude Code auth on this
  machine.
- [x] 2026-04-28 / Codex: Created this Phase 11 ExecPlan from `PLANS.md`,
  `ROADMAP.md`, current provider code, online provider docs, and the local
  Enterprise-login probe.
- [x] 2026-04-28 / Codex: Checked the Phase 11 plan against the actual Phase 8
  comments/revisions implementation. Phase 8 is paused at the intended
  integration boundary: main owns revision queue decisions, recovery, stale
  update processing, acceptance, and cleanup, while the shell-level
  `RippleRevisionQueueWorker` still hosts the provider stream through the
  renderer chat transports.
- [x] 2026-04-28 / User + Oracle + Codex: Incorporated external plan review.
  The key amendment is to preserve Phase 8's product semantics and safety
  guarantees, but allow Phase 11 to replace Phase 8's hidden chat/sub-chat
  execution architecture with provider-native agent threads, agent runs,
  events, approvals, workspace contexts, and transcript projection.
- [x] 2026-04-28 / User + Codex: Incorporated follow-up research on Claudian,
  OpenClaw, Harness CLI, leashd, Happy, GitHub/VS Code, and Craft. Tightened
  Phase 11 around `AgentRuntimeService`, named provider connections,
  connection-locked agent threads, a backend factory, and explicit provider
  auth for agent-backed editing.
- [x] 2026-04-28 / Codex: Implemented Milestone 0 compatibility checks for the
  pinned bundled binaries. `codex app-server --help`, `codex app-server
  generate-ts`, `codex login status`, `claude --version`, and Claude SDK auth
  status all ran from this worktree.
- [x] 2026-04-28 / Codex: Implemented Milestone 1 canonical execution model
  with `agent_connections`, `workspaces`, `agent_threads`, `agent_runs`,
  `agent_run_events`, `agent_approvals`, and `transcript_messages`, plus a
  fake adapter and transcript projection.
- [x] 2026-04-28 / Codex: Implemented Milestone 2 workspace/context resolution,
  explicit provider persistence on generated changes, request-id idempotency,
  active-run guardrails, and startup recovery for interrupted agent runs.
- [x] 2026-04-28 / Codex: Implemented Milestone 3 generated-change scheduler
  bridge from the Phase 8 revision queue into main-owned agent runs.
- [x] 2026-04-28 / Codex: Implemented Milestone 4 Codex App Server adapter with
  account checks, thread/turn startup, normalized events, approval requests,
  bounded workspace-write sandbox policy, cancellation, and provider id
  persistence.
- [x] 2026-04-28 / Codex: Implemented Milestone 5 Claude Agent SDK adapter with
  bundled CLI auth status, SDK `query()` execution from main, session id
  persistence, event normalization, cancellation, and missing-auth failures in
  Ripple terms.
- [x] 2026-04-28 / Codex: Implemented Milestone 6 normal local Chat migration
  through `AgentRuntimeChatTransport` and the `agentRuntime.chat`
  subscription. Local Chat now observes persisted agent-run events instead of
  launching Claude IPC or Codex ACP transports from the renderer.
- [x] 2026-04-28 / Codex: Implemented Milestone 7 generated-change migration.
  `RippleRevisionQueueWorker` is now a queue nudge/observer; main owns claiming,
  launching, completing, and failing provider-backed generated changes.
- [x] 2026-04-28 / Codex: Implemented the Milestone 8 backend setup/recovery
  foundation through provider auth-status APIs, named default connections, and
  persisted missing-auth failures. Visual settings copy and modal polish remain
  a later UX hardening pass.
- [x] 2026-04-28 / Codex: Completed Milestone 9 automated validation gates for
  this pass: focused agent-runtime tests, `bun run test:ripple`,
  `bun run build`, and `git diff --check`. Manual Electron provider smoke is
  still recommended before calling the feature release-ready.
- [x] 2026-04-29 / Codex: Completed provider setup UI cleanup for this pass.
  Settings now reads `agentRuntime.authStatus` for both Codex and Claude, the
  Claude setup modal no longer routes users through the inherited hosted broker,
  Codex setup invalidates runtime auth status after login, and
  `agentRuntime.setupCommand` provides local provider setup commands.
- [x] 2026-04-29 / Codex: Cleared the Phase 11 validation blocker in
  `bun run ts:check`. The fixes cover runtime/tool-event chunk types, nullable
  Electron and renderer props, optional hosted-backend shims, plugin
  agent/skill source types, and declaration-portability annotations.
- [x] 2026-04-29 / Codex: Hardened the Codex App Server adapter after live
  smoke exposed real App Server edge cases. The adapter now splits UI model
  choices like `gpt-5.3-codex/high` into provider model and reasoning effort,
  rejects failed provider turns instead of completing with a synthetic fallback
  message, and recreates stale provider threads when App Server reports
  `thread not found`.
- [x] 2026-04-29 / Codex: Hardened transcript projection so provider-native
  final assistant messages remain canonical. `AgentRuntimeService` now avoids
  adding a duplicate synthetic final assistant message when the provider has
  already emitted an `assistant_message`.
- [x] 2026-04-29 / Codex: Completed live normal Chat smoke for both providers
  in the existing desktop Chat UI on project `test2`. Codex replied `OK3` via
  `AgentRuntimeChatTransport` from `/Users/comeara/Ripple/test2` and recovered
  a stale App Server provider thread. Claude replied `CLAUDE-AUTH-CHECK` via
  the same Chat UI and persisted a Claude Agent SDK session id.
- [x] 2026-04-29 / Codex: Completed live comment-generated-change smoke for
  Codex. A frame comment created a `codex` generated-change run, a proposed
  revision at `/Users/comeara/.ripple/worktrees/test2/judicial-dune`, one
  focused `index.html` diff, and no change in Main.
- [x] 2026-04-29 / Codex: Completed live comment-generated-change smoke for
  Claude. A frame comment created a `claude` generated-change run, a proposed
  revision at `/Users/comeara/.ripple/worktrees/test2/flexible-copse`, one
  focused `index.html` diff, a persisted Claude session id, and no change in
  Main.
- [x] 2026-04-29 / Codex: Completed accept/stale-update smoke across the
  Phase 11 runtime and Phase 8 review loop. Accepting the Claude proposal
  committed Main, kept `/Users/comeara/Ripple/test2` clean, and caused the
  older Codex proposal to run a provider-backed update from the same isolated
  worktree. The Codex proposal returned to `proposed` with a clean
  fast-forward update and an updated diff from `Phase 11 Claude Comment Smoke`
  to `Phase 11 Comment Smoke`.
- [x] 2026-04-29 / Codex: Final post-smoke validation re-run passed:
  focused agent-runtime tests, `bun run test:ripple`, `bun run ts:check`,
  `bun run build`, and `git diff --check`.
- [x] 2026-04-29 / Codex: Implemented the streaming UI hardening pass for both
  providers. `AgentRuntimeChatTransport` now uses a shared AI SDK UI-message
  projector for normal Chat and comment/revision transcripts; run events project
  text, reasoning, streamed tool input, preliminary tool output, final tool
  output, provider status data, approvals, file changes, and usage metadata.
- [x] 2026-04-29 / Codex: Expanded provider-native event normalization. Codex
  App Server now maps session configuration, token usage, compaction, command
  terminal input, dynamic tool calls, request-user-input requests, and config
  warnings into agent-run events. Claude Agent SDK now maps session init,
  streamed thinking, streamed tool JSON input, tool results, Tasks, compaction,
  hooks, files-persisted events, auth status, and usage into the same runtime
  event contract.
- [x] 2026-04-29 / Codex: Persisted rich assistant projections from
  agent-run events back into `sub_chats.messages`, so reopened normal Chat and
  comment-generated-change threads retain reasoning, tool, file-change, data,
  and usage parts instead of only a final assistant sentence.
- [x] 2026-04-29 / Codex: Completed live Claude streaming UI smoke after the
  shared AI SDK projector change. In the existing desktop Chat UI on project
  `test2`, run `mojhowq847xz8b1z` streamed Claude Agent SDK session init,
  `Glob`/`Read` tool steps, usage metadata, final text deltas, and persisted
  rich assistant parts while replying `CLAUDE-STREAM-UI`.
- [x] 2026-04-29 / Codex: Completed live Codex streaming UI smoke after the
  shared AI SDK projector change. In the same desktop Chat UI, run
  `mojitj6h6m8olebk` streamed Codex App Server provider-thread recovery,
  assistant text deltas, usage metadata, a parsed `Bash` read command, final
  text deltas, and persisted `data-agent-runtime`, `tool-Bash`, and text parts
  while replying `CODEX-STREAM-UI`.
- [x] 2026-04-29 / Codex: Streaming hardening final validation re-run passed:
  `bun test src/main/lib/agent-runtime` (15 tests), `bun run test:ripple`
  (182 tests), `bun run ts:check`, `bun run build`, and `git diff --check`.
- [x] 2026-04-29 / Codex: Completed the provider capability hardening pass for
  skills, MCP servers, plugins, AGENTS.md/system instructions, and rich
  capability/session metadata. Claude Agent SDK runs now load approved MCP
  servers, enabled local plugins, project/user skill sources, AGENTS.md prompt
  append, and mentioned agents. Codex App Server runs now clean prompt mentions,
  resolve safe MCP names/status/tools from the bundled Codex CLI, seed session
  MCP UI metadata, and preserve session-info fields only when provider events
  omit them.
- [x] 2026-04-29 / Codex: Capability hardening validation passed:
  `bun test src/main/lib/agent-runtime` (17 tests), `bun run test:ripple`
  (184 tests), `bun run ts:check`, `bun run build`, `git diff --check`,
  `resources/bin/darwin-arm64/codex mcp list --json`, and
  the then-bundled Claude Code CLI version check.
- [x] 2026-04-29 / Codex: Completed the settings and onboarding hardening pass.
  The implementation moves Claude onboarding to local
  `agentRuntime.authStatus` / `agentRuntime.setupCommand`, keeps provider setup
  skippable so app entry remains local-first, labels MCP settings by the Phase
  11 runtimes, adds skills/commands refresh affordance, and passes app-managed
  Codex API keys through `AgentRuntimeChatTransport` into Codex App Server runs.
- [x] 2026-04-29 / Codex: Settings/onboarding hardening validation passed:
  `bun test src/main/lib/agent-runtime` (18 tests), `bun run ts:check`,
  `bun run test:ripple` (185 tests), `bun run build`, and `git diff --check`.
- [x] 2026-04-29 / Codex: Completed Computer Use UI QA for the settings
  hardening pass in the running Electron app. Verified the Models page shows
  runtime-backed Claude Agent SDK and Codex App Server connection states, the
  expanded API-key section stays readable, Skills exposes a working refresh
  affordance, and the MCP add-server provider picker offers Claude Agent SDK and
  Codex App Server without layout issues.
- [x] 2026-04-29 / Codex: Refreshed provider versions and model catalogs.
  Live metadata showed latest `@anthropic-ai/claude-agent-sdk` is `0.2.123`,
  latest Claude Code binary is `2.1.123`, and latest stable `@openai/codex` is
  `0.125.0`. Updated package pins, download scripts, local bundled binaries,
  and the lockfile. Claude model UI now uses Claude Code aliases (`opus`,
  `sonnet`, `haiku`, `opusplan`, `sonnet[1m]`, `default`) so provider mappings
  stay current. Codex model UI now separates ChatGPT/App Server models from
  app-managed API-key models and exposes the current official Codex API family:
  `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.1-codex-max`,
  `gpt-5.1-codex`, `gpt-5.1-codex-mini`, and `gpt-5-codex`.

## Surprises & Discoveries

- Observation: Codex App Server is the best long-term Codex UI path, not ACP.
  Evidence: OpenAI's current App Server docs and engineering post describe App
  Server as the first-class integration method moving forward. It exposes
  thread and turn primitives, a UI-ready bidirectional JSON-RPC stream,
  approvals, account/auth state, configuration, and app/skill/connector
  surfaces. The TypeScript Codex SDK is useful but has a smaller surface.

- Observation: Claude Agent SDK is the best long-term Claude path, but public
  auth language needs care.
  Evidence: Anthropic documents the Agent SDK as Claude Code as a library,
  including tools, permissions, sessions, MCP, skills, plugins, hooks, and
  subagents. The same docs say third-party products should use API key or cloud
  authentication unless approved for Claude.ai login/rate-limit use.

- Observation: Enterprise Claude Code login works with the bundled Claude Code
  runtime on
  this machine after login.
  Evidence: Running the bundled Claude auth status command after user login
  returned `loggedIn: true`, `authMethod: "claude.ai"`,
  `apiProvider: "firstParty"`, org `Deloitte`, and
  `subscriptionType: "enterprise"`.

- Observation: The Claude Agent SDK budget cap is not a perfect hard ceiling
  for startup cost.
  Evidence: A no-tools probe with `--max-budget-usd 0.01` stopped with
  `error_max_budget_usd`, but the reported `total_cost_usd` was about
  `0.056482` because SDK/Claude Code initialization used cached/system context
  before the stop. Ripple should display usage/cost estimates carefully and not
  promise penny-precise caps from the SDK option alone.

- Observation: The checkout does not have to rely on a global `claude` command
  on `PATH`; Ripple can use the bundled Claude Code binary.
  Evidence: `resources/bin/darwin-arm64/claude --version` reported
  `2.1.123 (Claude Code)` after the version refresh.

- Observation: The inherited Claude subscription onboarding path is a 1Code
  hosted OAuth broker, not the desired Ripple path.
  Evidence: `src/main/lib/trpc/routers/claude-code.ts` starts auth by requiring
  a hosted desktop token and calling hosted `/api/auth/claude-code/start`.
  `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` drives that
  hosted flow. This conflicts with Ripple's local-first direction and is likely
  why Claude setup currently feels broken.

- Observation: The inherited Codex live chat path is ACP-backed.
  Evidence: `src/main/lib/trpc/routers/codex.ts` resolves
  `@zed-industries/codex-acp` and uses the ACP provider path for chat streams,
  while also using the bundled Codex CLI for login, status, MCP config, and
  related operations.

- Observation: The local Codex profile in this worktree has no configured MCP
  servers to live-invoke.
  Evidence: `resources/bin/darwin-arm64/codex mcp list --json` returned `[]`
  during the capability hardening pass. The new App Server runtime path reuses
  the existing bundled Codex MCP snapshot resolver and has focused coverage for
  MCP event/session projection, but live Codex MCP tool execution still needs a
  configured server.

- Observation: Phase 8 intentionally left a temporary renderer/shell worker in
  place for generated-change runs.
  Evidence: `src/renderer/features/ripple-shell/RippleShell.tsx` mounts
  `RippleRevisionQueueWorker`. The roadmap already says Phase 11 should
  replace this temporary shell-level worker with a durable main-process
  Claude/Codex runner.

- Observation: The Phase 8 handoff shape is compatible with the agent runtime
  service.
  Evidence: `src/main/lib/revisions/revision-queue.ts` exposes
  `RevisionQueueRun` with `revisionId`, `threadId`, `chatId`, `subChatId`,
  `projectId`, `projectPath`, `worktreePath`, `mode`, `messages`, and
  `streamId`. Those fields are the seed for `createAgentRun(...)` when Phase
  11 starts queued generated-change work in main.

- Observation: Phase 8's durable domain state should survive Phase 11 rather
  than be folded into provider-specific state.
  Evidence: Phase 8 uses revision statuses such as `queued`, `preparing`,
  `running`, `updating`, `proposed`, `accepted`, `rejected`, `superseded`, and
  `failed`; guarded accept flows in
  `src/main/lib/revisions/isolated-workspace-acceptance.ts`; and stale update
  handling in `src/main/lib/revisions/comment-revisions.ts`. Agent runs
  should drive those states, not replace the comment/generated-change domain.

- Observation: The remaining Phase 8 risk is provider execution ownership, not
  comment UX or acceptance ownership.
  Evidence: `src/main/lib/revisions/revision-queue.ts` already claims queued
  work, processes `updating` work before the next claim, requeues interrupted
  `preparing` / `running` rows on startup, exposes diagnostics, and cleans
  terminal worktrees. `RippleRevisionQueueWorker` then claims one job and
  drives the existing renderer `agentChatStore` / chat transport path. Phase 11
  should move that final launch/stream/finalize responsibility into main.

- Observation: Phase 8 is a product and safety prototype, not the final agent
  execution architecture.
  Evidence: Oracle review agreed that Phase 8's comments, generated changes,
  isolated workspace guarantee, explicit accept/delete, stale-update flow, and
  renderer-execution warning should survive. It also flagged the inherited
  hidden chat/sub-chat execution shape, `sub_chats.messages` transcript source,
  provider inference from model/message metadata, and `RevisionQueueRun` path
  fields as 1Code-shaped internals that Phase 11 may replace.

- Observation: Provider-native execution needs its own durable state.
  Evidence: Codex App Server exposes provider-native threads, turns, items,
  approvals, and event notifications. Claude Agent SDK exposes sessions,
  messages, tool events, permission decisions, and SDK run state. Forcing those
  directly into `sub_chats.messages` first would lose recovery, approval,
  provider item id, usage, and replay information. `sub_chats.messages` should
  become a compatibility transcript projection during migration, not the
  canonical execution log.

- Observation: Explicit provider selection is required before reliable
  agent-run migration.
  Evidence: Phase 8 currently recovers provider choice from hidden message or
  model metadata in the renderer worker path. Phase 11 needs provider to be a
  durable field on generated-change/chat intent and agent-run records so model
  names do not decide whether Codex or Claude launches.

- Observation: The strongest industry precedent is named connection resolution
  plus a provider-neutral runtime control plane above provider-native adapters.
  Evidence: The new research examples, including Claudian, OpenClaw Code Agent,
  Harness CLI, leashd, Happy, GitHub/VS Code, and Craft, converge on persisted
  sessions/runs/events/approvals with Claude and Codex using their own native
  substrates underneath. They also reinforce that UI surfaces should observe
  persisted runs instead of owning provider execution.

- Observation: Ripple's local-first requirement should not be read as "users
  cannot log in."
  Evidence: Codex App Server and Claude Agent SDK both require provider account
  or credential setup for real agent-backed editing. The correct product rule
  is that provider auth must not block app entry, project creation/opening,
  preview, comments and review, asset import, or export. First agent action and
  settings may prompt for Codex or Claude connection setup.

## Decision Log

- Decision: Use Codex App Server as the primary Codex integration for Ripple.
  Rationale: Ripple needs a rich app UI with persisted threads, turns, event
  streams, approvals, auth/account state, restart recovery, and connector/skill
  surfaces. App Server is designed for that. ACP remains useful as an
  interoperability reference or temporary fallback, but it is not the target
  Codex architecture.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Use Claude Agent SDK as the primary Claude integration for Ripple.
  Rationale: The SDK is the official Claude Code agent loop as a library and
  gives Ripple access to Claude tools, permissions, sessions, MCP, skills,
  plugins, hooks, and subagents without scraping a terminal UI.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Do not force both providers through the same low-level protocol.
  Rationale: Codex App Server and Claude Agent SDK are each the strongest
  native path for their platform. Ripple should normalize at its own
  agent-runtime boundary, where product needs are stable, instead of reducing both
  providers to a common-denominator protocol.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Support local Claude Code Team/Enterprise login as an advanced
  local/enterprise auth mode, but keep public-safe Claude defaults as API key,
  supported cloud provider, or enterprise gateway.
  Rationale: The local probe confirmed Enterprise login works technically with
  the bundled SDK. Anthropic's current docs still distinguish ordinary/native
  Claude Code subscription use from third-party products offering Claude.ai
  login or subscription rate limits. Ripple should avoid broad public promises
  around Claude subscription billing unless Anthropic approves that use case.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Main process owns provider execution.
  Rationale: Agent runs perform privileged filesystem, process, terminal,
  network, and credential-sensitive work. Renderer state should not be the
  source of truth for launch, queue ownership, cancellation, acceptance,
  recovery, or whether a hidden generated-change thread starts.
  Date/Author: 2026-04-28 / Codex

- Decision: Chat and comment-generated changes share one agent-runtime run
  contract.
  Rationale: A generated change is just an agent run with project/comment
  context and an isolated workspace. Separate execution models caused duplicate
  starts, hidden renderer coupling, and handoff ambiguity in Phase 8. One run
  contract lets Chat and Comments observe the same transcript and status.
  Date/Author: 2026-04-28 / Codex

- Decision: Treat Phase 8 as paused at the agent-runtime boundary until Phase 11
  lands.
  Rationale: Phase 8 has enough of the comment/revision domain, queue,
  recovery, stale-update, and acceptance model in place to reveal the real
  integration problem: provider execution still depends on a mounted renderer
  worker and stale Claude/Codex transports. Finishing/polishing Phase 8 before
  replacing that layer would harden the wrong ownership boundary.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Phase 11 must consume Phase 8 revision queue and acceptance
  services instead of recreating them.
  Rationale: The queue, isolated workspace, accept/delete/update semantics, and
  product language are the valuable Phase 8 work. Agent runs should become
  the execution engine underneath those services, leaving Comments as the
  review surface and acceptance as a separate explicit product action.
  Date/Author: 2026-04-28 / Codex

- Decision: Preserve Phase 8 product semantics, but allow Phase 11 to replace
  Phase 8 execution internals.
  Rationale: The durable promise is comments, generated changes, isolated
  workspaces, explicit accept/delete, stale-update safety, and fail-closed
  isolation. Hidden chats, sub-chats, `sub_chats.messages`, renderer chat
  transports, `RevisionQueueRun` as the final handoff shape, and provider
  inference from model metadata are migration scaffolding. They may be bridged
  or replaced if provider-native Codex App Server and Claude Agent SDK
  architecture calls for it.
  Date/Author: 2026-04-28 / User + Oracle + Codex

- Decision: Add a dedicated canonical agent execution model in Phase 11.
  Rationale: Codex and Claude have provider-native ids and event lifecycles
  that do not fit cleanly into `sub_chats.streamId` or a plain chat-message
  array. Phase 11 should add durable records for workspaces, agent threads,
  agent runs, run events, approvals, and transcript projection before migrating
  Chat or Comments.
  Date/Author: 2026-04-28 / User + Oracle + Codex

- Decision: Agent-run context must be target/id based, not path based.
  Rationale: Renderer and queue callers should never provide authoritative
  `cwd`, `projectPath`, or `worktreePath`. They should provide project,
  generated-change, chat-workspace, or agent-thread ids. Main resolves the
  workspace context, validates it immediately before launch, and rejects missing
  workspaces, Main-equivalent generated-change workspaces, or unregistered
  paths.
  Date/Author: 2026-04-28 / Oracle + Codex

- Decision: Provider events are canonical; chat messages are a projection.
  Rationale: Codex App Server and Claude Agent SDK emit richer event streams
  than the inherited chat message shape can safely store. Adapters should write
  normalized provider events and provider-native payloads to agent-run event
  storage. A projection service can materialize those events into existing Chat
  and Comments views, including temporary `sub_chats.messages` compatibility.
  Date/Author: 2026-04-28 / Oracle + Codex

- Decision: Explicit provider persistence is required.
  Rationale: Generated-change and Chat launch code should submit provider and
  model separately. Agent threads, agent runs, and generated-change records
  should store provider explicitly. Model-name inference is brittle and will
  break once Codex and Claude both support multiple models, gateways, or
  aliases.
  Date/Author: 2026-04-28 / Oracle + Codex

- Decision: Model provider setup as named `AgentConnection` records.
  Rationale: A named connection can hold provider, runtime, auth mode, default
  model, model-selection mode, safe account status, and capability metadata.
  Agent threads should lock to one connection after the first run so follow-ups,
  generated-change recovery, and stale-resolution runs do not accidentally
  switch from Claude to Codex or from one auth context to another.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Agent auth is optional for local project work but required for
  provider-backed agent execution.
  Rationale: Ripple should open, create, preview, review, import assets, and
  export without sign-in. When a user asks Codex or Claude to create or edit
  motion work, Ripple should require a configured provider connection and route
  missing setup into a recoverable first-agent-action flow.
  Date/Author: 2026-04-28 / User + Codex

## Outcomes & Retrospective

Phase 11 now has the durable execution boundary the roadmap called for. The
main process owns agent connections, workspace resolution, provider launch,
stream/event persistence, cancellation, generated-change queue claiming, run
completion/failure, transcript projection, and restart recovery. Renderer
surfaces ask main to start or observe an agent run; they no longer own the
provider process for local Chat or comment-generated changes.

Normal local Chat now uses `AgentRuntimeChatTransport`, which subscribes to
`agentRuntime.chat` and projects canonical run events back into the existing AI
SDK Chat stream shape. Remote sandbox chats still use the inherited remote
transport. This keeps the migration scoped to Ripple local project work while
avoiding a broad rewrite of message rendering.

Comment-generated changes now run through
`processGeneratedChangeQueue(...)` in `src/main/lib/agent-runtime/`. The
renderer worker remains mounted only to periodically nudge the queue and
invalidate review/preview data. It no longer imports `@ai-sdk/react`, creates
hidden `Chat` instances, or starts legacy Claude/Codex transports.

The earlier proof compromise is now closed for the core Phase 11 surfaces.
Live desktop smoke covered Codex and Claude in the same normal Chat UI, plus
Codex and Claude frame-comment generated changes through isolated proposed
revisions. The runs used the main-process runtime service, persisted run/event
records, projected transcripts back into Chat/Comments, and kept Main clean
until explicit acceptance. Settings/modal UX now reads the runtime auth-status
APIs and avoids the inherited hosted Claude broker in the visible setup path.
Missing Codex or Claude setup is still persisted as a failed/recoverable agent
run and surfaced through the existing Chat stream/error path.

## Context and Orientation

Ripple is being rebuilt from the 1Code desktop coding-agent foundation into a
local-first motion-design app. The useful inheritance is the Electron shell,
chat streaming, provider support, local state, MCP/plugin plumbing, worktree
isolation, file viewer, terminal primitives, and review/diff surfaces. The
product model is now Ripple projects, HyperFrames compositions, assets,
timeline, frame comments, generated changes, preview, and export.

Provider means the external agent runtime used to perform project edits. In
Phase 11 the supported providers are Codex and Claude. An agent connection is a
named local configuration for one provider runtime, auth mode, model defaults,
safe account status, and capability metadata. An agent thread is the durable
Ripple conversation/work context above provider-native Codex threads or Claude
sessions, and it locks to one agent connection after the first run. An agent run
is one execution attempt or turn inside that thread. It stores provider,
connection id, target workspace, mode, model, request id, provider
thread/turn/session ids, event sequence, approvals, status, errors,
cancellation state, and optional generated-change links.

Generated change means an isolated proposed edit created from a comment or
follow-up. The implementation may use hidden Git worktrees and may temporarily
bridge existing hidden chats/sub-chats during migration, but the primary UI
should say generated change, preview, accept, delete, update, Main, and
Worktree where appropriate.

Canonical Phase 11 domain records:

- `agent_connections`: named provider setup records. A connection records
  provider, runtime, auth mode, default model, model-selection mode,
  capabilities, safe account status, and lifecycle timestamps. Credentials stay
  in the existing secure credential/auth storage rather than plain rows.
- `workspaces`: registered project editing contexts. A workspace can be Main, a
  normal Chat worktree, or a generated-change workspace. It records project id,
  kind, path, base Main commit where relevant, isolation state, and lifecycle
  timestamps.
- `agent_threads`: Ripple-owned conversation/work threads. A thread has a
  provider, connection id, purpose such as normal Chat or generated change,
  project id, workspace id, and provider-native thread/session ids.
- `agent_runs`: one execution attempt inside an agent thread. A run has a
  request id for idempotency, provider, connection id, mode, model, run kind,
  workspace id, optional generated-change/comment links, provider
  turn/session ids, status, timestamps, heartbeat, cancellation state, auth
  method, and error fields.
- `agent_run_events`: the canonical execution log. Each event has a run id,
  sequence number, normalized type, provider type/id, provider payload, and
  created time.
- `agent_approvals`: provider-neutral approval requests for commands, file
  changes, network/tool use, or questions. Main owns approval dispatch.
- `transcript_messages` or an equivalent projection: materialized chat/comment
  messages derived from `agent_run_events`. During migration this projection
  may populate `sub_chats.messages`, but adapters should not treat
  `sub_chats.messages` as canonical.

Existing Phase 8 records can bridge to this model. The current `revisions`
table may remain as a generated-change product table, or Phase 11 may introduce
`generated_changes` and `generated_change_attempts` if that makes provider
threads/runs cleaner. In either case, generated-change product state remains
separate from provider execution state.

Current provider files and behavior:

- `package.json` pins `@anthropic-ai/claude-agent-sdk` and
  `@zed-industries/codex-acp`, includes `@mcpc-tech/acp-ai-provider`, and has
  `claude:download` / `codex:download` scripts for bundled binaries.
- `src/main/lib/trpc/routers/claude.ts` is the existing direct Claude SDK chat
  router. It handles Claude config, MCP config, custom providers, OAuth token
  injection, session ids, stream persistence, cancellation, and cleanup.
- `src/main/lib/trpc/routers/claude-code.ts` is the inherited Claude Code auth
  router. It contains hosted OAuth broker setup, stored token helpers,
  integration status, system-token import, and logout/delete behavior.
- `src/main/lib/trpc/routers/codex.ts` is the existing Codex router. It uses
  the bundled Codex CLI for login/status/MCP operations and
  `@zed-industries/codex-acp` for ACP-backed chat streams.
- `src/renderer/features/agents/lib/ipc-chat-transport.ts` is the renderer
  transport for Claude-like IPC chat.
- `src/renderer/features/agents/lib/acp-chat-transport.ts` is the renderer
  transport for Codex ACP chat.
- `src/renderer/features/agents/main/active-chat.tsx`,
  `src/renderer/features/agents/main/new-chat-form.tsx`, and related atoms own
  much of the current chat launch and selected-provider behavior.
- `src/renderer/features/comments/RippleRevisionQueueWorker.tsx` is the
  temporary Phase 8 shell-level runner that starts queued generated-change
  chats. Phase 11 should remove or reduce it to display-only state.
- `src/main/lib/revisions/` and
  `src/main/lib/trpc/routers/revisions.ts` own comment/generated-change queue,
  recovery, acceptance, cleanup, and revision context logic. These should call
  the new agent runtime service instead of relying on a mounted renderer worker.
- `src/main/lib/revisions/revision-queue.ts` is the current Phase 8 handoff
  point. `claimNextRevisionRun()` returns enough information to start the
  transitional renderer worker today. Phase 11 may map this into
  `agent_runs`, or replace the shape with a generated-change scheduler that
  creates/resumes an agent run directly.
- `src/main/lib/revisions/isolated-workspace-acceptance.ts` is out of scope for
  provider adapters except as a post-run acceptance dependency. Agent runs
  produce generated work and summaries; they do not automatically apply work to
  Main.
- `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`,
  `src/renderer/components/dialogs/claude-login-modal.tsx`,
  `src/renderer/components/dialogs/codex-login-modal.tsx`, and onboarding
  pages own provider setup UI that will need updated wording and routes.

External facts summarized into this plan:

- Codex App Server is a long-lived Codex process with a bidirectional JSON-RPC
  over stdio protocol. It hosts Codex core threads and emits UI-ready updates.
  It is the preferred integration method for rich local apps and IDEs.
- Codex TypeScript SDK is useful when an app wants a native library interface
  for simpler server-side workflows, but it has a smaller surface than App
  Server. It is not the target for Ripple's visible Chat/Comments UI.
- Claude Agent SDK is Claude Code as a TypeScript/Python library. It supports
  tool execution, permissions, sessions, MCP, hooks, skills, plugins, subagents,
  and structured streaming.
- Claude Code auth precedence is cloud providers first, then
  `ANTHROPIC_AUTH_TOKEN`, then `ANTHROPIC_API_KEY`, then `apiKeyHelper`, then
  `CLAUDE_CODE_OAUTH_TOKEN`, then subscription OAuth credentials from `/login`.
- Claude Team/Enterprise users can authenticate Claude Code with a subscription
  account. Current Enterprise plans can bill usage at API rates and self-serve
  Enterprise credits draw down as teams use Claude and Claude Code.

## Plan of Work

Milestone 0 is a provider-native compatibility and prototype gate. Write a
short compatibility matrix in this plan or a checked-in artifact that describes
the supported provider paths: Codex App Server with ChatGPT/API-key auth, Codex
ACP as temporary legacy path, Claude Agent SDK with API/cloud/gateway auth, and
Claude Agent SDK with local Team/Enterprise login as advanced local auth.
Before schema churn, prove the pinned bundled Codex CLI supports App Server:
`codex app-server --help`, protocol type generation, stdio startup, account
read, thread start/read, turn start, interrupt/cancel, and one approval
roundtrip. Prove Claude Agent SDK from main with a no-tools temp-cwd run, a
small file-edit temp workspace run, permission callback behavior, and session
id capture/resume where supported. The prototypes should not be product UI.

Milestone 1 creates the canonical agent execution model. Add main-process
types and a service namespace such as `src/main/lib/agent-runtime/`. Add
durable persistence for `agent_connections`, `workspaces`, `agent_threads`,
`agent_runs`, `agent_run_events`, `agent_approvals`, and a transcript
projection. Add a connection registry and backend factory that resolves a
connection to either the Codex App Server adapter or the Claude Agent SDK
adapter. A fake adapter should emit assistant text, tool events,
file-change events, approval requests, usage, completion, failure,
cancellation, and recoverable states so the service can be tested before
provider-specific noise. `sub_chats.messages` remains a compatibility
projection, not the source of truth.

Milestone 2 adds the main-owned workspace/context resolver and guardrails.
Define target inputs by id, such as Main project, generated change, or Chat
worktree. The resolver returns project id, workspace id, project path, cwd,
writable root, and isolation status. It rejects arbitrary renderer paths,
missing workspaces, generated-change workspaces equal to Main, generated-change
workspaces inside Main, and contexts not registered to the requesting
generated change or chat. Add request-id idempotency, active-run uniqueness per
agent thread/workspace where needed, explicit provider persistence, and stale
completion guards that require `agentRunId`.

Milestone 3 redesigns the Phase 8 generated-change scheduler seam against the
fake adapter. Preserve Phase 8 product semantics, but do not preserve hidden
chat/sub-chat as the canonical execution substrate. Decide whether current
`revisions` can serve as generated-change records or whether to add
`generated_changes` and `generated_change_attempts`. The scheduler should claim
or resume product work, create an agent run, and let the agent-run service own
execution. Completion moves generated-change product state to ready/proposed;
failure records a recoverable failure; stale updates create a follow-up or
resolution run in the same workspace/thread.

Milestone 4 implements the Codex App Server adapter. Add a child-process
manager for the bundled Codex CLI `app-server` command, typed JSON-RPC
bindings generated from the pinned Codex binary/schema, request/response
correlation, notification handling, account/auth state, thread creation/read,
turn-start, steer/interrupt/cancel, approvals, item/event normalization, and
shutdown cleanup. Persist Codex thread, turn, and item ids into agent records
and events. Keep all cwd and writable-root decisions inside the main process.

Milestone 5 implements the Claude Agent SDK adapter. Replace the inherited
hosted Claude Code auth assumptions with SDK-native and CLI-native auth status.
Support API key, cloud provider/env, enterprise gateway/bearer, local
`CLAUDE_CODE_OAUTH_TOKEN`, and local `/login` subscription credentials. Expose
the detected auth method in Ripple language. Use SDK `query()` from main for
the first stable path, pass validated `cwd`, tools/permissions,
`CLAUDE_AGENT_SDK_CLIENT_APP`, model, prompt/system context, and cancellation.
Normalize SDK messages/tool results into agent-run events while retaining
Claude-native session/message details in provider payloads. Keep SDK-version
differences isolated inside the adapter.

Milestone 6 migrates normal Chat. Chat becomes a surface over agent threads and
runs. Renderer chat creation still chooses project/composition context,
provider, model, and Main/Worktree mode, but it asks main to create an
agent-thread/run instead of owning the provider stream. Replace or wrap
`ipc-chat-transport.ts` and `acp-chat-transport.ts` with a tRPC/IPC run
subscription that reads transcript projections and agent-run events.

Milestone 7 completes comment generated-change migration. Comment-generated
changes create or reuse a generated-change workspace, an agent thread, and one
or more agent runs. Remove `RippleRevisionQueueWorker` or reduce it to a
display-only observer. Opening a generated change in Chat attaches to the same
agent thread and projected transcript, not a hidden transport that can start a
duplicate run. Accept, update, delete, and recovery flows observe agent-run
terminal states and never silently fall back to Main when isolated context
launch fails.

Milestone 8 cleans up setup UX and terms. Update settings, onboarding, and
login modals so provider setup is expected for agent-backed editing but never
blocks app entry or non-agent local project work. Codex should use App Server
account state and login flows. Claude should stop relying on hosted 1Code OAuth
as the normal path and should describe local Enterprise Claude Code login as an
advanced/local mode. Public-safe Claude setup should be API key, supported
cloud provider, or enterprise gateway.

Milestone 9 hardens validation, restart recovery, packaging, and manual QA. Add
focused unit tests around run state transitions, context validation,
duplicate-run prevention, cancellation, approval records, transcript
projection, provider-aware recovery, missing-auth state, and comment/Chat
thread sharing. Add Electron smoke steps for Codex App Server and Claude Agent
SDK against a default Ripple project and an isolated generated-change context.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Preserve current worktree changes. Before implementation, run
   `git status --short` and inspect relevant diffs so unrelated Phase 8/9 work
   is not overwritten.
2. Create the compatibility matrix and prototype notes in this plan.
3. Add the agent execution service namespace with pure types, status helpers,
   event normalization contracts, workspace/context validation entry points,
   transcript projection helpers, and tests.
4. Implement persistence. Update `src/main/lib/db/schema/index.ts`, add Drizzle
   migration files, and add recovery-friendly indexes for project id, workspace
   id, agent connection id, agent thread id, provider, status,
   generated-change/revision id, request id, active run uniqueness, and event
   sequence uniqueness.
5. Add a fake adapter and use it to test state transitions, approvals,
   transcript projection, cancellation, recovery, duplicate request ids, and
   stale completion guards before real provider adapters.
6. Add a generated-change scheduler bridge from Phase 8's current queue into
   agent runs, then prove it with the fake adapter.
7. Add `src/main/lib/agent-runtime/providers/codex-app-server-adapter.ts` and
   a small Codex App Server process/client wrapper. Generate or check in the
   protocol types for the pinned Codex binary if stable enough.
8. Add `src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts` and
   migrate the direct SDK launch behavior from
   `src/main/lib/trpc/routers/claude.ts` behind the agent-run adapter
   interface.
9. Add tRPC routes under an agent-runtime router, or extend existing chat
   routes with agent-run procedures, for create/start, subscribe, cancel,
   continue, approve/deny, get status, and recover.
10. Migrate normal Chat UI to subscribe to agent-run state while preserving
   message rendering and selected-provider controls.
11. Complete generated-change migration to main-owned agent runs and remove
   renderer ownership from `RippleRevisionQueueWorker`.
12. Update setup UI and language in onboarding/settings/login modals.
13. Run focused tests as they are added, then `bun run test:ripple`,
    `bun run build`, and `git diff --check` for touched files.
14. Update this ExecPlan with the commands run, results, surprises, and final
    acceptance notes.

## Validation and Acceptance

Validation commands:

- `bun test src/main/lib/agent-runtime`:
  Passed on 2026-04-29 after the settings/onboarding hardening pass with
  18 tests across 5 files. Added coverage for passing app-managed Codex API keys
  into the Codex App Server process environment.
  Earlier 2026-04-29 run passed with 17 tests across 5 files and covered provider
  selection, fake adapter event emission, shared AI SDK UI-message projection,
  persisted rich assistant projections, Codex App Server event normalization,
  provider error extraction, stale App Server thread detection, and Codex
  model/thinking selection parsing. The capability hardening pass added prompt
  mention normalization coverage for skill, agent, file, folder, and MCP tool
  mentions.
- `bun run test:ripple`:
  Passed on 2026-04-29 after the settings/onboarding hardening pass with
  185 tests across 43 files.
  Passed again on 2026-04-29 after the version/model refresh with 185 tests
  across 43 files.
  Earlier 2026-04-29 run passed with 184 tests across 43 files after the
  capability hardening pass.
- `bun run build`:
  Passed on 2026-04-29 after the settings/onboarding hardening pass. The build
  still reports the existing Vite warnings for `gray-matter` eval and
  static/dynamic import overlap, but it completed successfully.
  Passed again on 2026-04-29 after the version/model refresh with the same
  existing warning classes.
- `bun run ts:check`:
  Passed on 2026-04-29 after the settings/onboarding hardening pass.
  Passed again on 2026-04-29 after updating Claude SDK, Claude Code, Codex CLI,
  zod 4 schemas, and the model catalogs.
- `git diff --check`:
  Passed on 2026-04-29 after the settings/onboarding hardening pass.
  Passed again on 2026-04-29 after the version/model refresh.
- Computer Use settings QA:
  Passed on 2026-04-29 against the running Electron app. Checked Models,
  expanded API Keys, Skills refresh, and the MCP add-server provider picker for
  the Claude Agent SDK / Codex App Server labels and layout.
- Packaged-binary checks:
  `bun run codex:download`, `bun run claude:download`,
  `resources/bin/darwin-arm64/codex app-server --help`,
  `resources/bin/darwin-arm64/codex app-server generate-ts --out
  /private/tmp/codex-app-server-ts`,
  `resources/bin/darwin-arm64/codex login status`,
  `resources/bin/darwin-arm64/codex --version`, and
  `resources/bin/darwin-arm64/claude --version` all ran from this worktree.
  Codex reported a ChatGPT login during the earlier smoke. After the
  version/model refresh, Codex reported `codex-cli 0.125.0` and Claude reported
  `2.1.123 (Claude Code)`. A raw `claude auth status --json` probe hung in the
  sandbox process environment and was stopped; the app adapter still wraps that
  status check with a 15s timeout.

Live Codex smoke:

- Normal Chat: the existing desktop Chat UI on project `test2` selected
  `Codex 5.3`, used `AgentRuntimeChatTransport`, and replied `OK3` from
  `/Users/comeara/Ripple/test2`. The persisted run completed with
  `provider=codex`, `model=gpt-5.3-codex/high`, and no error. During this run,
  the adapter recovered a stale Codex App Server thread by recreating the
  provider thread and retrying the turn.
- Streaming UI hardening: the same desktop Chat UI selected `Codex 5.3` and
  sent "Use a shell command to print the first 5 lines of index.html..." from
  project `test2`. The UI showed `Recovered provider thread`, a collapsed
  `3 steps` tool group, final reply `CODEX-STREAM-UI`, and `16.4k` token
  metadata. Persisted run `mojitj6h6m8olebk` completed with
  `provider=codex`, `model=gpt-5.3-codex/high`, streamed `assistant_text_delta`
  events, `thread/tokenUsage/updated` usage events, and `tool_start` /
  `tool_end` events for `Bash` with parsed command `head -n 5 index.html` in
  `/Users/comeara/Ripple/test2`. Persisted sub-chat `mojislfoqs6xn5cv`
  retained assistant parts `data-agent-runtime`, text, `tool-Bash`, and final
  text. `/Users/comeara/Ripple/test2` remained clean.
- Comment generated change: comment `#2` created revision
  `mojg5gfqonp0m90l`, run `mojg5injwhj20b53`, workspace
  `/Users/comeara/.ripple/worktrees/test2/judicial-dune`, and a one-file
  `index.html` diff changing `test 3` to `Phase 11 Comment Smoke`. Main stayed
  clean until explicit acceptance.
- Stale update after accepting another proposal: the same revision later ran
  `mojgg7pmgn3py6b5`, fast-forwarded from Main, returned to `proposed`, and
  now contains the isolated diff from `Phase 11 Claude Comment Smoke` to
  `Phase 11 Comment Smoke`.

Live Claude smoke:

- Normal Chat: the same desktop Chat UI on project `test2` selected the Opus
  alias (then displayed as `Opus 4.6`), used `AgentRuntimeChatTransport`, and replied
  `CLAUDE-AUTH-CHECK`. The persisted run completed with `provider=claude`,
  `model=opus`, and Claude Agent SDK session id
  `3c522f6e-f8bd-4bec-b7ff-a8bc7eddedd6`.
- Streaming UI hardening: the same desktop Chat UI selected the Opus alias and
  sent "Use the Read tool to read index.html..." from project `test2`. The UI
  showed a collapsed `2 steps` tool group, final reply `CLAUDE-STREAM-UI`, and
  `140` token metadata. Persisted run `mojhowq847xz8b1z` completed with
  `provider=claude`, `model=opus`, `system:init` session metadata, `Glob` and
  `Read` tool start/update/end events, usage events, final assistant deltas,
  and a final assistant message. Persisted sub-chat `mojfxqcl3susjrn2`
  retained rich assistant tool/text/usage parts for reopen.
- Comment generated change: comment `#3` created revision
  `mojgbvkgtmopw7qi`, run `mojgbwckfrqfqin9`, workspace
  `/Users/comeara/.ripple/worktrees/test2/flexible-copse`, and a one-file
  `index.html` diff changing `test 3` to
  `Phase 11 Claude Comment Smoke`. The UI showed the comment as `Done`,
  transcript projection stored one user and one assistant message, and Main
  stayed clean before acceptance.
- Accept flow: accepting the Claude proposal marked the revision `accepted`,
  created the Main commit `edbd16a Accept Ripple comment changes`, and left
  `/Users/comeara/Ripple/test2` with a clean worktree.

Acceptance criteria:

- Codex and Claude both run through the main-process `AgentRuntimeService`.
- Codex user-visible Chat/Comments execution uses Codex App Server, not ACP, as
  the primary path.
- Claude user-visible Chat/Comments execution uses Claude Agent SDK, not the
  hosted 1Code OAuth broker, as the primary path.
- The canonical execution log is agent-run events. Existing Chat/Comments UI
  reads transcript projections, not provider adapters writing directly to
  renderer-owned chat state.
- Agent runs are target/id based. Renderer and queues do not provide
  authoritative cwd or project/worktree paths.
- Provider is persisted explicitly for Chat and generated-change runs. Model
  names are not used to infer which provider to launch.
- Active-run uniqueness and request-id idempotency prevent duplicate active
  runs for the same agent thread/generated change.
- Provider setup is optional until first agent action and uses Ripple language.
- Provider-backed agent execution requires an explicit Codex or Claude
  connection, but missing setup never blocks app entry or non-agent local
  project work.
- Renderer panes can mount, unmount, filter, and switch without starting,
  restarting, or orphaning agent runs.
- App restart marks or recovers queued/running agent runs without needing a
  renderer worker to be mounted.
- Main validates all project and generated-change working directories before
  launch.
- Missing auth, provider failure, cancellation, and provider budget/usage errors
  are persisted and visible in Ripple language.
- Phase 8's Comments pane remains review-only: it can create, preview, open,
  accept, delete, restore, and follow up on generated changes, but it does not
  claim or execute provider work from renderer state.

## Idempotence and Recovery

Agent run creation must be idempotent by caller intent. Normal Chat send and
comment-generated-change scheduling should carry stable request ids and active
run constraints so refresh/retry cannot create duplicate active runs for the
same agent thread, workspace, or generated change. Completion and failure
handlers must include the current `agentRunId`; a stale provider process cannot
finalize a newer generated change.

Codex App Server processes should be long-lived per app or per authenticated
profile, but safe to restart. On restart, main should re-read persisted run
state and Codex thread ids. If App Server cannot resume a turn, mark the run
recoverable and allow the user to continue from the persisted transcript.

Claude SDK runs may not be resumable after every crash. Persist Claude session
ids when emitted. On restart, attempt resume when the SDK supports it; otherwise
mark the run recoverable and let the user continue from the saved transcript.

Cancellation should be cooperative first and forceful second. A cancelled run
must transition once into a terminal or recoverable cancelled state. Cleanup can
be repeated safely.

Auth changes should not delete project work. Logging out of a provider should
stop new runs, mark active runs recoverable or failed with clear setup text,
and preserve transcripts and generated changes for later retry.

Phase 8 recovery behavior should become provider-aware, not weaker. The current
startup path requeues interrupted `preparing` / `running` generated changes
when their hidden chat and isolated workspace exist. Phase 11 should first ask
whether an agent run can be resumed or reconciled; if not, it may requeue the
same hidden thread/workspace using the saved transcript and context.

Schema migrations must be additive where possible. Keep old chat/sub-chat and
revision records readable while UI migration is underway, but treat the new
agent execution tables as canonical once a surface migrates.

## Interfaces and Dependencies

New or changed internal interfaces:

- `AgentRuntimeService`: main-process entry point for resolving connections,
  creating, starting, subscribing to, cancelling, resuming, and recovering
  agent runs.
- `AgentConnectionRegistry`: stores and resolves named Codex and Claude
  connections, auth modes, model defaults, safe account status, and capability
  metadata.
- `AgentProviderFactory`: creates the provider-native adapter for a resolved
  connection.
- `AgentProviderAdapter`: provider-specific interface implemented by Codex App
  Server and Claude Agent SDK adapters.
- `WorkspaceContextResolver`: main-owned resolver from target ids to project
  path, workspace path, writable root, and isolation status.
- `AgentRunEvent`: normalized event stream for assistant text, reasoning, tool
  start/update/end, file edits/diffs, approvals, command output, usage, errors,
  and terminal states.
- `AgentRunApproval`: provider-neutral approval model for command, file change,
  network, tool, or question approvals. Main validates and dispatches
  approve/deny decisions only to the current active run.
- `AgentRunStatus`: queued, preparing, running, awaiting_approval, cancelling,
  cancelled, completed, failed, or recoverable.
- `TranscriptProjectionService`: converts canonical run events into Chat and
  Comments messages, including temporary `sub_chats.messages` compatibility.
- `ProviderAuthStatus`: provider-neutral setup state with provider-specific
  details hidden behind safe view models.

Required new or revised persistence:

- `agent_connections`
- `workspaces`
- `agent_threads`
- `agent_runs`
- `agent_run_events`
- `agent_approvals`
- `transcript_messages` or equivalent projection storage
- explicit provider fields for generated-change/comment launch records and
  Chat launch records
- optional `generated_changes` / `generated_change_attempts` if current
  `revisions` cannot cleanly represent product generated-change state once
  hidden chat/sub-chat execution is removed

Existing dependencies:

- `@anthropic-ai/claude-agent-sdk`
- Bundled Claude Code native binary downloaded by `bun run claude:download`
- Bundled Codex CLI downloaded by `bun run codex:download`
- Current `@zed-industries/codex-acp` and `@mcpc-tech/acp-ai-provider` legacy
  path for migration/fallback reference
- Electron main process, tRPC, Drizzle, Jotai, React Query, and existing chat,
  revisions, and project services

External docs summarized in this plan:

- OpenAI Codex App Server docs and engineering post
- OpenAI Codex SDK docs
- Anthropic Claude Agent SDK docs
- Anthropic Claude Code authentication docs
- Anthropic Team/Enterprise Claude Code and Enterprise usage-billing help docs
- Zed external agents docs and OpenClaw/acpx ACP docs for industry reference

## Artifacts and Notes

Implementation artifacts from 2026-04-28:

- `src/main/lib/db/schema/index.ts` and `drizzle/0012_gigantic_chimera.sql`
  add the agent execution tables and revision provider/run fields.
- `src/main/lib/agent-runtime/` contains the provider-neutral service,
  connection registry, workspace resolver, transcript projection,
  generated-change scheduler, fake adapter, Codex App Server adapter, Claude
  Agent SDK adapter, and focused tests.
- `src/main/lib/trpc/routers/agent-runtime.ts` exposes provider auth status,
  start/execute/cancel/read run APIs, a normal Chat subscription, and the
  generated-change queue nudge.
- `src/main/index.ts` marks interrupted agent runs recoverable on app startup.
- `src/main/lib/revisions/comment-revisions.ts` persists provider/model/thread
  identity on generated changes.
- `src/renderer/features/agents/lib/agent-runtime-chat-transport.ts` adapts
  persisted agent-run events into the existing AI SDK Chat stream shape.
- `src/renderer/features/agents/main/active-chat.tsx` routes local Chat through
  the runtime transport while leaving remote sandbox chat on the existing remote
  transport.
- `src/renderer/features/comments/RippleRevisionQueueWorker.tsx` is reduced to
  queue nudge/observer behavior and no longer owns provider execution.
- `package.json` includes `src/main/lib/agent-runtime` in `test:ripple`.

Hardening artifacts from 2026-04-29:

- `src/main/lib/agent-runtime/providers/codex-model-selection.ts` parses
  Ripple UI model selections into Codex App Server model and reasoning-effort
  fields instead of sending slash-suffixed UI labels as provider model ids.
- `src/main/lib/agent-runtime/providers/codex-app-server-events.ts` normalizes
  Codex App Server notifications, including provider status, assistant text,
  tool, file-change, and error events.
- `src/main/lib/agent-runtime/providers/codex-app-server-adapter.ts` now fails
  non-retry provider errors, extracts JSON-string error details, and recreates
  stale provider threads when App Server reports `thread not found`.
- `src/main/lib/agent-runtime/service.ts` now treats provider-native
  `assistant_message` events as canonical transcript material and avoids adding
  a duplicate synthetic final assistant message.
- `src/renderer/components/dialogs/claude-login-modal.tsx` now shows local
  Claude Agent SDK status/setup through `agentRuntime.authStatus` and
  `agentRuntime.setupCommand` instead of starting the inherited hosted
  `claude-code` OAuth broker.
- `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` now
  presents Codex App Server and Claude Agent SDK as runtime connections in one
  provider setup section.
- `src/renderer/components/dialogs/codex-login-modal.tsx` invalidates runtime
  Codex auth status after successful login.
- `src/main/lib/trpc/routers/agent-runtime.ts` exposes setup command metadata
  alongside auth status.
- TypeScript hardening touched legacy bridge types and nullable renderer props
  so `bun run ts:check` can be used as a real Phase 11 validation gate.
- `src/main/lib/agent-runtime/prompt-mentions.ts` prepares serialized Chat UI
  mentions for both provider runtimes by stripping agent/skill/tool chips,
  preserving safe file/folder paths, and adding provider-readable instructions
  for mentioned skills, agents, and MCP tools.
- `src/main/lib/agent-runtime/providers/claude-runtime-capabilities.ts` builds
  Claude Agent SDK capability context from project/global/plugin MCP config,
  approved plugin MCP servers, enabled local plugins, user/project/plugin
  skill directories, and AGENTS.md.
- `src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts` now passes
  Claude SDK `systemPrompt`, `agents`, `mcpServers`, `plugins`,
  `settingSources`, and shell-derived environment context for runtime runs.
- `src/main/lib/agent-runtime/providers/codex-app-server-adapter.ts` now uses
  the bundled Codex MCP snapshot path to seed safe session MCP/tool metadata
  and removes raw mention tokens before starting App Server turns.
- `src/renderer/features/agents/lib/agent-runtime-chat-transport.ts` now
  merges partial `sessionInit` updates without letting sparse provider events
  erase previously discovered MCP/tool metadata.

Local Claude Enterprise probe:

- Command:
  bundled Claude Code auth status check
- Result summary after user login:
  `loggedIn: true`, `authMethod: "claude.ai"`,
  `apiProvider: "firstParty"`, `orgName: "Deloitte"`,
  `subscriptionType: "enterprise"`.
- Minimal SDK/CLI probe:
  bundled Claude Code print-mode run with no tools, no session persistence, and
  a low budget cap
- Result summary:
  The request authenticated and reached Claude with nonzero model usage, then
  stopped with `error_max_budget_usd`. Reported total cost was about
  `0.056482`, so the budget cap is a stop condition rather than an exact
  preflight ceiling.

Current provider package snapshot:

- `@anthropic-ai/claude-agent-sdk`: `0.2.123`
- `@zed-industries/codex-acp`: `0.9.3`
- `@mcpc-tech/acp-ai-provider`: `^0.2.4`
- `zod`: `^4.3.6` to satisfy the latest Claude Agent SDK peer dependency
- `claude:download`: downloads Claude Code `2.1.123`
- `codex:download`: downloads Codex CLI `0.125.0`

The phase should update these versions only when the adapter prototypes prove a
newer pinned version is required. Version changes should be explicit and
validated against packaged Electron behavior.

Phase 8 handoff audit from 2026-04-28:

- Phase 8 should remain paused until this Phase 11 agent-run migration lands.
- Preserve Phase 8 product semantics and safety guarantees, but do not preserve
  hidden chat/sub-chat execution architecture as a long-term constraint.
- Keep `src/main/lib/revisions/revision-queue.ts` as the current source of
  truth for runnable generated-change claims until a generated-change scheduler
  or agent-run persistence absorbs that responsibility deliberately.
- Keep `src/main/lib/revisions/isolated-workspace-acceptance.ts` as the
  acceptance boundary for both comment generated changes and Worktree chat
  changes.
- Replace `src/renderer/features/comments/RippleRevisionQueueWorker.tsx` with
  main-process provider execution; do not polish around it as permanent
  architecture.
- Make provider-native event storage canonical and project it back into
  Chat/Comments. Do not make `sub_chats.messages` the final execution source of
  truth.
- After Phase 11, resume Phase 8 polish on product details: comment card
  refinement, generated-change summary quality, stale update UX, Chat handoff,
  restore/delete edge cases, and visual QA.

Oracle review amendments from 2026-04-28:

- Go for Milestone 0 and schema/service work, but do not migrate Chat or remove
  `RippleRevisionQueueWorker` before adding the agent execution tables, explicit
  provider persistence, run-id idempotency, workspace/context resolver, approval
  model, transcript projection, and provider prototypes.
- Treat Codex App Server and Claude Agent SDK as provider-native foundations.
  The shared Ripple model is agent threads, agent runs, events, approvals,
  workspace contexts, generated changes, and transcript projections.
- Add named provider connections, a connection registry, a backend factory, a
  capability model, and one connection per agent thread. This follows the
  closest precedent apps without copying their broader provider breadth.
- Keep explicitly out of scope: renderer-owned provider execution, mandatory
  provider setup on app entry, hosted/cloud run services, auto-accept into Main,
  full Codex desktop app parity, generalized multi-agent orchestration, MCP
  marketplace work, Phase 12 prompt/skills overhaul, Phase 13 visual context,
  Phase 9 export UX, and public Claude subscription-login onboarding without
  approval.
