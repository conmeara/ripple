# Analytics Transparency

Ripple works without analytics. Creating projects, opening projects, previewing
motion work, leaving comments, reviewing revisions, importing assets, and
exporting videos do not require analytics, email, hosted auth, GitHub, or a
provider account.

Anonymous analytics are off until the user explicitly turns them on. Local
development and test builds are disabled by default even when PostHog variables
exist. Official builds only send anonymous analytics when all of these are true:

- a Ripple-owned PostHog key and host are configured in the main process
- the runtime is allowed to send analytics
- the user has granted analytics consent
- the event name and properties pass the allowlist and sanitizer

## What Ripple Can Send

Ripple can send coarse product-health facts, such as:

- whether a project was created or opened
- whether preview became ready or failed by category
- whether comments, revisions, and exports are being used
- export format, quality preset, and coarse duration buckets
- non-blocking setup failure categories
- app version, platform, and environment

## What Ripple Never Sends In Anonymous Analytics

Ripple anonymous analytics never include project files, prompts, chats, comment
bodies, media, exports, screenshots, file paths, repository URLs, branch names,
worktree names, raw logs, stdout, stderr, stack traces, secrets, tokens, or
email.

The renderer does not initialize PostHog. Renderer code can only request typed
events; the main process owns consent, configuration, sanitization, provider
initialization, and shutdown.

## Email Updates Are Separate

If a user enters an email and turns on weekly app updates, Ripple may send a
dedicated contact event to PostHog. This is separate from anonymous analytics:

- anonymous analytics use `anon:<installId>`
- update contacts use `contact:<contactId>`
- the two identities are never merged
- email is allowed only in the dedicated contact path
- users can leave analytics off and still opt into update emails

## Crash Reporting

Remote crash and error reporting are off by default. Ripple should not configure
a Sentry DSN in official builds until there is a separate crash-reporting
preference and sanitized exception extras.
