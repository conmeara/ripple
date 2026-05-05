# Future-Agent Closeout Protocol

Use this when finishing any Ripple change. The point is to close the loop with
evidence tied to product workflows, not to run a random pile of tests.

## Required Closeout Steps

1. Name the changed surface: project setup, preview, timeline, comments,
   revisions, agents, exports, packaging, analytics, updates, onboarding,
   settings, or shared infrastructure.
2. Find the matching workflow IDs in `docs/testing/ux-workflow-coverage.md`.
3. Run the smallest focused command that covers the touched code.
4. Run `bun run test:quality` whenever testing docs, package scripts, fixtures,
   release gates, or workflow mappings changed.
5. Run `bun run test:e2e` when a change affects launch, onboarding, project
   creation, templates, the Ripple shell, preview controls, comments, or export
   UI wiring.
   Use `bun run test:visual` for visual-only changes and
   `bun run test:e2e:update` only when intentionally refreshing reviewed
   Playwright baselines.
6. Escalate to `bun run test:closeout` before broad release claims or large
   cross-surface changes.
7. Use `bun run test:release` only for release-candidate validation because it
   runs closeout, schema drift, export smoke, package, and package smoke.
8. Use `bun run test:e2e:packaged` for packaged-app workflow evidence after
   building or selecting a `Ripple.app` artifact.
9. For anything marked release-gated, either run the smoke or record the exact
   missing gate in `docs/release/v1-release-checklist.md`.
10. For packaging or CI-resource changes, keep `bun run bin:stage` and
   `bun run package:stage` wired through `bun run package` so fresh checkouts
   stage app-managed CLIs and export browsers before package smoke.

## Surface-To-Command Map

| Changed surface | Required local command | Broader command before closing |
| --- | --- | --- |
| App launch, onboarding, and desktop shell | `bun run test:e2e` | `bun run test:closeout` |
| Project creation, paths, lifecycle, setup | `bun test src/main/lib/ripple-projects src/renderer/features/onboarding` | `bun run test:ripple` and `bun run test:e2e` |
| Templates and starters | `bun test src/main/lib/hyperframes/templates src/renderer/features/templates` | `bun run test:ux` and `bun run test:e2e` |
| Preview player, composition source, timeline | `bun test src/main/lib/hyperframes src/renderer/features/hyperframes` | `bun run test:hyperframes` and `bun run test:e2e` |
| Assets and composition pane | `bun test src/main/lib/hyperframes/project-browser.test.ts src/renderer/features/hyperframes/project-model.test.ts` | `bun run test:ux` |
| Comments, markers, replies | `bun test src/shared/ripple-comments.test.ts src/renderer/features/comments src/renderer/features/hyperframes/preview-comment-markers.test.ts` | `bun run test:ripple` and `bun run test:e2e` |
| Revisions and accept/reject | `bun test src/main/lib/revisions src/renderer/features/ripple-shell/ripple-preview-target.test.ts` | `bun run test:agent`; add `bun run test:e2e` when review controls or generated-change UX changes; use `bun run test:e2e:packaged` for release-candidate artifact evidence |
| Chat, active tabs, conversations | `bun test src/main/lib/conversations src/shared/ripple-conversations.test.ts src/renderer/features/ripple-shell/active-conversations.test.ts` | `bun run test:agent` |
| Provider runtime, tools, attachments, skills, MCP | `bun run test:agent` | `bun run test:ripple`; use `bun run test:live` only with explicit provider credentials |
| Visual context and frame sheets | `bun test src/cli src/main/lib/revisions/comment-visuals.test.ts src/main/lib/agent-runtime/runtime-attachments.test.ts` | `bun run test:agent` |
| Exports and Renders pane | `bun run test:export` | `bun run test:e2e`, `bun run test:export:smoke`, and packaged UI export smoke after browser/package changes |
| Analytics or privacy | `bun test src/shared/ripple-analytics.test.ts src/main/lib/analytics.test.ts src/main/lib/config.test.ts` | Packaged PostHog smoke from the release checklist |
| App updates | `bun test src/main/lib/auto-updater-source.test.ts src/main/lib/update-release-config.test.ts src/renderer/components/update-banner.test.ts` | Packaged N-to-N+1 update smoke |
| Packaging/resources/identity | `bun run build && bun run package && bun run test:package:smoke` | `bun run package` must invoke `bun run package:stage`, which invokes `bun run bin:stage`; package smoke must verify `Resources/browser` for exports, then credentialed signed/notarized release workflow |
| Quality docs, workflow matrix, scripts, fixtures | `bun run test:quality` | `bun run test:closeout` |

## Evidence Format

In final notes or release docs, record:

- commands run and pass/fail result
- workflow IDs covered
- manual or credentialed gates not run
- exact blocker when a gate cannot be run
- E2E artifact paths when a desktop workflow was touched

Do not treat a green unrelated command as evidence for a workflow it does not
cover.
