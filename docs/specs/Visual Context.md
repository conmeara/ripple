# Visual Context

Visual Context helps agents see the motion piece.

For frame-based creative work, text is not enough. Ripple should be able to attach the current frame, a selected range, or a frame sheet to [[Comments]] and [[Chats]] so the agent can understand what the user is looking at.

[Visual Context Screenshot: comment card with captured frame thumbnail]

## User Model

The user should not think about screenshots, CLIs, browser sessions, manifests, or capture backends.

They should experience:

- "This comment is about this frame."
- "The agent can see the selected range."
- "The visual check used the current preview."
- "The app is fast enough that capture does not block my note."

## Comment Capture

When the user leaves a comment, the comment card should appear immediately. Ripple should not wait for visual capture before inserting the note.

Visual capture can happen in the background and attach to the comment or agent run when ready. If capture fails, the comment should still exist and the agent should still receive text context.

See [[Comments#Core Journey]].

## Frame Sheets And Snapshots

Agents may need more than one frame.

| Context | Expected use |
| --- | --- |
| Current frame | Precise feedback at a paused moment |
| Range frame sheet | Motion/timing feedback across a selected span |
| Composition snapshot | Visual QA or before/after comparison |
| Current preview capture | What the user is actually seeing, including proposal source |

Visual context should respect whether the user is viewing Main or a proposed revision.

## Speed

Visual prep should not make chats or comments feel stuck.

The first visible user action should happen quickly: message appears, comment card appears, run starts. Capture can be warmed, cached, pooled, or retried underneath, but the UI should not feel like the user is waiting for a screenshot tool.

## Local Artifacts

Generated visual context artifacts are local. They should be scoped to the active project or revision and should not appear as normal source changes unless the user intentionally imports them as [[Assets]].

## App-Owned Service

Ripple owns a Visual Context Service: warm capture sessions, safe project serving, snapshots, frame sheets, comment visuals, and agent tool requests through one tested layer.

That service remains plumbing. Product language should stay visual: current frame, snapshot, frame sheet, selected range, preview.

The service should serialize captures, fall back between available capture backends, invalidate stale captures when source files change, and shut down cleanly. Users should only notice that visual context is fast, local, and attached to the right project/composition.

## What Good Looks Like

The agent makes better visual edits because Ripple quietly shares the right frame or range. The user never has to perform manual capture, and visual context never slows down the act of leaving feedback.

## Test Coverage

- `src/cli/frame-sheet.test.ts` - Samples frame sheets, writes manifests/frames/sheets, and rejects unsafe output/project paths.
- `src/cli/visual.test.ts` - Exercises snapshot and frame-sheet CLI behavior, endpoint delegation, current-frame requirements, and compatibility aliases.
- `src/main/lib/agent-runtime/visual-context-handoff.test.ts` - Prevents eager visual capture from blocking startup unless explicitly enabled.
- `src/main/lib/hyperframes/visual-capture-qa.test.ts` - Covers visual capture QA fixtures for HyperFrames-backed capture.
- `src/main/lib/revisions/comment-visual-policy.test.ts` - Captures visual context by default unless disabled or already attached.
- `src/main/lib/revisions/comment-visuals.test.ts` - Stores frame/range comment visuals, loads them as runtime attachments, and rejects symlink escapes.
- `src/main/lib/visual-context/backends/hyperframes-engine-spike.test.ts` - Proves Engine-backed capture behavior for visual context.
- `src/main/lib/visual-context/backends/media-spike.test.ts` - Exercises media capture feasibility for visual context.
- `src/main/lib/visual-context/backends/producer-capture-spike.test.ts` - Proves Producer capture fallback/correctness behavior.
- `src/main/lib/visual-context/backends/transparency-spike.test.ts` - Covers transparency-related capture behavior.
- `src/main/lib/visual-context/composition-targeting.test.ts` - Resolves visual capture targets to the intended composition.
- `src/main/lib/visual-context/endpoint.test.ts` - Protects endpoint token, workspace, output, and verified current-frame capture behavior.
- `src/main/lib/visual-context/lifecycle.test.ts` - Runs visual-context disposers safely on shutdown.
- `src/main/lib/visual-context/manifest.test.ts` - Builds stable project-relative frame-sheet manifests.
- `src/main/lib/visual-context/project-server.test.ts` - Serves project files safely while denying traversal, hidden, generated, and credential-like paths.
- `src/main/lib/visual-context/sampling.test.ts` - Samples ranges and timestamps within count/column bounds.
- `src/main/lib/visual-context/service.test.ts` - Serializes captures, falls back between backends, rejects shutdown work, and records metrics.
- `src/main/lib/visual-context/sheet-assembly.test.ts` - Builds deterministic FFmpeg tile commands and errors when candidates fail.
- `src/main/lib/visual-context/source-invalidation.test.ts` - Invalidates visual context when watched source changes.
- `test/e2e/agent-visual-context-live.e2e.ts` - Runs a real provider against the current app frame and verifies visual checks in SQLite.
- `test/quality/visual-context-matrix.test.ts` - Tracks quality and speed expectations for visual-context paths.
