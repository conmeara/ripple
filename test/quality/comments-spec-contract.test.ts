import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  MAX_AGENT_RUNTIME_ATTACHMENT_BYTES,
  MAX_AGENT_RUNTIME_ATTACHMENT_TOTAL_BYTES,
  MAX_AGENT_RUNTIME_ATTACHMENTS,
  validateAgentRuntimeAttachments,
  type AgentRuntimeAttachment,
} from "../../src/shared/agent-runtime-attachments"
import {
  commentAnchorPreviewTimeSeconds,
  getRippleRevisionPreviewProjectId,
  normalizeCommentAnchor,
  parseRippleRevisionPreviewProjectId,
  type RippleCommentThreadView,
  type RippleRevisionStatus,
  type RippleRevisionView,
} from "../../src/shared/ripple-comments"
import { buildAnchorFromTimelineContext } from "../../src/renderer/features/comments/timeline-comment-prompt"
import {
  canPreviewRevisionChanges,
  canRefreshRevisionChanges,
  canRejectRevisionChanges,
  canReplyToCommentThread,
  commentFilterLabels,
  hasActiveRevisionChanges,
  isDeletedCommentThread,
  shouldShowRestoreAction,
} from "../../src/renderer/features/comments/comment-filters"
import {
  formatRevisionResultLine,
  formatRevisionStatusLine,
  revisionStatusLabel,
} from "../../src/renderer/features/comments/comment-formatting"
import {
  buildPreviewCommentMarkers,
  hasActivePreviewCommentMarkerWork,
  previewCommentMarkerTone,
} from "../../src/renderer/features/hyperframes/preview-comment-markers"
import {
  createInitialRipplePreviewContext,
  ripplePreviewContextReducer,
} from "../../src/renderer/features/ripple-shell/ripple-preview-context"
import { buildGeneratedChangeRuntimeContext } from "../../src/main/lib/agent-runtime/generated-change-runtime-context"
import { drainGeneratedChangeQueueForProject } from "../../src/main/lib/agent-runtime/generated-change-queue-drain"
import {
  appendRippleCommentPromptMessage,
  buildRevisionPrompt,
} from "../../src/main/lib/revisions/comment-prompt"
import { compactOneLineSummary } from "../../src/main/lib/revisions/comment-summary"
import { canReuseRevisionAsFollowUpBase } from "../../src/main/lib/revisions/revision-follow-up-policy"
import { extractRevisionRunActivityLine } from "../../src/main/lib/revisions/revision-activity"

const SPEC_PATH = "docs/specs/Comments.html"
const CONTRACT_PATH = "test/quality/comments-spec-contract.test.ts"
const E2E_PATH = "test/e2e/comments-spec.e2e.ts"
const COMMENTS_PANE_PATH = "src/renderer/features/comments/RippleCommentsPane.tsx"
const PROMPT_INPUT_PATH = "src/renderer/components/ui/prompt-input.tsx"
const COMMENT_REVISIONS_PATH = "src/main/lib/revisions/comment-revisions.ts"
const COMMENT_VISUALS_PATH = "src/main/lib/revisions/comment-visuals.ts"
const GENERATED_CHANGE_QUEUE_DRAIN_PATH = "src/main/lib/agent-runtime/generated-change-queue-drain.ts"
const AGENT_ACTIVITY_PATH = "src/main/lib/agent-runtime/activity.ts"
const CODEX_EVENTS_PATH = "src/main/lib/agent-runtime/providers/codex-app-server-events.ts"
const CLAUDE_ADAPTER_PATH = "src/main/lib/agent-runtime/providers/claude-agent-sdk-adapter.ts"
const UI_PROJECTION_PATH = "src/shared/agent-runtime-ui-projection.ts"
const PREVIEW_PLAYER_PATH = "src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx"
const RIPPLE_SHELL_PATH = "src/renderer/features/ripple-shell/RippleShell.tsx"
const ACCEPTANCE_PATH = "src/main/lib/revisions/isolated-workspace-acceptance.ts"
const REVISION_QUEUE_PATH = "src/main/lib/revisions/revision-queue.ts"
const REVISION_STALENESS_PATH = "src/main/lib/revisions/revision-staleness.ts"

interface TestGeneratedChangeResult {
  updated: number
  claimed: boolean
  revisionId: string | null
  agentRunId: string | null
  status: "idle" | "completed"
}

