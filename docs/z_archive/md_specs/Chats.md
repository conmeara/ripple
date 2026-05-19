# Chats

Chat is the main place where the user directly asks an agent to edit, explain, or continue work on the project.

Unlike [[Comments]], Chat is not necessarily tied to one frame. It is the broader creative conversation: "make this a product launch intro," "try a brighter palette," "slow down the CTA," "add a logo reveal," or "continue from that proposed change."

[Chat Screenshot: project chat with active composition and preview context]

## Core Journey

The user opens the Chat tab in the right pane, writes a prompt, chooses an agent/model if needed, and sends.

Ripple should start the agent in the active project context. The agent can edit the project, stream progress, show useful tool activity, and produce a proposed change when the work modifies the project.

The user can keep chatting, preview generated work, accept it into Main, or switch to [[Comments]] for frame-based review.

## New Chat

New Chat should create a clean conversation without resetting the center preview.

Expected behavior:

- The current project stays selected.
- The current composition stays selected.
- The current preview time stays stable.
- The right pane switches to Chat.
- The draft input is ready.
- The chat can receive preview context: source, time, frame, composition.

Starting a new chat should not remount the whole [[Shell Layout|shell]] or jump [[Preview]] back to `00:00`.

## Sending A Message

When the user sends:

| Condition | Expected behavior |
| --- | --- |
| Provider ready | Start the run and stream progress |
| Provider missing | Show setup needed and route to [[Agent Connections]] |
| Offline/failed provider | Preserve the message and show retry/recover |
| Preview source is Main | Agent works from Main unless asked otherwise |
| Preview source is proposed changes | Agent context should know the user was viewing a proposal |

The message should appear immediately. Slow visual-context preparation should not block the first useful chat event.

## Proposed Changes From Chat

Chat can produce a proposed project version, similar to a broader [[Revisions|revision]].

The UI should make it clear when the agent has generated changes that are not yet Main. The user should be able to preview those changes, compare against Main, accept, reject, or keep chatting.

Compared with comments, Chat can show a fuller transcript, tool activity, changed files, and detailed agent output. It is the place for depth.

## Comment Conversations

[[Comments#Replies]] and [[Comments#Proposed Versions]] can open in Chat through `Open in Chat`.

[Chat Screenshot: comment conversation opened from a comment card]

When opened from a comment:

- Focus the comment's conversation.
- Preserve the comment's preview time/range.
- Keep the comment/revision relationship visible.
- Show fuller transcript/tool details than the comment card.
- Let the user reply with more nuance.

Chat should not make the comment disappear or turn it into a generic project chat. The compact comment card remains the review surface.

## History And Active Work

Project chat history should be recoverable. Active conversation chips are covered in [[Active Conversations]].

Closing a chip is not archiving. Archiving a conversation is not accepting a revision. Chat history and revision state are related but separate.

## Underneath

Ripple can store conversations, messages, provider threads, transcript events, and generated change runs separately. The user-facing model should stay simple:

- Conversation: the thing the user can read and continue.
- Agent run: the current work.
- Proposed changes: the reviewable output.
- Main: the accepted project.

## What Good Looks Like

Chat feels like talking to a motion editor who can actually change the project. It has enough detail for complex work, but it still stays connected to preview, timeline, and safe acceptance.

## Test Coverage

- `src/main/lib/conversations/service.test.ts` - Lists project conversations, attaches comment conversations, reopens archived replies, and round-trips rich messages.
- `src/shared/ripple-conversations.test.ts` - Derives compact chat titles from user messages and falls back for blank input.
- `src/main/lib/agent-runtime/chat-history-context.test.ts` - Bridges visible prior chat history into clean Codex/Claude provider context.
- `src/main/lib/agent-runtime/agent-runtime-ui-projection.test.ts` - Projects provider events, reasoning, tools, approvals, and usage into persisted chat UI parts.
- `src/renderer/features/agents/commands/builtin-commands.test.ts` - Keeps chat slash commands available without legacy language and filters prompt commands.
- `src/renderer/features/agents/ui/agent-tool-registry.test.ts` - Keeps loading/planning labels stable within a session while varying across sessions.
- `src/renderer/features/agents/utils/auto-generate.test.ts` - Auto-starts normal one-message chats and routes comment-created chats through revision claiming.
- `src/renderer/features/agents/utils/work-mode.test.ts` - Distinguishes Main from temporary proposal workspaces for chat mode display.
