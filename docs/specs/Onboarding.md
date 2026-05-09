# Onboarding

Onboarding is a compact first-run dialog over [[Project Entry]]. It should help the user make trust and agent-connection choices without turning the first session into setup homework.

The dialog has two staged pages: preferences first, agent connection second. Both pages are skippable. Skipping should reveal the same project entry screen, not a dead end.

[Onboarding Screenshot: preferences page over project entry]

## Page One: Preferences

The first page asks only for lightweight trust choices.

- Optional email for Ripple updates.
- Optional anonymous analytics toggle, off by default.
- A transparency link for what analytics can and cannot send.
- Continue and skip actions.

Email is not account creation. It should not imply sync, recovery, sign-in, cloud storage, or hosted project access. Leaving it blank means no update email preference.

Analytics is separate from email. Turning analytics on never gives permission to send email. Entering email never turns analytics on.

See [[Analytics and Privacy]] for the full privacy contract.

## Page Two: Connect Your Agent

The second page shows Codex and Claude Code as the two primary agent paths.

[Onboarding Screenshot: Codex and Claude provider cards]

Each provider card should show:

- Provider name.
- Secondary runtime detail, such as Codex App Server or Claude Agent SDK.
- Checking, Ready, or Setup needed state.
- Connect or Manage connection action.

Provider setup is useful because agents are core to Ripple, but it is not a gate. The user can set up later and still create, preview, comment manually, manage assets, and export local projects.

## Buttons And States

| Control | Behavior |
| --- | --- |
| Continue | Saves page-one choices and moves to agent connection |
| Skip / Set up later | Marks onboarding complete enough to enter the app |
| Connect | Opens the explicit provider setup modal |
| Manage connection | Opens the same setup surface for a ready provider |
| Start creating | Dismisses onboarding and returns to project entry |

Provider setup modals may include technical details only after the user clicks Connect. The first-run card itself should stay plain.

## Focus And Motion

The dialog should own focus while open. The project name field behind it should not autofocus or create accessibility warnings.

Motion should be subtle: dialog entry, page transition, card status updates. No marketing hero, no long onboarding tour, no feature checklist.

## Persistence

Onboarding state should be local and respectful.

- Do not reshow the dialog after completion unless the user resets onboarding.
- Do not save email until the user completes or confirms the preference step.
- Preserve provider readiness as live status, not as stale copy.
- Let Settings change email, analytics, update checks, and provider connections later.

## What Good Looks Like

The user understands three things quickly: Ripple saves work locally, analytics is optional, and they can connect Codex or Claude when they are ready. Then the app gets out of the way.

## Test Coverage

- `src/renderer/features/onboarding/ripple-onboarding-state.test.ts` - Models first-run visibility, separate email/analytics/update choices, and no anonymous analytics email leakage.
