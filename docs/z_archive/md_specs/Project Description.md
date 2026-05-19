# Project Description

Ripple is a local-first desktop app for creating short motion graphics with agents.

The user opens a project, previews a composition, asks for changes in [[Chats]] or leaves frame-based review notes in [[Comments]], compares proposed changes against Main, accepts the good work, and exports a video through [[Exports]].

The important product idea is simple: the agent is the editor. The user is the creative director, reviewer, owner, marketer, founder, or motion designer steering the work.

[Project Screenshot: full Ripple workspace with preview, timeline, project pane, and review pane]

## Who Ripple Is For

Ripple is for people making title cards, lower thirds, promos, app demos, social clips, explainers, and brand motion pieces.

They might be motion designers who know what they want, editors who need fast variations, founders who need a polished product video, or agency teams reviewing creative work. They should not have to become developers to use the app.

## Core User Promise

The user should be able to:

- Create or open a local motion project.
- Start from a useful [[Templates|template]].
- Preview the active [[Compositions|composition]] immediately.
- Scrub timing in [[Timeline]].
- Ask an agent for creative changes in [[Chats]].
- Leave frame or range comments in [[Comments]].
- Review proposed [[Revisions]] without touching Main.
- Accept changes into Main only when they decide.
- Export a shareable file in [[Exports]].

The app should feel like a motion review and editing workspace, not a Git client, code editor, package manager, or terminal wrapper.

## Product Loop

| Step | User sees | Ripple handles |
| --- | --- | --- |
| Start | Create Project or Open Existing Project | Local app launch, database, app resources |
| Create | Name, template, project folder | Scaffold, metadata, hidden project setup |
| Preview | Player, timecode, timeline | HyperFrames runtime and source validation |
| Direct | Chat prompt | Agent run inside the right project context |
| Review | Frame comment | Isolated proposed version and short agent result |
| Compare | Main vs proposed changes | Preview target switching and time preservation |
| Accept | Accepted changes | Safe apply into Main and stale proposal handling |
| Export | Format, quality, queue | Render job, output path, open/reveal |

## Hidden Complexity

Ripple can use Git, worktrees, SQLite, HyperFrames, FFmpeg, Codex, Claude, MCP, skills, packaged resources, and local files. The normal interface should translate all of that into product language.

Use this translation:

| Implementation idea | User-facing idea |
| --- | --- |
| Git repository | Project history or local project |
| Worktree | Proposed version or generated changes |
| Branch/commit | Main, accepted changes, or history |
| CLI/runtime/dependencies | Local setup or project readiness |
| Provider run | Agent is working |
| Diff/patch/merge | Changes are ready or accepted |

The exception is [[Advanced Utilities]], where advanced users can intentionally inspect lower-level details.

## Good Ripple Behavior

Ripple succeeds when a user can stay in creative language. They say "make this lower third slower," "use the white logo here," or "this frame feels crowded," and the app turns that into motion project edits, previews, reviewable proposals, and exports.

Agents building Ripple should favor behaviors that preserve the creative loop: quick preview, clear compare states, safe acceptance, visible recovery, and hidden plumbing.

## Test Coverage

- `src/shared/app-identity.test.ts` - Keeps Ripple app identity and legacy user-data migration boundaries separate.
- `src/main/lib/dock-icon.test.ts` - Verifies light/dark macOS dock icon assets stay aligned with the Ripple brand.
- `src/main/lib/user-data-migration.test.ts` - Protects local user-data migration behavior as Ripple evolves away from inherited app state.
- `src/main/lib/config.test.ts` - Keeps hosted services optional, rejects legacy service URLs, and reserves Ripple-owned env names.
