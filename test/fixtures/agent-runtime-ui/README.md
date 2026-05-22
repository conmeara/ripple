# Agent Runtime UI Fixtures

These fixtures are sanitized real Ripple agent runs. They replay Claude Agent SDK
and Codex App Server event streams through the same projection and motion-editor
activity UI that chat and comments use.

`manifest.json` is the coverage matrix. Each fixture is mapped to the real UI
scenarios it protects, and `test:quality` fails if a required scenario is missing
or the assigned fixture no longer satisfies it.

Refresh workflow:

1. List recent local runs:
   `bun run eval:agent-runtime-ui:refresh`
2. Pick one completed Claude or Codex run that includes visible design work,
   preview checks, edits, comments, or verification.
3. Export and immediately replay-test it:
   `bun run eval:agent-runtime-ui:refresh -- --fixture real-codex-example:<agent_run_id>`

The exporter sanitizes local paths, provider ids, raw provider payloads, and
large image/text fields before writing JSON. Keep fixture names kebab-case and
prefer examples that exercise visible transitions, not only final responses.
