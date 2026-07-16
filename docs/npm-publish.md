# Publishing ripple-video to npm

The npm package exists so `npx ripple-video` works anywhere; plugin installs
still come from the git repo. The name `ripple-video` was unclaimed on the
registry as of 2026-07-14 (`https://registry.npmjs.org/ripple-video` → 404) —
first publish claims it.

## Before every publish

1. **Versions agree.** `package.json`, `.claude-plugin/plugin.json`, and
   `.codex-plugin/plugin.json` must carry the same version —
   `cli/plugin.test.mjs` pins this, so a green suite is the check:

       npm test

2. **Inspect the tarball.** The `files` whitelist ships `bin/`, `cli/`
   (tests excluded by the `!cli/*.test.mjs` negation), `skills/ripple/`,
   `agents/`, `hooks/`, and `schemas/` — plus the npm-mandated `package.json`,
   `README.md`, and `LICENSE`. `docs/` stays out on purpose (README images
   load from GitHub).

       npm pack --dry-run

   Read the file list. No `*.test.mjs`, no `docs/`, no `.claude-plugin/`,
   no `.ripple/` or stray media. Package should stay in the low hundreds
   of kB.

3. **The CLI runs from a clean install.** The bin shim resolves
   `../cli/index.mjs` relative to itself, so a packed install must work:

       npm pack
       npm install -g ./ripple-video-<version>.tgz && ripple --version
       npm uninstall -g ripple-video && rm ripple-video-<version>.tgz

## Publish

    git tag v<version>
    git push origin v<version>
    npm publish

First publish of an unscoped name needs no `--access` flag. If npm asks for
2FA, that's expected — complete it in the browser.

## After publishing

Smoke-test the registry copy exactly the way a new user meets it:

    npx ripple-video@latest doctor

`doctor` prints the environment check envelope (`{ok: ...}`) — it exercises
the bin shim, the ESM entry, and the version read from `package.json` in one
call. Also confirm `npx ripple-video help` lists every command.

If anything is wrong, publish a patch release — never `npm unpublish` a
version others may already have resolved.