function read(path: string): string {
  return readFileSync(path, "utf8")
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(endIndex, `missing end marker after ${start}: ${end}`).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

function expectBefore(source: string, first: string, second: string): void {
  const firstIndex = source.indexOf(first)
  const secondIndex = source.indexOf(second)
  expect(firstIndex, `missing first marker: ${first}`).toBeGreaterThanOrEqual(0)
  expect(secondIndex, `missing second marker: ${second}`).toBeGreaterThanOrEqual(0)
  expect(firstIndex).toBeLessThan(secondIndex)
}

function revision(
  status: RippleRevisionStatus,
  overrides: Partial<RippleRevisionView> = {},
): RippleRevisionView {
  return {
    id: `${status}-revision`,
    threadId: "thread-1",
    projectId: "project-1",
    compositionId: "composition-1",
    conversationId: "conversation-1",
    chatId: null,
    subChatId: null,
    status,
    previewContextKey: `revision-${status}`,
    diffSummary: JSON.stringify({ summary: "Adjusted the timing." }),
    errorMessage: null,
    createdAt: null,
    updatedAt: null,
    resolvedAt: null,
    ...overrides,
  }
}

function thread(
  overrides: Partial<RippleCommentThreadView> = {},
): RippleCommentThreadView {
  return {
    id: "thread-1",
    projectId: "project-1",
    compositionId: "composition-1",
    anchorType: "frame",
    startTime: 3_033,
    endTime: null,
    startFrame: 91,
    endFrame: null,
    elementSelector: null,
    clipKey: null,
    sourceFile: "index.html",
    screenshotPath: null,
    clientRequestId: null,
    status: "open",
    latestRevisionId: null,
    createdAt: null,
    updatedAt: null,
    resolvedAt: null,
    deletedAt: null,
    messages: [],
    revisions: [],
    ...overrides,
  }
}

function fileAttachment(size: number): AgentRuntimeAttachment {
  return {
    type: "file",
    base64Data: "a".repeat(Math.ceil(size * 4 / 3)),
    mediaType: "application/octet-stream",
    filename: `file-${size}.bin`,
    size,
  }
}

describe("Comments spec executable coverage", () => {
  test("every Comments.html test-plan marker has a matching contract or E2E test", async () => {
    const spec = await Bun.file(SPEC_PATH).text()
    const contract = await Bun.file(CONTRACT_PATH).text()
    const e2e = await Bun.file(E2E_PATH).text()
    const planMarkers = [
      ...new Set(
        [...spec.matchAll(/<span class="testplan-id">(T-[A-Z][0-9]+)<\/span>/g)]
          .map((match) => match[1]),
      ),
    ].sort()
    const inlineMarkers = [
      ...new Set(
        [...spec.matchAll(/class="test-marker covered"[^>]*>(T-[A-Z][0-9]+)/g)]
          .map((match) => match[1]),
      ),
    ].sort()
    const testText = `${contract}\n${e2e}`

    expect(planMarkers).toHaveLength(67)
    expect(inlineMarkers).toEqual(planMarkers)
    expect(spec).not.toContain('class="test-marker existing"')
    expect(spec).not.toContain('class="test-marker new"')
    expect(spec).not.toContain('class="testplan-status existing"')
    expect(spec).not.toContain('class="testplan-status new"')
    expect(spec).not.toContain(">to write<")
    expect(planMarkers.filter((marker) => !new RegExp(`\\b${marker}\\b`).test(testText)))
      .toEqual([])
    expect(e2e).toContain("full frame-comment review workflow")
  })
})

describe("Comments spec contract: A - composer and anchor capture", () => {
  test("T-A1 captures the current preview frame at compose time", () => {
    expect(buildAnchorFromTimelineContext({
      currentTime: 2.15,
      selection: null,
    })).toMatchObject({
      anchorType: "frame",
      startTime: 2.15,
      endTime: null,
      startFrame: 65,
      endFrame: null,
    })
  })

  test("T-A2 captures the selected timeline range instead of the playhead", () => {
    expect(buildAnchorFromTimelineContext({
      currentTime: 9,
      selection: {
        projectId: "project-1",
        compositionId: "composition-1",
        source: "static-source",
        confidence: "static",
        startTime: 1,
        endTime: 3,
        startFrame: 30,
        endFrame: 90,
        selector: ".title",
        clipKey: "index:title",
        sourceFile: "index.html",
      },
    })).toMatchObject({
      anchorType: "element",
      startTime: 1,
      endTime: 3,
      startFrame: 30,
      endFrame: 90,
      elementSelector: ".title",
      clipKey: "index:title",
      sourceFile: "index.html",
    })
  })

  test("T-A3 normalizes reversed range start/end to min/max", () => {
    expect(normalizeCommentAnchor({
      startTime: 3,
      endTime: 1,
    })).toMatchObject({
      startTimeMs: 1_000,
      endTimeMs: 3_000,
    })
  })

  test("T-A4 sends on Enter and inserts newline on Shift+Enter", () => {
    const promptInputSource = read(PROMPT_INPUT_PATH)
    const textareaSource = between(
      promptInputSource,
      "const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {",
      "const maxHeightStyle =",
    )

    expect(textareaSource).toContain('e.key === "Enter"')
    expect(textareaSource).toContain("!e.shiftKey")
    expect(textareaSource).toContain("e.preventDefault()")
    expect(textareaSource).toContain("onSubmit?.()")
  })

  test("T-A5 clears and refocuses the composer after send", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const createThreadMutation = between(
      commentsPaneSource,
      "const createThread = trpc.revisions.createThread.useMutation({",
      "const addReply = trpc.revisions.addReply.useMutation({",
    )

    expect(createThreadMutation).toContain('setDraft("")')
    expect(createThreadMutation).toContain("setComposerFocusSignal((value) => value + 1)")
    expect(commentsPaneSource).toContain("textareaRef.current?.focus()")
  })

  test("T-A6 renders the card before visual capture or agent startup finishes", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const createThreadMutation = between(
      commentsPaneSource,
      "const createThread = trpc.revisions.createThread.useMutation({",
      "const addReply = trpc.revisions.addReply.useMutation({",
    )

    expect(createThreadMutation).toContain("onMutate")
    expect(createThreadMutation).toContain("optimistic")
  })
})

