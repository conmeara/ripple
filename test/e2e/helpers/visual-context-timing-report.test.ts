import { describe, expect, test } from "bun:test"
import {
  VISUAL_CONTEXT_TIMING_BUDGETS,
  VISUAL_CONTEXT_MODEL_TOOL_CHOICE_BUDGET_MS,
  VISUAL_CONTEXT_TIMING_PATHS,
  buildVisualContextTimingBudgetResult,
  buildVisualContextTimingReport,
  renderVisualContextTimingMarkdown,
  visualContextModelToolChoiceMs,
  visualContextOwnedLatencyMs,
  type VisualContextTimingRow,
} from "./visual-context-timing-report"

describe("visual context timing report", () => {
  test("keeps the chat and comment timing paths explicit", () => {
    expect(VISUAL_CONTEXT_TIMING_PATHS).toEqual([
      "chat.current_snapshot_tool",
      "chat.timestamp_snapshot_tool",
      "chat.frame_sheet_tool",
      "comment.auto_current_frame_attachment",
      "comment.auto_range_sheet_attachment",
      "comment.current_snapshot_tool",
      "comment.timestamp_snapshot_tool",
      "comment.frame_sheet_tool",
    ])
  })

  test("renders pipeline timing columns for every observed path", () => {
    const rows: VisualContextTimingRow[] = [{
      provider: "codex",
      surface: "comment",
      path: "comment.auto_current_frame_attachment",
      trigger: "automatic_comment_visual",
      uiCardVisibleMs: 42.4,
      autoVisualReadyMs: 612.6,
      runObservedMs: 650.2,
      providerRunMs: 2001.1,
      e2eMs: 2651.8,
      status: "completed",
      artifactPath: ".ripple/comment-visuals/thread/frame.png",
    }]

    const report = buildVisualContextTimingReport(rows)
    const markdown = renderVisualContextTimingMarkdown(report)

    expect(report.rows[0].uiCardVisibleMs).toBe(42)
    expect(report.rows[0].autoVisualReadyMs).toBe(613)
    expect(report.budgetResults[0]).toMatchObject({
      ownedLatencyMs: 613,
      budgetMs: VISUAL_CONTEXT_TIMING_BUDGETS["comment.auto_current_frame_attachment"].ownedBudgetMs,
      status: "within_budget",
      primaryBottleneck: "within app-owned budget",
    })
    expect(report.missingPathsByProvider.codex).toContain("chat.current_snapshot_tool")
    expect(markdown).toContain("## Budget Readout")
    expect(markdown).toContain("App-owned latency")
    expect(markdown).toContain("Model choice")
    expect(markdown).toContain("| Provider | Surface | Path | Trigger | Tool # | UI card | Auto visual |")
    expect(markdown).toContain("comment.auto_current_frame_attachment")
    expect(markdown).toContain(".ripple/comment-visuals/thread/frame.png")
  })

  test("separates app-owned tool latency from model wait before the tool", () => {
    const row: VisualContextTimingRow = {
      provider: "claude",
      surface: "chat",
      path: "chat.current_snapshot_tool",
      trigger: "agent_tool",
      toolOrderIndex: 1,
      modelToolChoiceMs: 5_000,
      runStartedToToolStartMs: 5_000,
      toolExecutionMs: 108,
      visualCaptureMs: 100,
      nativeHandoffMs: 8,
      providerRunMs: 40_000,
      e2eMs: 5_318,
      status: "completed",
    }

    expect(visualContextOwnedLatencyMs(row)).toBe(108)
    expect(visualContextModelToolChoiceMs(row)).toBe(5_000)
    expect(buildVisualContextTimingBudgetResult(row)).toMatchObject({
      ownedLatencyMs: 108,
      budgetMs: 250,
      status: "within_budget",
      modelToolChoiceMs: 5_000,
      modelToolChoiceBudgetMs: VISUAL_CONTEXT_MODEL_TOOL_CHOICE_BUDGET_MS,
      modelToolChoiceStatus: "over_budget",
      primaryBottleneck: "model tool choice",
    })
  })

  test("budgets tool paths from measured capture when event timestamps are coarse", () => {
    const row: VisualContextTimingRow = {
      provider: "codex",
      surface: "chat",
      path: "chat.current_snapshot_tool",
      trigger: "agent_tool",
      toolOrderIndex: 1,
      modelToolChoiceMs: 8_000,
      runStartedToToolStartMs: 8_000,
      toolExecutionMs: 1_000,
      visualCaptureMs: 74,
      nativeHandoffMs: null,
      providerRunMs: 20_000,
      e2eMs: 9_000,
      status: "completed",
    }

    expect(visualContextOwnedLatencyMs(row)).toBe(74)
    expect(buildVisualContextTimingBudgetResult(row)).toMatchObject({
      ownedLatencyMs: 74,
      budgetMs: 250,
      status: "within_budget",
      primaryBottleneck: "model tool choice",
    })
  })

  test("uses the per-tool choice interval before falling back to cumulative tool wait", () => {
    const row: VisualContextTimingRow = {
      provider: "codex",
      surface: "chat",
      path: "chat.frame_sheet_tool",
      trigger: "agent_tool",
      toolOrderIndex: 3,
      modelToolChoiceMs: 900,
      runStartedToToolStartMs: 12_000,
      toolExecutionMs: 420,
      visualCaptureMs: 390,
      nativeHandoffMs: 30,
      status: "completed",
    }

    expect(visualContextModelToolChoiceMs(row)).toBe(900)
    expect(buildVisualContextTimingBudgetResult(row)).toMatchObject({
      modelToolChoiceMs: 900,
      modelToolChoiceStatus: "within_budget",
      primaryBottleneck: "within app-owned budget",
    })
  })
})
