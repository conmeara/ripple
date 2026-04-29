import type { AgentProviderAdapter, AgentProviderId } from "./types"
import { ClaudeAgentSdkAdapter } from "./providers/claude-agent-sdk-adapter"
import { CodexAppServerAdapter } from "./providers/codex-app-server-adapter"
import { FakeAgentAdapter } from "./providers/fake-adapter"

export function createAgentProviderAdapter(
  provider: AgentProviderId,
): AgentProviderAdapter {
  if (provider === "codex") return new CodexAppServerAdapter()
  if (provider === "claude") return new ClaudeAgentSdkAdapter()
  return new FakeAgentAdapter()
}

