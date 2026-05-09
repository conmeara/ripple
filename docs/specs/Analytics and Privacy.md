# Analytics and Privacy

Ripple should work with analytics off.

Analytics are optional, off by default, and meant only for product-health signals. They must never become part of project creation, preview, comments, revisions, export, or provider setup.

[Privacy Screenshot: analytics toggle with transparency link]

## User Choice

The user can choose anonymous analytics during [[Onboarding]] and change the choice later in [[Settings]].

The copy should be clear and trust-first:

- Off by default.
- Anonymous product analytics only.
- Public transparency link.
- No project contents.
- No prompts, comments, chats, media, paths, exports, or secrets.

## What Analytics Can Track

Analytics can help answer whether the product workflow is healthy.

Allowed examples:

- Project created/opened.
- Preview reached ready state or failed.
- Comment created.
- Revision accepted or failed.
- Export started/completed/failed.
- Onboarding completed.
- Setup readiness failed.

Events should use Ripple product language, not inherited developer-tool naming.

## What Analytics Must Never Send

Never send:

- Project files or media.
- Prompts.
- Chat messages.
- Comment text.
- Screenshots or frame sheets.
- Export files.
- Absolute local paths.
- Repository URLs.
- Branch/worktree names.
- Secrets, tokens, provider credentials, or email in anonymous analytics.

## Email Is Separate

Optional email/update contact preferences are separate from analytics.

Entering an email can opt the user into Ripple updates if the product supports that path. It does not turn analytics on. Turning analytics on does not send email.

Any email-bearing contact path must use a separate contact identity and never merge with the anonymous analytics identity.

## Failure Behavior

| Condition | Expected behavior |
| --- | --- |
| Analytics off | No product analytics events sent |
| Analytics unconfigured | App behaves normally |
| Offline | Events can be skipped or queued safely, never block UX |
| Provider fails | Disable analytics capture path, preserve local work |
| User turns off analytics | Stop future anonymous captures |

Remote crash/error reporting should be treated with the same privacy caution and remain off unless a separate consent path exists.

## What Good Looks Like

The user can trust the app with local creative work. Analytics, if enabled, help improve the product without collecting the work itself.

## Test Coverage

- `src/main/lib/analytics.test.ts` - Enforces explicit consent, sanitized capture, consent revocation, first-permitted launch markers, and separate update-contact capture.
- `src/shared/ripple-analytics.test.ts` - Accepts documented coarse events and rejects unknown names, raw identifiers, emails, paths, repo URLs, logs, and token-like values.
- `src/main/lib/config.test.ts` - Keeps analytics disabled unless configured official builds or explicit force mode allow it.
