# App Identity and Release Readiness

App Identity is the promise that Ripple looks, launches, packages, and updates like Ripple.

This is mostly invisible when it works. The user sees the right icon in the Dock, the right name in system surfaces, a packaged app that launches without developer setup, and release builds that preserve local-first behavior.

[Release Readiness Screenshot: packaged Ripple app running with Dock icon and release QA checklist]

## App Identity

Expected behavior:

- The app name, Dock icon, window icon, tray/menu presence, and in-app logo all say Ripple.
- Packaged and development builds should not leak inherited 1Code/OpenSpec branding in normal user surfaces.
- User data paths should be Ripple-specific so old developer-tool state does not contaminate the app.
- Release notes, update banners, and package metadata should use motion-tool language.

Identity is not just cosmetics. It prevents users from feeling like they installed an internal developer tool by mistake.

## Packaged App

A packaged build should be usable without a source checkout.

Expected behavior:

| Area | Release expectation |
| --- | --- |
| Runtime assets | App-managed CLIs, browser bundles, templates, and skills are staged |
| Preview | HyperFrames projects open and preview offline |
| Comments/Revisions | Visual comments and generated-change controls work |
| Export | Supported formats render through packaged dependencies |
| Updates | Update checks and restart prompts follow [[App Updates]] |
| Privacy | Analytics and network behavior follow [[Analytics and Privacy]] |

## Release Checklist

Release readiness is evidence, not vibes.

Before a public release, the release owner should preserve command output or notes for:

- Quality/workflow coverage.
- Ripple, HyperFrames, agent, export, and Bun test gates.
- TypeScript and whitespace checks.
- Playwright Electron workflows.
- Packaged release QA.
- Export format smoke.
- Package smoke.
- Update smoke when configured.
- Signing/notarization/stapling status for distributed macOS builds.

For now, this page is the release-readiness spec. If a separate release runbook comes back later, it should derive from this behavior rather than become a second source of truth.

## What Good Looks Like

A tester downloads Ripple, opens it, creates or opens a motion project, previews, comments, accepts/rejects generated work, exports, and updates without seeing repo setup or inherited app identity.

## Test Coverage

- `src/main/lib/config.test.ts` - Guards Ripple app name, user-data paths, and launch config.
- `src/main/lib/packaged-assets.test.ts` - Verifies packaged runtime asset resolution.
- `src/main/lib/hyperframes/package-config.test.ts` - Guards packaged HyperFrames and app-managed binary behavior.
- `src/main/lib/update-release-config.test.ts` - Verifies release workflow, package targets, and update language.
- `test/e2e/release-qa.e2e.ts` - Exercises packaged release workflows across project open, preview, comments, revisions, resize/shortcut resilience, offline posture, and export.
- `scripts/smoke-packaged-ripple.mjs` - Verifies packaged runtime assets and app-managed CLIs.
- `scripts/smoke-packaged-update.mjs` - Verifies packaged update behavior.
