# Privacy Policy

**Ripple** keeps its core media workflow local. Analysis, transcription,
editing, rendering, and QA can all run on your machine.

- **No Ripple data collection.** Ripple operates no servers, telemetry,
  analytics, or account system.
- **Your media stays local.** Transcription (whisper.cpp), analysis, rendering
  (ffmpeg), and QA all execute locally. Derived artifacts (transcripts,
  indexes, sheets, renders) are written to your project directory and
  `~/.ripple/`.
- **Network use is explicit.** `ripple study <url>` uses `yt-dlp` to fetch that
  URL; use a local file to keep reference analysis offline. Workflows may also
  call user-configured generation providers (for example, for voice, music,
  images, or video). Requests to those services follow their privacy policies.
- **The host agent is separate.** Ripple runs inside a coding agent (Codex or
  Claude Code). What the host agent does with your prompts and files is
  governed by its provider's privacy policy, not this one.

Questions: [open an issue](https://github.com/conmeara/ripple/issues).
