# Failure Recovery

Failure Recovery is how Ripple keeps creative work safe when something goes wrong.

The app should not pretend failures succeeded, and it should not dump raw developer errors into primary UI. It should preserve the user's work, name the problem in product language, and offer the next useful action.

[Recovery Screenshot: preview failure with retry and preserved project context]

## General Pattern

A good failure state has:

- What failed.
- What remains safe.
- What the user can do next.
- A retry or recovery action.
- A path to advanced details only when useful.

Avoid disappearing failures. For long-running jobs like agents and exports, keep a row or transcript entry that explains the failure.

## Common Failures

| Feature | Failure | Expected recovery |
| --- | --- | --- |
| [[Project Entry]] | Invalid folder | Explain missing files or malformed metadata |
| [[Preview]] | Source cannot load | Retry/refresh, keep project/composition selected |
| [[Timeline]] | Model cannot load | Keep preview usable, show timeline error |
| [[Comments]] | Agent run fails | Keep comment thread, allow retry/open in chat |
| [[Revisions]] | Accept fails | Keep Main unchanged, show recovery |
| [[Chats]] | Provider unavailable | Preserve message, route to setup/retry |
| [[Exports]] | Render fails | Keep job row, allow retry/remove |
| [[Assets]] | Import rejected | Explain unsupported file or unsafe path |
| [[App Updates]] | Update check fails | Show readable error, app keeps working |

## Main Must Stay Safe

Failures around proposed changes should never silently mutate Main.

If revision creation fails, the proposal fails. If accept fails, Main remains as it was. If refresh cannot safely rebase a stale proposal, the proposal becomes needs attention.

## Recoverable Advanced Details

Advanced users may need logs, diffs, terminal output, or provider events. Put those in [[Advanced Utilities]] or full [[Chats]], not on compact review cards.

Primary UI should say "Preview could not load" or "Changes need attention" before it says anything about protocols, worktrees, command exits, or stack traces.

## App Restarts

Ripple should recover from restarts:

- Interrupted exports become interrupted or retryable.
- Agent runs can resume, fail clearly, or show recoverable state.
- Queued comment revisions can be claimed again safely.
- Temporary proposal work should not be duplicated.

## What Good Looks Like

When something breaks, the user still trusts Ripple. They know whether their project is safe, what action they can take, and where to find deeper detail if they need it.

## Test Coverage

- `test/quality/failure-recovery-coverage.test.ts` - Maps release recovery claims to concrete regression evidence.
- `src/main/lib/db/index.test.ts` - Repairs local schema drift so startup can recover cleanly.
- `src/main/lib/hyperframes/preview-manager.test.ts` - Covers preview readiness timeouts, startup errors, and stopped-before-ready cases.
- `src/main/lib/exports/service.test.ts` - Keeps failed/interrupted exports as recoverable jobs and prevents completion after cancellation.
- `src/renderer/features/comments/comment-filters.test.ts` - Prevents unsafe comment/revision actions when proposals need refresh or attention.
