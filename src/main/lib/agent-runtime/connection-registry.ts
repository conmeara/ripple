import { and, eq } from "drizzle-orm"
import {
  agentConnections,
  getDatabase,
  type AgentConnection,
} from "../db"
import type { AgentProviderId, AgentRuntimeId } from "./types"

type Db = ReturnType<typeof getDatabase>

const DEFAULT_CONNECTIONS: Record<
  AgentProviderId,
  {
    name: string
    runtime: AgentRuntimeId
    defaultModel: string | null
    capabilities: Record<string, unknown>
  }
> = {
  codex: {
    name: "Codex",
    runtime: "codex_app_server",
    defaultModel: "gpt-5.3-codex",
    capabilities: {
      streaming: true,
      approvals: true,
      appServer: true,
      generatedChanges: true,
    },
  },
  claude: {
    name: "Claude",
    runtime: "claude_agent_sdk",
    defaultModel: null,
    capabilities: {
      streaming: true,
      approvals: true,
      agentSdk: true,
      generatedChanges: true,
    },
  },
  fake: {
    name: "Fake Agent",
    runtime: "fake",
    defaultModel: "fake-agent",
    capabilities: {
      streaming: true,
      approvals: true,
      generatedChanges: true,
      testOnly: true,
    },
  },
}

export function ensureDefaultAgentConnection(
  provider: AgentProviderId,
  db: Db = getDatabase(),
): AgentConnection {
  const existing = db
    .select()
    .from(agentConnections)
    .where(and(
      eq(agentConnections.provider, provider),
      eq(agentConnections.isDefault, true),
    ))
    .get()
  if (existing) return existing

  const defaults = DEFAULT_CONNECTIONS[provider]
  const now = new Date()
  return db
    .insert(agentConnections)
    .values({
      name: defaults.name,
      provider,
      runtime: defaults.runtime,
      defaultModel: defaults.defaultModel,
      modelSelectionMode: "provider_default",
      capabilitiesJson: JSON.stringify(defaults.capabilities),
      safeAccountStatusJson: "{}",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
}

export function listAgentConnections(db: Db = getDatabase()): AgentConnection[] {
  return db.select().from(agentConnections).all()
}

