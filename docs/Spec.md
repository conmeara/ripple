
## Principles

- HyperFrames is the video framework.
- Ripple should hide Git, worktrees, dependency setup, and developer tooling from end users.
- Authentication must not be required to start using the app.
- Rebrand must be completed end-to-end. No `21st.dev`, `1Code`, or upstream product assumptions should remain in the shipped Ripple product.

Ripple is not "OneCode with a custom preview tab."

Ripple should be implemented as:

- OneCode’s strong desktop/chat/agent/revision foundation
- plus a Ripple-specific motion-graphics shell
- plus native HyperFrames editing, preview, comments, and export
- while leaving broader OneCode systems intact unless they directly conflict

## Remove, Replace, or Reframe From OneCode

### 1. Remove mandatory auth gating

- Remove mandatory `21st.dev` auth checks that block app entry.
- Keep enough auth plumbing so optional account sign-in can exist later.
- Keep sign-in as an optional secondary feature in settings, not as the activation path.
- Keep provider configuration surfaces, but move them to settings, first-agent-run setup, or another point-of-need flow instead of hard-gating app boot.

### 2. Replace repo-first onboarding with project-first onboarding

Target behavior:

- Primary entry is "Create project" or "Open project," not "connect repo" or "clone repo."
- The user should not need to understand GitHub, branches, repos, or dependency installation.

Primary flows:

- Create a new Ripple project
- Open an existing Ripple project
- Import an existing local folder as a secondary advanced path

What to hide from primary UX:

- Clone-from-GitHub-first flows
- Repo terminology as the main user-facing language
- Developer-first project setup expectations

### 3. Remove all upstream branding and service assumptions

Must remove:

- `21st.dev` endpoints and assumptions
- `1Code` name and product strings
- upstream protocol/deep-link names
- upstream analytics destination assumptions
- upstream update URLs
- upstream auth server assumptions

Allowed:

- retain local abstractions or interfaces if they help future optional Ripple services
- but the shipped app cannot be coupled to upstream services

### 4. Replace generic coding preview assumptions with HyperFrames-native behavior

Target behavior:

- Preview is a first-class motion-graphics surface
- timeline is first-class
- frame/time-based feedback is first-class
- export is first-class

Do not build Ripple around:

- generic app-preview URL inputs
- generic dev-server previews as the main mental model
- repo/sandbox preview gating

## Ripple-Specific Additions

### 1. HyperFrames-native project model

Each Ripple project should be a HyperFrames project with a predictable structure stored in a Ripple-managed local folder.

Project expectations:

- `index.html` top-level entry composition
- `compositions/` for reusable or nested compositions
- `assets/` for media imports
- metadata/config files as needed by Ripple
- validation and render tooling driven by HyperFrames conventions

What Ripple should own:

- project creation
- default project scaffolding
- default local project storage in a Ripple-managed folder
- automatic dependency install / setup during project creation
- hidden git initialization for local revision infrastructure where useful
- aspect ratio presets
- asset import experience
- local environment checks

Project creation requirements:

- Ripple should create a dedicated top-level Ripple folder in the user’s home directory by default, with each project stored inside it
- the normal path should be `~/Ripple/<project-name>`
- folder creation, naming sanitization, collision handling, template copying, and initial setup should all happen automatically
- dependency installation should start automatically in the background as part of setup
- if Ripple needs a hidden git repo / initial commit for revisions, that should be created automatically without exposing git setup to the user
- users should not need to pick a folder manually unless they are explicitly using an advanced import/open-existing flow
- the UI should make this understandable in simple language, for example by telling the user that Ripple will create the local project folder for them automatically

What Ripple should hide:

- manual folder setup for the normal create-project flow
- manual dependency installation steps
- manual git initialization
- raw CLI complexity
- Node/FFmpeg troubleshooting unless something is actually broken

### 2. Ripple shell layout and information architecture

Ripple should preserve the overall app-shell feeling of the UI already designed, but repurpose the inner panes around HyperFrames concepts.

Target layout:

- far-left rail = Ripple project sidebar
- center pane = conversation and comment thread
- secondary pane to the left of the active conversation area = assets / compositions pane
- right editor region = HyperFrames preview/editor/studio surface

#### Far-left project rail

Keep a Ripple-style left rail for:

- search
- new project
- project list
- settings/help/profile/footer actions as needed

This rail should stay Ripple-native in style and should not become a raw HyperFrames panel.

#### Assets / compositions pane

The pane that upstream/current shell patterns use for chat or sub-chat navigation should be repurposed into a studio-oriented project pane.

This pane should contain:

- assets
- composition structure
- compositions
- templates
- project file navigation where useful