describe("Comments spec contract: B - visual context attachment", () => {
  test("T-B1 visual capture runs asynchronously and does not block card creation", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const createThreadSource = between(
      serviceSource,
      "export async function createCommentThread(",
      "export async function addCommentReply(",
    )

    expectBefore(
      createThreadSource,
      "insert(commentThreads)",
      "captureCommentVisualContextInBackground({",
    )
    expect(serviceSource).toContain("captureCommentVisualForAnchor({")
  })

  test("comment agent run waits for automatic visual context before provider startup", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const createThreadSource = between(
      serviceSource,
      "export async function createCommentThread(",
      "export async function addCommentReply(",
    )
    const revisionStartupSource = between(
      serviceSource,
      "function createRevisionForThreadInBackground(",
      "async function prepareMissingRevisionWorkspaceForRecovery(",
    )

    expectBefore(
      createThreadSource,
      "const visualContextReady = shouldCaptureCommentVisualContext({",
      "createRevisionForThreadInBackground({",
    )
    expect(createThreadSource).toContain("visualContextReady,")
    expect(revisionStartupSource).toContain("await options.visualContextReady")
    expectBefore(
      revisionStartupSource,
      "await options.visualContextReady",
      "const revision = await createRevisionForThread(input)",
    )
  })

  test("T-B2 comment persists even when visual capture fails", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const captureBlock = between(
      serviceSource,
      "function captureCommentVisualContextInBackground(",
      "function createRevisionForThreadInBackground(",
    )

    expect(captureBlock).toContain("try {")
    expect(captureBlock).toContain("catch (error)")
    expect(captureBlock).toContain("Could not capture comment visual context")
  })

  test("T-B3 range comments capture a six-sample frame sheet", () => {
    const visualSource = read(COMMENT_VISUALS_PATH)
    const rangeSource = between(
      visualSource,
      "async function captureRangeSheet(",
      "export async function captureCommentVisualForAnchor(",
    )

    expect(rangeSource).toContain('"--samples"')
    expect(rangeSource).toContain('"6"')
    expect(rangeSource).toContain('"--columns"')
    expect(rangeSource).toContain('"3"')
    expect(rangeSource).toContain('"range_sheet"')
  })
})

describe("Comments spec contract: C - pane behavior", () => {
  test("T-C1 active filter shows open and working threads", () => {
    expect(commentFilterLabels.active).toBe("Comments")
    expect(hasActiveRevisionChanges({ revisions: [revision("running")] })).toBe(true)
  })

  test("T-C2 rejected filter shows soft-deleted threads with restore affordance", () => {
    expect(commentFilterLabels.deleted).toBe("Rejected")
    expect(shouldShowRestoreAction("deleted")).toBe(true)
    expect(isDeletedCommentThread(thread({ deletedAt: new Date() }))).toBe(true)
    expect(canReplyToCommentThread(thread({ deletedAt: new Date() }))).toBe(false)
  })

  test("T-C3 numbers cards descending by creation order", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)

    expect(commentsPaneSource).toContain("index={threads.length - index - 1}")
    expect(commentsPaneSource).toContain("#{index + 1}")
  })

  test("T-C4 scrolls the selected card into view inside the list", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const scrollEffect = between(
      commentsPaneSource,
      "if (!selectedThreadId) return",
      "const clearCommentPreview = useCallback(() => {",
    )

    expect(scrollEffect).toContain("[data-selected-comment-card='true']")
    expect(scrollEffect).toContain("scrollIntoView({ block: \"nearest\" })")
  })

  test("T-C5 polls every second only while visible work is running", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const querySource = between(
      commentsPaneSource,
      "const threadsQuery = trpc.revisions.listThreads.useQuery(",
      "const createThread = trpc.revisions.createThread.useMutation({",
    )

    expect(querySource).toContain("threads.some(hasActiveRevisionChanges) ? 1_000 : false")
  })
})

