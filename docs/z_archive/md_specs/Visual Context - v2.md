
Agents see the user's projects through code. They can read files, but it is often hard for them to understand exactly how the work renders. Visual Context gives agents a fast way to see the frame or range they are working on so they can make better changes.

Ripple provides visuals as a service to agents. The goal is speed and quality: the user keeps working, and the agent gets enough visual evidence to understand the project.

There are three needs:

1. Current Frame - what the user is looking at right now.
2. Certain Frame - a specific timestamp in a known composition.
3. Frame Sheet - a small grid of frames from a range, sampled at a useful cadence.

## Product Behavior

1. Agents in chat can request frames and frame sheets through Ripple's visual tools.
2. Point comments automatically attach the frame at the comment timestamp.
3. Range comments automatically attach a frame sheet for the selected range.
4. The comment or chat should appear first. Visual capture happens in the background.
5. If visual capture fails, the comment or chat still exists and the agent still gets the text.

## Routing

| Need | Best source | Notes |
| --- | --- | --- |
| Current Frame | Live preview | Should match the project, composition, revision, time, and frame the user is seeing. If current preview context is missing, fail clearly instead of guessing. |
| Certain Frame | Rendered frame from project source | Should use the project, composition, revision, and timestamp. Do not move the user's visible preview just to capture this. |
| Frame Sheet | Rendered samples across a range | Should include a manifest that maps each cell to its timestamp or frame, so the agent can refer to exact moments. |

## Rules To Keep

- Ripple owns visual capture. Agents use Ripple visual commands instead of setting up browser capture or choosing capture backends.
- Product language should stay simple: current frame, selected range, snapshot, frame sheet, preview.
- Visual context must respect whether the user is viewing Main or a proposed revision.
- Visual artifacts are local and project-scoped. They should not appear as normal source changes or assets unless the user imports them.
- Frame sheets should be compact and bounded: enough samples to understand motion, not a huge payload.
- User-provided attachments matter more than automatic visuals when attachment limits are reached.
- Source changes should invalidate stale visuals. If Ripple is not sure the visual still matches the preview, it should make a fresh one.
- Ripple should prepare one local visual artifact first, then send it to the chosen agent provider in the right format.

## Vision

The user leaves feedback without waiting. The agent can see the frame or range the user meant. Ripple captures a local visual artifact, attaches it to the agent run in the provider's native format, and keeps the image path plus manifest available for timing details and fresh visual checks.

## Architecture

The standard way for agents to get visual artifacts is to invoke the Hyperframes CLI tool. There are many efficiencies to be gained and we have setup an eval suite to test all possible methods. The visual context service will always utilize the fastest method that meets the quality bar.
