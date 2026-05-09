# Comments

Comments are Ripple's Frame.io-style review layer for agent-made motion work.

In a normal video workflow, an editor makes a draft, posts it to Frame.io, and a client, stakeholder, or creative director leaves notes. The editor then goes back into the project and makes those changes. In Ripple, the agents are the editors. The user is closer to the reviewer, owner, or creative director: they watch the motion piece, leave notes at exact moments, preview the agent's proposed changes, and decide what becomes Main.

[[Chats]] is still the main place where a user can directly ask an agent to edit the project. Comments are different: they are anchored review notes. A comment says, "At this frame or range, make this change." Ripple turns that note into a focused [[Revisions|proposed version]].

## Core Journey

The user pauses [[Preview]] or selects a range in [[Timeline]], opens Comments, and writes a note. The composer shows the current timecode or range so the user knows where the feedback will land.

[Comment Screenshot: composer anchored to current frame]

When the user sends the comment, the comment card should appear immediately. The user should not wait for screenshots, frame sheets, or an agent run before seeing their note.

Each actionable comment starts its own proposed version of the project. Behind the scenes this can be a hidden worktree and agent session, but the UI should frame it as "working on changes" or "proposed changes." Main stays untouched.

When the agent finishes, the card shows a short one-line response, much shorter than Chat. Comments should not become full transcripts. The card only needs enough to say what happened: changes are ready, no changes were needed, it needs attention, or the changes were accepted.

The user can click the comment to preview that proposed version at the comment's frame. They can click View Main to compare against the accepted project. They can accept the changes, reject/delete the comment, or reply to keep the thread going.

## Comment Card

A comment card should show:

- Timecode or range.
- The user's note.
- Attachments or visual context if present.
- A compact status line from the agent.
- View changes when a proposed version is previewable.
- Open in Chat for the full thread.
- Reply to keep iterating.
- Accept changes when the proposal is safe to apply.
- Reject/Delete and Restore for review cleanup.

The Comments pane should feel like a review surface, not a developer panel. It should not show branches, commits, merge mechanics, raw worktree paths, or long tool logs. Those details can exist in Chat, Changes, or advanced utilities.

[Comment Screenshot: card with working state]

[Comment Screenshot: card with changes ready]

## Proposed Versions

Each actionable comment should have its own isolated proposed version. That isolation is important because the user may leave several comments at once, and each one needs to be previewed independently.

Main is the accepted project. Proposed versions are temporary. A proposed version only becomes Main when the user accepts it.

Selecting a comment with ready changes should switch the center preview to that proposed version and seek to the anchored frame or range. View Main should switch back without losing the user's place. The user should always know whether they are looking at Main or proposed changes.

[Comment Screenshot: proposed changes in preview with View Main]

## Replies

Replies keep the comment thread alive. If the first agent pass gets close but not quite right, the user should reply the way they would to an editor: "make it larger," "too slow," "try the logo in white."

That reply should continue from the existing comment context instead of starting over. Underneath, Ripple can keep using the hidden conversation/worktree context, but the card should remain simple: the thread has a newer proposed change, and the latest one is what the user reviews.

[[Chats#Comment conversations|Open in Chat]] is the escape hatch when the compact card is not enough. It should focus the comment's conversation and preserve the preview context.

## Accepting Changes

Accept changes means: bring this proposed version into Main.

In the current implementation, accepting a comment uses the isolated-workspace acceptance path with a patch strategy. Product-wise, the important rules are:

- Main must not change before Accept succeeds.
- Accept is only enabled when the proposal is ready and safe.
- Accept applies only that comment's proposed change.
- After accept, Main refreshes and the comment becomes accepted/resolved.
- Accepts are serialized per project so two comments cannot mutate Main at the same time.

If accept fails, the card should not pretend it succeeded. Main should remain safe, and the user should get a clear recovery path.

## When Main Changes

The hard case is multiple comments.

Example: the user creates Comment A and Comment B. Both agents work from the same Main. The user accepts Comment A. Main has now changed, so Comment B might be based on an older version.

Comment B should not keep a normal Accept button. Ripple should mark it as updating or refresh needed. The current code marks stale proposed revisions as `updating` when their `baseProjectCommit` no longer matches the new Main commit.

Ripple should then try the cheap path first: replay Comment B's patch onto the latest Main. If that works, Comment B becomes ready again. If it does not work cleanly, it becomes refresh needed / needs attention, and the user can continue in Chat or explicitly ask the agent to resolve it.

This matters because very old comments should not automatically spend tokens forever. First try to safely pull Main into the proposed version. Use the agent only when replay cannot resolve the situation or the user asks for it.

[Comment Screenshot: refresh needed after Main changed]

## Leaving Comments While Previewing Changes

The user may leave a new comment while looking at proposed changes instead of Main. Ripple needs to remember what the user was looking at.

That comment should still anchor to the frame/range the user saw. But the hidden context should know whether it came from Main or from a proposal, so Ripple does not silently apply feedback to the wrong version.

This should feel calm in the UI. The user is comparing visuals, not managing versions.

## What Good Looks Like

The user can review motion work the way they already understand from video review tools, but the agent does the editor's job.

They leave a note, Ripple works on a proposed version, they compare it against Main, and they decide whether it lands. Multiple comments can run independently. Main stays protected. Stale proposals become visibly safe before they can be accepted. The interface stays focused on creative feedback, not implementation mechanics.

## Test Coverage

- `src/shared/ripple-comments.test.ts` - Normalizes frame/range anchors and round-trips comment/chat preview protocol keys.
- `src/main/lib/revisions/comment-revisions.test.ts` - Builds comment revision prompts, summaries, follow-ups, attachments, accept paths, and recovery states.
- `src/main/lib/agent-runtime/generated-change-scheduler.test.ts` - Carries comment frame context into generated-change agent runs.
- `src/renderer/features/comments/comment-composer.test.ts` - Keeps the comment composer visually aligned with the chat input shell.
- `src/renderer/features/comments/comment-filters.test.ts` - Filters rejected comments, previews live work, detects active changes, and gates reject/refresh actions.
- `src/renderer/features/comments/comment-formatting.test.ts` - Formats timecodes, compact result lines, proposal summaries, and terse timestamps for comment cards.
- `src/renderer/features/hyperframes/preview-comment-markers.test.ts` - Positions visible comments by timecode and refreshes marker tones while work runs.