describe("Comments spec contract: D - card by status", () => {
  test("T-D1 working cards show blue progress and a one-line activity summary", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const cardSource = between(
      commentsPaneSource,
      "function RevisionStatusLine({",
      "export function RippleCommentsPane({",
    )

    expect(formatRevisionStatusLine(revision("queued", { diffSummary: null })))
      .toBe("Agent is thinking")
    expect(formatRevisionStatusLine(revision("preparing", { diffSummary: null })))
      .toBe("Preparing the composition")
    expect(formatRevisionStatusLine(revision("running", { diffSummary: null })))
      .toBe("Editing files")
    expect(cardSource).toContain("TextShimmer")
    expect(cardSource).toContain("LoaderCircle")
  })

  test("T-D2 proposed cards show emerald dot, response line, and neutral check icon", () => {
    expect(canRejectRevisionChanges(revision("proposed"))).toBe(true)
    expect(canPreviewRevisionChanges(revision("proposed"))).toBe(true)
    const commentsPaneSource = read(COMMENTS_PANE_PATH)

    expect(commentsPaneSource).toContain('return { label: "Accept changes", disabled: false, busy: false }')
    expect(commentsPaneSource).toContain("<Check className=\"h-4 w-4\" />")
    expect(commentsPaneSource).toContain("bg-emerald-500")
  })

  test("T-D3 answered cards show No changes needed with disabled accept", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const acceptSource = between(
      commentsPaneSource,
      "function revisionAcceptControl(",
      "function CommentCard({",
    )

    expect(acceptSource).toContain('case "answered":')
    expect(acceptSource).toContain('return { label: "No changes needed", disabled: true, busy: false }')
  })

  test("T-D4 failed or refresh-needed cards expose a bottom-right refresh action", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const cardSource = between(
      commentsPaneSource,
      "function CommentCard({",
      "export function RippleCommentsPane({",
    )

    expect(canRefreshRevisionChanges(revision("proposed"))).toBe(false)
    expect(canRefreshRevisionChanges(revision("failed"))).toBe(true)
    expect(canRefreshRevisionChanges(revision("needs_update"))).toBe(true)
    expect(cardSource).toContain('label="Refresh changes"')
  })

  test("T-D5 updating cards keep the same response while accept becomes progress", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const statusLineSource = between(
      commentsPaneSource,
      "function RevisionStatusLine({",
      "function revisionStatusLabel(",
    )

    expect(formatRevisionStatusLine(revision("updating"))).toBe("Adjusted the timing.")
    expect(statusLineSource).toContain("formatRevisionStatusLine(revision)")
    expect(commentsPaneSource).toContain('case "updating":')
    expect(commentsPaneSource).toContain("busy: true")
  })

  test("T-D6 accepted cards dim, remove the dot, and keep the agent response", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const cardSource = between(
      commentsPaneSource,
      "function CommentCard({",
      "export function RippleCommentsPane({",
    )

    expect(cardSource).toContain("isAcceptedThread")
    expect(cardSource).toContain("!isAcceptedThread ? (")
    expect(cardSource).toContain("Accepted")
    expect(cardSource).toContain("RevisionStatusLine")
  })

  test("T-D7 maps every revision status to the card status reference", () => {
    for (const status of [
      "queued",
      "preparing",
      "running",
      "updating",
      "needs_update",
      "proposed",
      "answered",
      "accepted",
      "rejected",
      "superseded",
      "failed",
    ] satisfies RippleRevisionStatus[]) {
      expect(revision(status).status).toBe(status)
      expect(revisionStatusLabel(status)).toBeTruthy()
    }
  })

  test("T-D8 generated changes can claim and run comment agents in parallel", async () => {
    let claimed = 0
    let active = 0
    let maxActive = 0
    const processQueue = async (): Promise<TestGeneratedChangeResult> => {
      const index = claimed
      claimed += 1
      if (index >= 3) {
        return {
          updated: 0,
          claimed: false,
          revisionId: null,
          agentRunId: null,
          status: "idle",
        }
      }
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 20))
      active -= 1
      return {
        updated: 0,
        claimed: true,
        revisionId: `revision-${index}`,
        agentRunId: `run-${index}`,
        status: "completed",
      }
    }

    await drainGeneratedChangeQueueForProject(
      { projectId: "project-1" },
      { parallelism: 3, processor: processQueue },
    )

    expect(maxActive).toBeGreaterThan(1)
    expect(read(GENERATED_CHANGE_QUEUE_DRAIN_PATH)).toContain("Promise.all")
  })

  test("T-D9 working status line uses specific current activity, not a generic label", () => {
    expect(revisionStatusLabel("running")).toBe("Editing files")
    expect(formatRevisionStatusLine(revision("running", { diffSummary: null })))
      .toBe("Editing files")
    expect(extractRevisionRunActivityLine([
      { type: "reasoning", payload: { delta: "checking the request" } },
      {
        type: "tool_start",
        providerType: "item/started",
        payload: { toolName: "Edit", command: "git diff -- index.html" },
      },
    ])).toBe("Editing files")
    expect(read(COMMENTS_PANE_PATH)).not.toContain("Agent is working")
  })

  test("T-D10 provider activity uses a stable kind and flexible label for Codex and Claude", () => {
    const activitySource = read(AGENT_ACTIVITY_PATH)

    expect(activitySource).toContain("AgentRunActivityKind")
    expect(activitySource).toContain("normalizeAgentRunActivityPayload")
    expect(activitySource).toContain("buildProviderSummaryActivityEvent")
    expect(read(CODEX_EVENTS_PATH)).toContain("CODEX_ACTIVITY_SOURCE")
    expect(read(CLAUDE_ADAPTER_PATH)).toContain("CLAUDE_ACTIVITY_SOURCE")
    expect(read(UI_PROJECTION_PATH)).toContain('case "activity":')
    expect(extractRevisionRunActivityLine([
      {
        type: "activity",
        payload: {
          kind: "searching",
          label: "Looking up brand references",
          source: "codex_app_server",
        },
      },
    ])).toBe("Looking up brand references")
    expect(extractRevisionRunActivityLine([
      {
        type: "activity",
        payload: {
          kind: "checking",
          label: "git diff -- index.html",
          source: "claude_agent_sdk",
        },
      },
    ])).toBe("Checking the project")
  })
})