It should be inspired by HyperFrames Studio and FileTree concepts, but it should fit Ripple’s layout and component system.

Primary expectation:

- it is no longer mainly a list of chats
- it becomes the place where users browse imported media, templates, and composition structure inside a project

#### Conversation / comment pane

The main center pane should remain the conversation surface, with two modes: `Chat` and `Comment`.

This pane should support:

- normal prompting
- chat threads
- frame/time-based revision requests
- review context for accept/reject flows

In other words:

- keep the OneCode/Ripple chat strength
- but make that surface work equally well for motion-editor feedback

#### Project and composition model in the UI

Each project can contain multiple HyperFrames compositions.

Ripple should expose:

- the top-level composition
- reusable or nested child compositions
- composition switching / browsing within a project
- the relationship between top-level and nested compositions inside a project

Based on HyperFrames’ composition model:

- `index.html` is typically the top-level entry composition
- nested or reusable compositions live under `compositions/`
- any composition can be nested inside another; HyperFrames does not define a special master/root composition type
- a top-level composition can arrange or combine multiple child compositions through `data-composition-src`

The UI should make this understandable without developer terminology.

### 3. HyperFrames Studio embedded into Ripple

Ripple should use HyperFrames Studio as a core UI surface, not recreate a parallel editor if avoidable.

Per official HyperFrames docs:

- `npx hyperframes preview` launches the studio automatically
- `@hyperframes/studio` is the browser-based visual editor package
- the studio exports React components and hooks for layout, preview, timeline, editor, property inspection, and player control

Ripple should integrate these capabilities directly into the product:

- visual timeline
- live preview
- player controls
- file tree
- source editor
- property panel / inspector
- composition breadcrumbs / nested composition navigation

Minimum expected studio-side components and exports to leverage where appropriate:

- `StudioApp`
- `NLELayout`
- `NLEPreview`
- `Player`
- `PlayerControls`
- `Timeline`
- `PreviewPanel`
- `AgentActivityTrack`
- `SourceEditor`
- `PropertyPanel`
- `FileTree`
- `CompositionBreadcrumb`
- `useTimelinePlayer`
- `resolveIframe`

Implementation rule:

- Prefer using or embedding official studio components over rebuilding bespoke equivalents.
- Only replace or wrap them when Ripple has a strong product-specific need.

Preview/product behaviors to preserve from current Ripple:

- Ripple should auto-discover available compositions in the project rather than requiring the user to wire each one up manually in the UI.
- The preview surface should let the user switch the active composition quickly.
- Preview should auto-refresh when project files change and show clear syncing/error states.
- Ripple should provide an explicit escape hatch to open the project in full HyperFrames Studio when the integrated UI is not enough.

#### Design system rule

Ripple should borrow as much interaction logic and structure from HyperFrames Studio as possible, but it should not ship HyperFrames UI wholesale.

Target rule:

- HyperFrames supplies behavior, editing model, and panel structure
- Ripple supplies product chrome, component styling, buttons, menus, dropdowns, and overall visual identity

Practical example:

- the timeline can stay close to HyperFrames behavior and layout
- but toolbar controls, buttons, selectors, and surrounding chrome should match Ripple’s existing component style

### 4. Frame.io-style comment workflow

This is Ripple’s main UX addition versus OneCode.

Target model:

- Users can leave comments on a frame, time range, scene, composition, or visible element context.
- When a comment is created, Ripple automatically captures and attaches the relevant context for the agent: a screenshot or still frame, the selected frame or selected time range, the active composition/project context, and the related conversation or revision prompt context.
- The agent responds inside an isolated revision context.
- That isolated revision context may use a worktree, but it does not have to if another model better supports concurrency and review.
- If multiple comment threads target the same project at the same time, Ripple should still allow multiple agent revisions to proceed in parallel and be reviewed independently.
- When the agent finishes, the user can preview the result and either accept or reject it.

Review requirements:

- show the resulting visual output for a revision
- show the related comment context
- show the captured frame/range context that was sent to the agent
- show changed files or changed elements when useful
- allow explicit accept
- allow explicit reject
- make it obvious which revision is currently proposed versus approved

Implementation requirements:

- One comment thread or revision request maps to one isolated revision context
- the isolation backend may be a worktree, snapshot, sandbox, or another implementation that preserves independent reviewable revisions
- creation, switching, cleanup, and merge/apply mechanics are hidden from end users
- accepted revisions apply cleanly into the primary project state
- rejected revisions are discarded cleanly
- the frame/range commenting interaction should feel familiar to motion-design review tools such as Frame.io
- if HyperFrames does not ship this exact interaction out of the box, Ripple should build it on top of the official player/timeline/studio primitives rather than replacing the preview runtime

