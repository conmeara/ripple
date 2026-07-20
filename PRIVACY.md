# Privacy Policy

**Ripple** (the plugin and the `ripple-video` CLI) runs entirely on your
machine.

- **No data collection.** Ripple has no servers, no telemetry, no analytics,
  and no account system. It never transmits your media, transcripts, edit
  manifests, or usage data anywhere.
- **Your media stays local.** Transcription (whisper.cpp), analysis, rendering
  (ffmpeg), and QA all execute locally. Derived artifacts (transcripts,
  indexes, sheets, renders) are written to your project directory and
  `~/.ripple/`.
- **Third-party services only at your direction.** Workflows described in the
  skill may call external generation APIs (e.g. ElevenLabs, Google Gemini,
  OpenAI, Runway) — only when you configure the corresponding API key and the
  agent invokes them for your task. Data sent to those services is governed by
  their own privacy policies; Ripple itself sends nothing.
- **The host agent is separate.** Ripple runs inside a coding agent (Codex or
  Claude Code). What the host agent does with your prompts and files is
  governed by its provider's privacy policy, not this one.

Questions: [open an issue](https://github.com/conmeara/ripple/issues).