describe("Comments spec contract: E - compact result line", () => {
  test("T-E1 exposes Read more for long agent responses instead of hard truncating", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const agentTextSource = between(
      commentsPaneSource,
      "function CommentAgentText({",
      "function RevisionStatusLine({",
    )

    expect(agentTextSource).toContain("line-clamp-4")
    expect(agentTextSource).toContain("Read more")
    expect(agentTextSource).toContain("setExpanded(true)")
  })

  test("T-E2 falls back to status label instead of invented file-count text", () => {
    expect(formatRevisionResultLine({
      fileCount: 2,
      additions: 10,
      deletions: 4,
      files: ["index.html", "style.css"],
    })).toBeNull()
  })
})

describe("Comments spec contract: F - timeline markers", () => {
  test("T-F1 positions preview markers by time as percent of duration", () => {
    expect(buildPreviewCommentMarkers([
      thread({ id: "middle", startTime: 5_000, startFrame: 150 }),
    ], 10)[0]?.positionPercent).toBe(50)
  })

  test("T-F2 marker tone follows the latest revision status family", () => {
    expect(previewCommentMarkerTone(thread({
      revisions: [revision("running")],
    }))).toBe("in-progress")
    expect(previewCommentMarkerTone(thread({
      revisions: [revision("failed")],
    }))).toBe("needs-input")
    expect(previewCommentMarkerTone(thread({
      revisions: [revision("proposed")],
    }))).toBe("done")
  })

  test("T-F3 soft-deleted comments do not render preview markers", () => {
    expect(buildPreviewCommentMarkers([
      thread({ deletedAt: new Date() }),
    ], 10)).toEqual([])
  })

  test("T-F4 marker click selects the comment and switches preview", () => {
    const playerSource = read(PREVIEW_PLAYER_PATH)
    const shellSource = read(RIPPLE_SHELL_PATH)

    expect(playerSource).toContain('data-comment-marker="true"')
    expect(playerSource).toContain("onCommentMarkerSelect({")
    expect(playerSource).toContain("revisionId: marker.previewRevisionId")
    expect(shellSource).toContain('type: "select-comment-preview"')
    expect(shellSource).toContain('setRippleRightPaneMode(shellState, "comments")')
  })

  test("T-F5 accepted comments do not render preview timeline markers", () => {
    expect(buildPreviewCommentMarkers([
      thread({
        id: "accepted-revision",
        revisions: [revision("accepted")],
      }),
      thread({
        id: "resolved-thread",
        status: "resolved",
        revisions: [revision("proposed")],
      }),
      thread({
        id: "open-proposed",
        revisions: [revision("proposed")],
      }),
    ], 10).map((marker) => marker.id)).toEqual(["open-proposed"])
  })
})

