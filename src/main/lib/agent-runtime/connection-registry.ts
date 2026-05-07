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
    defaultModel: "gpt-5.5",
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
  const defaults = DEFAULT_CONNECTIONS[provider]
  const existing = db
    .select()
    .from(agentConnections)
    .where(and(
      eq(agentConnections.provider, provider),
      eq(agentConnections.isDefault, true),
    ))
    .get()
  if (existing) {
    if (
      existing.modelSelectionMode === "provider_default" &&
      existing.defaultModel !== defaults.defaultModel
    ) {
      return db
        .update(agentConnections)
        .set({
          defaultModel: defaults.defaultModel,
          updatedAt: new Date(),
        })
        .where(eq(agentConnections.id, existing.id))
        .returning()
        .get()
    }
    return existing
  }

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
