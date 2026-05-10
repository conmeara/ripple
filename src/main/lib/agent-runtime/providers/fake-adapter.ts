import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type {
  AgentProviderAdapter,
  AgentProviderEventSink,
  AgentProviderRunInput,
  AgentProviderRunResult,
  ProviderAuthStatus,
} from "../types"

export class FakeAgentAdapter implements AgentProviderAdapter {
  readonly provider = "fake"
  readonly runtime = "fake"

  async checkAuth(): Promise<ProviderAuthStatus> {
    return {
      provider: this.provider,
      runtime: this.runtime,
      connected: true,
      authMode: "test",
      label: "Fake agent ready",
      setupAction: "none",
    }
  }

  async run(
    input: AgentProviderRunInput,
    sink: AgentProviderEventSink,
  ): Promise<AgentProviderRunResult> {
    await sink.emit({
      type: "status",
      payload: { status: "running", label: "Preparing generated change" },
    })
    await sink.emit({
      type: "tool_start",
      providerType: "fake.workspace.inspect",
      payload: {
        cwd: input.cwd,
        mode: input.mode,
      },
    })
    await sink.emit({
      type: "tool_end",
      providerType: "fake.workspace.inspect",
      payload: { ok: true },
    })

    const summary =
      "Ripple prepared this generated change through the main-process agent runtime."
    if (process.env.RIPPLE_E2E === "1") {
      await writeFile(
        join(input.cwd, "ripple-fake-agent-change.txt"),
        `${summary}\n\n${input.prompt}\n`,
        "utf8",
      )
    }
    await sink.emit({
      type: "assistant_message",
      payload: { text: summary },
    })

    return {
      summary,
      providerThreadId: input.thread.providerThreadId ?? `fake-thread-${input.thread.id}`,
      providerTurnId: `fake-turn-${input.run.id}`,
      providerSessionId: `fake-session-${input.thread.id}`,
    }
  }
}
