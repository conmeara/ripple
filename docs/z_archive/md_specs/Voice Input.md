# Voice Input

Voice Input lets the user dictate a chat prompt instead of typing it.

It should feel like a lightweight composer shortcut inside [[Chats]] and comment follow-ups, not a separate recording product. The end result is still editable text before the user sends.

[Voice Input Screenshot: chat composer with microphone recording state and waveform]

## Composer Behavior

When the chat input is empty and voice is available, the send button can become a microphone action.

Expected behavior:

- Press or hold the mic to record.
- Show an obvious recording state and audio-level feedback.
- Stop recording on release, click, or cancel interaction.
- Transcribe into the existing draft instead of sending automatically.
- Preserve existing typed text and append transcription with sensible spacing.
- Disable only the voice action while transcription is in progress.

The user should be able to edit the transcript before sending it to an agent.

## Availability

Voice should appear only when Ripple can transcribe.

| State | User-facing behavior |
| --- | --- |
| Available | Mic action appears in the composer |
| Recording | Composer shows recording feedback |
| Transcribing | Text entry stays visible; send waits for transcription |
| Not configured | Normal typing remains available |
| Failed | Keep the draft, show a short error, let the user try again |

Voice may use a signed-in plan, user-provided OpenAI API key, or configured environment key. That setup belongs in [[Settings]], not in the primary composer.

## Hotkey

If a voice hotkey is configured, it should behave like push-to-talk while the composer is active and should not fire while the user is typing into unrelated inputs.

The tooltip should name the hotkey when present.

## What Good Looks Like

Voice input makes prompt capture faster without making the user give up control. The transcript lands as normal editable text, and a failed transcription never loses the user's draft or blocks typing.

## Test Coverage

- `src/main/lib/trpc/routers/voice.ts` - Implements availability checks, OpenAI key resolution, subscription checks, transcription, and text cleanup. Focused automated coverage should be added around this router and composer behavior.
- `src/renderer/lib/hooks/use-voice-recording.ts` - Handles recording lifecycle and audio-level state. Focused automated coverage should be added for permission, cancel, and stop flows.
- `src/renderer/features/agents/components/agent-send-button.tsx` - Presents mic/send/transcribing button states and voice hotkey display.