OneCode’s existing diff/review foundations should be reused where useful, but the user-facing frame should be motion-design-first instead of code-review-first.

User-facing language should avoid:

- branch
- worktree
- cherry-pick
- rebase
- stash

Preferred user-facing language:

- comment
- revision
- proposal
- version
- accept
- reject

### 5. HyperFrames-native export

Export is part of the primary workflow, not an add-on.

- Ripple should adopt HyperFrames’ native rendering/export capabilities rather than inventing a separate export system.
- Supported formats should follow HyperFrames’ documented outputs: `MP4`, `MOV`, and `WebM`.
- `MP4` should remain the default delivery format for common exports.
- `MOV` and `WebM` should be available when the user needs transparency or a different downstream workflow.

Export UX must include:

- obvious export entry point
- format selection aligned with HyperFrames-supported outputs
- quality/settings surfaces that map cleanly to HyperFrames where appropriate
- progress
- error handling
- output destination selection
- success state

### 6. Templates and bundled HyperFrames context

HyperFrames docs currently expose both starter templates/examples and a catalog of reusable blocks/compositions.

Ripple should plan for:

- a visual template gallery for new compositions inside an existing project
- preview cards for official HyperFrames starters such as `warm-grain`, `play-mode`, `swiss-grid`, `kinetic-type`, `decision-tree`, `product-promo`, `nyt-graph`, `vignelli`, and `blank`
- reusable motion blocks
- reusable lower thirds / title cards / transitions / social overlays
- a Ripple template library built on top of HyperFrames conventions
- bundled HyperFrames starter templates/examples available inside the app

Product requirements:

- Project creation should not require choosing from a template gallery; a project can start from Ripple’s default HyperFrames-ready scaffold.
- That default scaffold should be immediately previewable and should demonstrate the HyperFrames composition model clearly, ideally including a top-level composition and at least one nested/reusable composition.
- Users should be able to preview a composition template, understand its format/use case, and click to insert or scaffold it without touching the CLI.
- Selecting a composition template should immediately open the resulting composition context into the active editor flow rather than dropping the user into a blank shell first.
- Users should be able to insert or scaffold new compositions from templates from inside an existing project.
- Ripple can standardize on the word `Template` in the UI even if official HyperFrames docs use both `templates` and `examples`, but the underlying implementation should map cleanly to the official HyperFrames starter assets.
- Ripple should bundle HyperFrames skills, template assets, and app-level agent context so users are not blocked on extra setup before the agent can work effectively.

## Implementation Constraints

These requirements come from current HyperFrames docs and should shape the implementation.

### Runtime and rendering

- HyperFrames requires Node.js `22+`
- local rendering requires FFmpeg
- `npx hyperframes doctor` can verify environment
- `npx hyperframes preview` launches studio with hot reload
- `npx hyperframes render --output output.mp4` renders final output
- Ripple should use HyperFrames’ export/render flow as the underlying source of truth
- local rendering is fine for MVP, but the implementation should leave a clear path to deterministic/Docker rendering later

Ripple requirement:

- Ripple must detect and guide around these dependencies automatically.
- Ideally the user should experience this as app setup / environment readiness, not as raw CLI setup.

### Composition and preview model

HyperFrames compositions are plain HTML, not React components.

Important rules the coding agent must preserve:

- root composition needs `data-composition-id`, `data-width`, and `data-height`
- timed elements need `data-start`, `data-duration`, `data-track-index`, and `class="clip"`
- GSAP timelines must be registered on `window.__timelines`
- nested compositions should use `data-composition-src` and `<template>` wrappers for reusable external compositions

Ripple implication:

- Ripple’s editing and agent prompts must operate on HyperFrames HTML compositions and GSAP timelines
- not on React/Remotion abstractions

Preview integration rules:

- `@hyperframes/player` uses a sandboxed iframe in Shadow DOM
- `@hyperframes/studio` uses an iframe preview, runtime bridge, timeline parser, and hot reload
- custom editor tooling can access the underlying iframe through `iframeElement` or `resolveIframe`
- if Ripple embeds its own custom frame comments, overlays, or controls around the studio/player, it should integrate through the official player/studio bridge model
- not by building a separate ad hoc preview runtime

### Agent behavior and authoring rules

Ripple’s coding agent must behave like a motion editor working on HyperFrames projects, not like a general app developer.

