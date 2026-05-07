# V1 Release Checklist

This checklist records release-gated validation that depends on a packaged app, provider auth, signing, update infrastructure, or manual review.

## Required Gates

- Run `bun run test:quality`.
- Run `bun run test:ripple`.
- Run `bun run test:hyperframes`.
- Run `bun test`.
- Run `bun run ts:check`.
- Run `git diff --check`.
- Run `bun run test:e2e`.
- Run `bun run test:export:smoke`.
- Run `bun run package`.
- Run `bun run test:package:smoke`.
- Run `bun run test:e2e:packaged` against the packaged app.
- Run `bun run test:update:smoke` when update metadata or updater behavior changed.
- Run `RIPPLE_LIVE_PROVIDER_SMOKE=1 RIPPLE_LIVE_PROVIDER=codex bun run test:live` when Codex auth is available.
- Run `RIPPLE_LIVE_PROVIDER_SMOKE=1 RIPPLE_LIVE_PROVIDER=claude bun run test:live` when Claude auth is available.

## Manual Checks

- Create a blank project and verify preview playback.
- Add a frame comment and verify visual context is attached.
- Add a range comment and verify a frame sheet is attached.
- Ask an app-managed agent for a visual sanity check and verify it uses `ripple snapshot` or `ripple frame-sheet`.
- Export the selected composition.
- Confirm update checks and restart prompts use Ripple product language.
- Confirm normal UI copy avoids implementation language such as daemon, backend, RPC, branch, and worktree.
