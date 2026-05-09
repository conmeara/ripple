# Spec Index

This folder is the product behavior map for Ripple.

The audience is future agents, designers, and builders who need to understand what good looks like from the user's side of the interface. These docs are not architecture plans and not implementation checklists. They describe the app people should feel they are using: a local-first motion review and editing tool where agents do the editing work and the user directs, reviews, compares, and accepts.

Use [[Comments]] as the depth reference. It is intentionally a little richer because comments touch preview, timeline, agents, revisions, and Main.

## Core Loop

[[Project Entry]] -> [[Templates]] -> [[Preview]] + [[Timeline]] -> [[Chats]] or [[Comments]] -> [[Revisions]] -> [[Exports]]

The user should never need to think in Git, worktrees, branches, package installs, Node, FFmpeg, provider protocols, or repository setup during the normal loop. Those systems can exist behind the product, but the primary language is project, composition, preview, comment, chat, proposed changes, Main, and export.

[Index Screenshot: full workspace annotated with project, preview, timeline, chat/comments, and renders]

## Product Foundation

- [[Project Description]]
- [[Local First Launch]]
- [[Onboarding]]
- [[Project Entry]]
- [[Project Management]]
- [[Shell Layout]]

## Motion Workspace

- [[Templates]]
- [[Compositions]]
- [[Assets]]
- [[Preview]]
- [[Timeline]]
- [[Exports]]

## Agentic Review

- [[Chats]]
- [[Voice Input]]
- [[Comments]]
- [[Revisions]]
- [[Active Conversations]]
- [[Agent Connections]]
- [[Agent Context and Skills]]
- [[Visual Context]]
- [[Message Rollback]]

## Trust And Utility

- [[Settings]]
- [[Analytics and Privacy]]
- [[App Updates]]
- [[App Identity and Release Readiness]]
- [[Failure Recovery]]
- [[Local Project Safety]]
- [[Advanced Utilities]]
- [[Offline Mode]]
- [[Automations and Inbox]]

## How To Read These Specs

Each page should answer practical product questions:

- What is the user trying to do?
- What do they click, see, compare, and decide?
- What does the app hide or simplify?
- What happens when the feature is loading, empty, successful, stale, failed, or interrupted?
- Which other specs does this behavior depend on?

Tables are welcome when they make state or button behavior easier to scan. Screenshot placeholders should stay inline, in the place where an actual pasted Obsidian image would clarify the UX.

## Testing Direction

Later tests should validate behavior against these docs. A good test does not merely assert that a component renders. It proves that the user can complete the product action described here and that Ripple keeps the promise of the interface.

Examples:

- A comment appears immediately after send and later becomes a previewable proposed change.
- View Main switches the preview source without losing time.
- Export Current Preview exports the proposed version, not accidentally Main.
- Missing agent setup blocks only the action that needs an agent, not local project creation.
- Analytics off still allows create, preview, comments, revisions, and export.

## Test Coverage

- `package.json` scripts - Defines the named gates (`test:ripple`, `test:ux`, `test:agent`, `test:hyperframes`, `test:quality`, `test:e2e`, `test:closeout`) that future work should use to validate these specs.
- `test/quality/workflow-coverage.test.ts` - Maps v1 workflows to automated or release-gated evidence and keeps future-agent closeout commands wired.
- `test/e2e/release-qa.e2e.ts` - Exercises release-level workflows that span project open, preview, comments, revisions, resizing, shortcuts, and export.
- `test/quality/hyperframes-fixtures.test.ts` - Keeps the title-card fixture renderable and deterministic as a stable app-wide motion fixture.