- HyperFrames is designed for AI-agent workflows
- its official skills teach composition authoring, CLI flows, and GSAP patterns
- prompts should target HTML compositions, timing, captions, transitions, and assets
- Ripple should ship bundled HyperFrames-aware agent context and skills by default
- Ripple should also ship any app-level CLAUDE/system prompt context needed to teach the agent Ripple’s motion-design workflow by default
- agent prompts and internal instructions must target HyperFrames HTML + GSAP
- remove any Remotion-specific guidance
- remove any prompt guidance that encourages React/Vue composition authoring for motion scenes

The agent implementation should respect these HyperFrames constraints:

- no unseeded randomness in render logic
- no async timeline construction that blocks deterministic setup
- do not rely on wall-clock-driven animation logic
- keep media playback lifecycle framework-managed through data attributes
- do not replace HyperFrames’ clip timing system with custom script timing

## Auth and Analytics Model

- Local use must not require an account.
- Optional sign-in may exist later for settings, sync, or future cloud features.
- Analytics must not depend on mandatory sign-in.
- If analytics remain, they should work with anonymous local identifiers.
- Remove analytics plumbing that assumes upstream hosted auth.
- Remove analytics hardcoded to upstream product identity.

## UX Language Rules

Ripple should sound like a motion-design tool, not a devtool.

Prefer:

- project
- scene
- composition
- clip
- timeline
- comment
- revision
- export
- preview

Avoid in primary user-facing UX:

- repo
- branch
- worktree
- clone
- PR
- sandbox
- dependency install

Internal implementation can still use these concepts where useful.


## Acceptance Checklist

The rebuild is successful when all of the following are true.

### Core flow

- User can open Ripple and start without signing in
- User can enter the main product shell without first choosing a provider or completing auth
- User can create a new HyperFrames-backed Ripple project without understanding repos or installs
- User can create a project without having to choose from a template gallery first
- User can create a project without manually choosing a folder; Ripple creates it automatically inside the default Ripple project directory
- Ripple handles hidden setup work such as dependency install and local revision/git preparation automatically
- User can start a new composition from a visual template gallery
- User can still open/import an existing local folder through a secondary advanced path

### Editor and preview

- User can understand the app through a clear four-part layout:
  - project rail
  - assets/compositions pane
  - conversation/comments pane
  - preview/editor/timeline pane
- User can preview the project through an embedded or integrated HyperFrames Studio experience
- Ripple auto-discovers compositions and lets the user switch between them in preview
- Preview refreshes automatically as files change and exposes a clear "Open in HyperFrames Studio" escape hatch
- User can work with timeline, preview, and source/properties in one coherent interface
- HyperFrames Studio behavior is present, but the visible controls and chrome feel like Ripple rather than stock HyperFrames
- User can configure and use the preserved agent/provider options that matter to Ripple, including Claude Code, API-key/custom-model flows, and Codex support
- User can import assets into the project
- User can browse compositions within a project, including a top-level composition and nested/reusable compositions

### Comments and revisions

- User can leave frame/time-based comments
- The agent automatically receives screenshot + frame/range context for a comment
- A comment revision runs in an isolated revision context behind the scenes
- User can preview the resulting revision
- User can accept or reject the revision

### Output and packaging

- User can export through HyperFrames-supported formats needed by Ripple, including MP4, MOV, and WebM
- HyperFrames skills, bundled templates, and bundled app-level agent context are available without extra manual setup
- Multi-provider support still works, and the kept OneCode systems such as automations/inbox, kanban, file viewer, plugin surfaces, MCP, and voice input are still present unless intentionally deferred in a later scoped pass
- No shipped Ripple path depends on `21st.dev` branding or mandatory upstream auth
- No Remotion codepath remains in the motion-graphics product

## Official HyperFrames References

Use these as the primary implementation references.

- [HyperFrames Introduction](https://hyperframes.heygen.com/introduction)
- [HyperFrames Quickstart](https://hyperframes.heygen.com/quickstart)
- [HyperFrames Rendering Guide](https://hyperframes.heygen.com/guides/rendering)
- [HyperFrames Prompt Guide](https://hyperframes.heygen.com/guides/prompting)
- [HyperFrames Compositions](https://hyperframes.heygen.com/concepts/compositions)
- [HyperFrames Data Attributes](https://hyperframes.heygen.com/concepts/data-attributes)
- [HyperFrames Frame Adapters](https://hyperframes.heygen.com/concepts/frame-adapters)
- [HyperFrames Templates](https://hyperframes.heygen.com/templates)
- [HyperFrames Examples](https://hyperframes.heygen.com/examples)
- [@hyperframes/studio](https://hyperframes.heygen.com/packages/studio)
- [@hyperframes/player](https://hyperframes.heygen.com/packages/player)
- [@hyperframes/producer](https://hyperframes.heygen.com/packages/producer)
- [HyperFrames GitHub Repo](https://github.com/heygen-com/hyperframes)