describe("Comments spec contract: G - preview switching", () => {
  test("T-G1 card click switches preview to the revision workspace", () => {
    const state = ripplePreviewContextReducer(
      createInitialRipplePreviewContext({ projectId: "project-1", compositionId: "composition-1" }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 91 / 30,
      },
    )

    expect(state.selectedCommentThreadId).toBe("thread-1")
    expect(state.target).toEqual({
      kind: "comment-revision",
      revisionId: "revision-1",
      seekTime: 91 / 30,
    })
  })

  test("T-G2 preview seeks to the comment anchor frame on selection", () => {
    expect(commentAnchorPreviewTimeSeconds(thread())).toBe(91 / 30)
  })

  test("T-G3 View Main icon is visible in the Comments pane while previewing a proposal", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)

    expect(commentsPaneSource).toContain("selectedThreadId || activePreviewRevisionId")
    expect(commentsPaneSource).toContain('IconButton label="View Main"')
  })

  test("T-G4 View Main returns to Main and preserves playback time", () => {
    const selected = ripplePreviewContextReducer(
      createInitialRipplePreviewContext({ projectId: "project-1", compositionId: "composition-1" }),
      {
        type: "select-comment-preview",
        threadId: "thread-1",
        revisionId: "revision-1",
        time: 4.5,
      },
    )
    const cleared = ripplePreviewContextReducer(selected, { type: "clear-comment-preview" })

    expect(cleared.target).toEqual({ kind: "main" })
    expect(cleared.time).toBe(4.5)
    expect(cleared.selectedCommentThreadId).toBeNull()
  })

  test("T-G5 clicking outside a card returns preview to Main", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)

    expect(commentsPaneSource).toContain("handlePaneClickCapture")
    expect(commentsPaneSource).toContain('target.closest("[data-comment-card=\'true\']")')
    expect(commentsPaneSource).toContain("clearCommentPreview()")
  })

  test("T-G6 preview frame renders no PROPOSED or MAIN overlay labels", () => {
    const playerSource = read(PREVIEW_PLAYER_PATH)

    expect(playerSource).not.toContain("PROPOSED")
    expect(playerSource).not.toContain("MAIN")
  })

  test("T-G7 selected cards use the primary border without halo or glow", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const cardArticleSource = between(
      commentsPaneSource,
      "<article",
      "<div className=\"px-3 pt-3\">",
    )

    expect(cardArticleSource).toContain("border-primary/45")
    expect(cardArticleSource).not.toContain("ring-")
    expect(cardArticleSource).not.toContain("shadow-primary")
  })

  test("T-G8 View Main appears in the Comments pane, not over the preview", () => {
    expect(read(COMMENTS_PANE_PATH)).toContain('IconButton label="View Main"')
    expect(read(PREVIEW_PLAYER_PATH)).not.toContain('label="View Main"')
  })
})

describe("Comments spec contract: H - replies and threads", () => {
  test("T-H1 replies append to the existing conversation history", () => {
    const next = JSON.parse(appendRippleCommentPromptMessage({
      messages: JSON.stringify([
        {
          id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "Make the title bigger." }],
        },
      ]),
      prompt: "A little smaller.",
      threadId: "thread-1",
      revisionId: "revision-2",
    }))

    expect(next).toHaveLength(2)
    expect(next[1].parts[0].text).toBe("A little smaller.")
  })

  test("T-H2 replies continue the same chat and cumulative code state", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const followUpSource = between(
      serviceSource,
      "const reusableBaseRevision =",
      "let revision = db.transaction(() => {",
    )

    expect(canReuseRevisionAsFollowUpBase("proposed")).toBe(true)
    expect(followUpSource).toContain("baseRevision.contextPath")
    expect(followUpSource).toContain("contextPath: reusableBaseRevision.contextPath")
    expect(followUpSource).toContain("baseRevisionId: reusableBaseRevision.id")
  })

  test("T-H3 Open in Chat shows full comment history at any run state", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const cardSource = between(
      commentsPaneSource,
      "function CommentCard({",
      "export function RippleCommentsPane({",
    )

    expect(cardSource).toContain("revision?.conversationId && !isDeleted")
    expect(cardSource).toContain("Open in Chat")
    expect(cardSource).toContain("commentAnchorPreviewTimeSeconds(thread)")
  })

  test("T-H4 agent final comment replies are one line", () => {
    const prompt = buildRevisionPrompt({
      body: "Slow the fade.",
      project: { name: "Launch Promo" },
      composition: { name: "Main", filePath: "index.html" },
      thread: {
        anchorType: "frame",
        startTime: 1_000,
        endTime: null,
        startFrame: 30,
        endFrame: null,
        elementSelector: null,
        clipKey: null,
        sourceFile: "index.html",
        compositionId: "composition-1",
      },
    })

    expect(prompt.toLowerCase()).toContain("one line")
  })

  test("T-H5 running replies show one progress summary line instead of logs", () => {
    expect(compactOneLineSummary("Running git diff\n\nand checking frames.")).toBe(
      "Running git diff and checking frames.",
    )
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const statusLineSource = between(
      commentsPaneSource,
      "function RevisionStatusLine({",
      "function revisionStatusLabel(",
    )

    expect(statusLineSource).toContain("TextShimmer")
    expect(statusLineSource).not.toContain("tool")
  })
})

