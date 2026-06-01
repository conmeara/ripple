# Official HyperFrames Skills

Ripple bundles the official HyperFrames agent skills from:

https://github.com/heygen-com/hyperframes/tree/cfef6caf5f00caaa0980572007079b9d980d9c9d/skills

These skill bodies are upstream HyperFrames content. Ripple only adds packaging
metadata so Codex and Claude can discover them as app-managed skills.

Refresh for a release with:

```bash
bun run hyperframes:skills:update
```

The update script refreshes `skills/`, records the pinned upstream commit in
`source.json`, and keeps the Codex and Claude plugin manifests in place.
