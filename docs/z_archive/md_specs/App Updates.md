# App Updates

App Updates let the user keep Ripple current without interrupting local creative work.

Updates should feel like normal desktop app maintenance: background checks when allowed, manual checks anytime, explicit download/install states, and no surprise restarts.

[Updates Screenshot: App Updates settings with automatic checks, early access, update available, and restart action]

## Where Updates Live

Updates belong in [[Settings]] and app-level menus/banners. They should not appear as a first-run decision in [[Onboarding]].

Manual Check Now should always be visible in Settings, even when automatic checks are disabled.

## Preferences

| Preference | Behavior |
| --- | --- |
| Automatic Checks | Let Ripple check for updates in the background |
| Early Access | Use beta channel when enabled |
| Manual Check Now | Force a check when clicked |

For the first local-first release, automatic update checks should be opt-in. Manual Check Now should work even when automatic checks are off.

If a later release changes the default, the onboarding/settings copy should make that network behavior clear and reversible.

## Update States

| State | User sees | Action |
| --- | --- | --- |
| Idle | Manual checks are available | Check Now |
| Checking | Checking for app updates | Wait |
| Available | Version is available | Download |
| Downloading | Progress percent | Wait/cancel if supported |
| Ready | Ready to install | Restart to update |
| Not available | Up to date | None |
| Error | Readable error | Try again later |

Restart to update must be explicit. Do not restart in the middle of a creative session without user action.

## Release Details

When an update is available, show version, release date, and release notes if available. Provide a link to the release page.

Release details should be useful but not overwhelming. The main question is whether the user wants to update now.

## Packaged Versus Dev Builds

In development or unconfigured builds, update checks may be unavailable. The UI should say that clearly instead of looking broken.

Example: "Update checks are available in packaged builds."

Update behavior is also part of [[App Identity and Release Readiness]] because packaged builds must prove the app can discover, download, and install updates without surprising the user.

## What Good Looks Like

The user stays in control. Ripple can tell them an update exists, download it when asked, and restart only when they click the install/restart action.

## Test Coverage

- `src/main/lib/auto-updater-source.test.ts` - Guards GitHub update config, automatic check defaults, beta discovery, and explicit restart installs.
- `src/main/lib/update-release-config.test.ts` - Verifies official release publishing, macOS package targets, workflow permissions, and update settings language.
- `src/renderer/components/update-banner.test.ts` - Requires explicit restart after download and opens version-specific release pages.