describe("Comments spec contract: I - accept path", () => {
  test("T-I1 accept is enabled only when the proposal is ready", () => {
    expect(canRejectRevisionChanges(revision("proposed"))).toBe(true)
    expect(canRejectRevisionChanges(revision("running"))).toBe(false)
    const commentsPaneSource = read(COMMENTS_PANE_PATH)

    expect(commentsPaneSource).toContain('case "proposed":')
    expect(commentsPaneSource).toContain("disabled: false")
    expect(commentsPaneSource).toContain('case "running":')
    expect(commentsPaneSource).toContain("disabled: true")
  })

  test("T-I2 stale-base accept refuses when Main has moved", () => {
    const acceptanceSource = read(ACCEPTANCE_PATH)

    expect(acceptanceSource).toContain("currentCommit !== input.baseProjectCommit")
    expect(acceptanceSource).toContain("older project version")
  })

  test("T-I3 accepts are serialized through a project-level lock", () => {
    const acceptanceSource = read(ACCEPTANCE_PATH)

    expect(acceptanceSource).toContain("const projectAcceptanceLocks = new Map")
    expect(acceptanceSource).toContain("withProjectAcceptanceLock")
    expect(acceptanceSource).toContain("return withProjectAcceptanceLock")
  })

  test("T-I4 failed accept rolls Main back atomically", () => {
    const acceptanceSource = read(ACCEPTANCE_PATH)

    expect(acceptanceSource).toContain("rollbackAcceptedWorkspaceFiles")
    expect(acceptanceSource).toContain("git\", [")
    expect(acceptanceSource).toContain("\"apply\"")
    expect(acceptanceSource).toContain("\"-R\"")
  })

  test("T-I5 accepting applies only that revision and marks the thread accepted", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const acceptSource = between(
      serviceSource,
      "export async function acceptRevision(",
      "export function buildCommentAnchorFromSeconds(",
    )

    expect(acceptSource).toContain('status: "accepted"')
    expect(acceptSource).toContain('status: "resolved"')
    expect(acceptSource).toContain("acceptIsolatedWorkspace({")
    expect(acceptSource).toContain("acceptedRevisionId: revision.id")
  })
})

describe("Comments spec contract: J - auto-merge cascade", () => {
  test("T-J1 accepting Main marks stale proposed revisions as updating", () => {
    const stalenessSource = read(REVISION_STALENESS_PATH)

    expect(stalenessSource).toContain('eq(revisions.status, "proposed")')
    expect(stalenessSource).toContain("revision.baseProjectCommit !== input.currentCommit")
    expect(stalenessSource).toContain('status: "updating"')
  })

  test("T-J2 stale proposals try cheap patch replay before agent invocation", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const updateSource = between(
      serviceSource,
      "export async function updateStaleRevisionProposal(",
      "export async function markRevisionRunning(",
    )

    expect(updateSource.indexOf("refreshRevisionProposalFromLatest({")).toBeLessThan(
      updateSource.lastIndexOf("prompt: MAIN_CONFLICT_RESOLUTION_PROMPT"),
    )
  })

  test("T-J3 successful cheap replay returns the proposal to ready", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const updateSource = between(
      serviceSource,
      "export async function updateStaleRevisionProposal(",
      "export async function markRevisionRunning(",
    )

    expect(updateSource).toContain("if (refresh.refreshed)")
    expect(updateSource).toContain('status: nextStatus')
    expect(updateSource).toContain('summary.fileCount > 0 ? "proposed" : "answered"')
  })

  test("T-J4 failed cheap replay invokes the agent for resolution", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const updateSource = between(
      serviceSource,
      "export async function updateStaleRevisionProposal(",
      "export async function markRevisionRunning(",
    )

    const queueSource = read(REVISION_QUEUE_PATH)

    expect(updateSource).toContain("prompt: MAIN_CONFLICT_RESOLUTION_PROMPT")
    expect(queueSource).toContain('const RUNNABLE_REVISION_STATUSES = ["queued", "updating"]')
    expect(queueSource).toContain("MAIN_CONFLICT_RESOLUTION_PROMPT")
  })

  test("T-J5 silent agent fixes do not post a conversation reply", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const updateSource = between(
      serviceSource,
      "export async function updateStaleRevisionProposal(",
      "export async function markRevisionRunning(",
    )

    expect(updateSource).not.toContain("appendConversationMessage")
  })

  test("T-J6 other ready accepts remain enabled during a cascade", () => {
    const stalenessSource = read(REVISION_STALENESS_PATH)

    expect(stalenessSource).toContain("revision.id !== input.acceptedRevisionId")
    expect(stalenessSource).toContain("revision.baseProjectCommit !== input.currentCommit")
    expect(stalenessSource).not.toContain("status: \"proposed\",")
  })

  test("T-J7 conflict resolution remains updating until ready", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const updateSource = between(
      serviceSource,
      "export async function updateStaleRevisionProposal(",
      "export async function markRevisionRunning(",
    )

    expect(updateSource).not.toContain('status: "needs_update"')
    expect(updateSource).toContain('status: "updating"')
  })
})

describe("Comments spec contract: K - crash recovery", () => {
  test("T-K1 startup resets preparing and running revisions to queued", () => {
    const queueSource = read(REVISION_QUEUE_PATH)

    expect(queueSource).toContain('const RECOVERABLE_STARTUP_STATUSES = ["preparing", "running"]')
    expect(queueSource).toContain('status: "queued"')
    expect(queueSource).toContain("recoverRevisionQueueOnStartup")
  })

  test("T-K2 lost workspace requeues agent recovery before accept", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const acceptSource = between(
      serviceSource,
      "export async function acceptRevision(",
      "export function buildCommentAnchorFromSeconds(",
    )
    const recoverySource = between(
      serviceSource,
      "async function prepareMissingRevisionWorkspaceForRecovery(",
      "function updateCommentConversationStatus(",
    )

    expect(acceptSource).toContain("prepareMissingRevisionWorkspaceForRecovery")
    expect(recoverySource).toContain("createWorktreeForChat(")
    expect(recoverySource).toContain("contextPath")
    expect(recoverySource).toContain('status: "queued"')
    expect(recoverySource).toContain("recovery")
  })
})

describe("Comments spec contract: L - soft-delete and restore", () => {
  test("T-L1 delete sets deletedAt and archives the conversation", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const deleteSource = between(
      serviceSource,
      "export async function deleteCommentThread(",
      "export async function restoreCommentThread(",
    )

    expect(deleteSource).toContain("deletedAt")
    expect(deleteSource).toContain('status: "deleted"')
    expect(deleteSource).not.toContain("db.delete(commentThreads)")
    expect(deleteSource).not.toContain("throwIfThreadHasRunningRevision")
  })

  test("T-L2 restore returns a deleted thread to open with history intact", () => {
    const serviceSource = read(COMMENT_REVISIONS_PATH)
    const restoreSource = between(
      serviceSource,
      "export async function restoreCommentThread(",
      "export async function resolveCommentThread(",
    )

    expect(restoreSource).toContain("deletedAt: null")
    expect(restoreSource).toContain('status: "open"')
    expect(restoreSource).toContain("return loadThreadView(threadId)")
  })

  test("T-L3 delete is available before acceptance and hidden after accepted", () => {
    const commentsPaneSource = read(COMMENTS_PANE_PATH)
    const cardSource = between(
      commentsPaneSource,
      "function CommentCard({",
      "export function RippleCommentsPane({",
    )

    expect(cardSource).toContain("!isAcceptedThread ? (")
    expect(cardSource).toContain('label="Delete comment"')
    expect(cardSource).toContain("onClick={() => onDelete(thread.id)}")
    expect(cardSource).toContain("Accepted")
  })
})

describe("Comments spec contract: M - constraints", () => {
  test("T-M1 rejects more than six attachments per comment or reply", () => {
    expect(validateAgentRuntimeAttachments(
      Array.from({ length: MAX_AGENT_RUNTIME_ATTACHMENTS + 1 }, () =>
        fileAttachment(1),
      ),
    )).toBe("Attach up to 6 files.")
  })

  test("T-M2 rejects a single attachment larger than 10 MB", () => {
    expect(validateAgentRuntimeAttachments([
      fileAttachment(MAX_AGENT_RUNTIME_ATTACHMENT_BYTES + 1),
    ])).toContain("larger than 10 MB")
  })

  test("T-M3 rejects attachments larger than 20 MB total", () => {
    const underPerFileLimit = Math.floor(MAX_AGENT_RUNTIME_ATTACHMENT_BYTES * 0.7)
    expect(validateAgentRuntimeAttachments([
      fileAttachment(underPerFileLimit),
      fileAttachment(underPerFileLimit),
      fileAttachment(underPerFileLimit),
    ])).toBe("Attachments are larger than 20 MB total.")
  })

  test("T-M4 converts comment time to frames at 30 fps", () => {
    expect(normalizeCommentAnchor({ startTime: 1.25 })).toMatchObject({
      startFrame: 38,
    })
  })
})

describe("Comments spec contract: N - frame context flow", () => {
  test("T-N1 carries comment frame context into the agent runtime", () => {
    expect(buildGeneratedChangeRuntimeContext({
      job: {
        projectId: "project-1",
        revisionId: "revision-1",
        threadId: "thread-1",
      },
      thread: {
        id: "thread-1",
        compositionId: "composition-1",
        startTime: 2_150,
        startFrame: 65,
      } as any,
    })).toMatchObject({
      projectId: "project-1",
      compositionId: "composition-1",
      commentThreadId: "thread-1",
      revisionId: "revision-1",
      previewSource: { kind: "comment-revision", revisionId: "revision-1" },
      previewTimeSeconds: 2.15,
      previewFrame: 65,
    })
  })

  test("T-N2 round-trips revision preview protocol keys", () => {
    const key = getRippleRevisionPreviewProjectId("revision-1")

    expect(key).toBe("revision-revision-1")
    expect(parseRippleRevisionPreviewProjectId(key)).toBe("revision-1")
  })

  test("comments with running work are detectable for timeline refresh", () => {
    expect(hasActivePreviewCommentMarkerWork(thread({
      revisions: [revision("queued")],
    }))).toBe(true)
  })
})
