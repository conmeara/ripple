import { beforeAll, describe, expect, mock, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { eq } from "drizzle-orm"
import { agentConnections } from "../db/schema"

type ConnectionRegistryModule = typeof import("./connection-registry")

let ensureDefaultAgentConnection: ConnectionRegistryModule["ensureDefaultAgentConnection"]

beforeAll(async () => {
  mock.module("electron", () => ({
    app: {
      getPath: () => "/tmp/ripple-connection-registry-test",
      isPackaged: false,
    },
  }))
  ;({ ensureDefaultAgentConnection } = await import("./connection-registry"))
})

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec(`
    CREATE TABLE agent_connections (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      provider text NOT NULL,
      runtime text NOT NULL,
      auth_mode text,
      default_model text,
      model_selection_mode text DEFAULT 'provider_default' NOT NULL,
      capabilities_json text DEFAULT '{}' NOT NULL,
      safe_account_status_json text DEFAULT '{}' NOT NULL,
      is_default integer DEFAULT 0 NOT NULL,
      created_at integer,
      updated_at integer
    );
  `)
  const db = drizzle(sqlite, { schema: { agentConnections } })
  return { sqlite, db }
}

describe("ensureDefaultAgentConnection", () => {
  test("seeds Codex with the latest default model", () => {
    const { sqlite, db } = createTestDb()
    try {
      const connection = ensureDefaultAgentConnection("codex", db as any)

      expect(connection.defaultModel).toBe("gpt-5.5")
      expect(connection.modelSelectionMode).toBe("provider_default")
      expect(connection.runtime).toBe("codex_app_server")
    } finally {
      sqlite.close()
    }
  })

  test("refreshes stale provider-default Codex model rows", () => {
    const { sqlite, db } = createTestDb()
    try {
      db.insert(agentConnections)
        .values({
          id: "codex-default",
          name: "Codex",
          provider: "codex",
          runtime: "codex_app_server",
          defaultModel: "gpt-5.3-codex",
          modelSelectionMode: "provider_default",
          capabilitiesJson: "{}",
          safeAccountStatusJson: "{}",
          isDefault: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })
        .run()

      const connection = ensureDefaultAgentConnection("codex", db as any)
      const persisted = db
        .select()
        .from(agentConnections)
        .where(eq(agentConnections.id, "codex-default"))
        .get()

      expect(connection.defaultModel).toBe("gpt-5.5")
      expect(persisted?.defaultModel).toBe("gpt-5.5")
    } finally {
      sqlite.close()
    }
  })

  test("preserves manual Codex model rows", () => {
    const { sqlite, db } = createTestDb()
    try {
      db.insert(agentConnections)
        .values({
          id: "codex-manual",
          name: "Codex",
          provider: "codex",
          runtime: "codex_app_server",
          defaultModel: "gpt-5.3-codex",
          modelSelectionMode: "manual",
          capabilitiesJson: "{}",
          safeAccountStatusJson: "{}",
          isDefault: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })
        .run()

      const connection = ensureDefaultAgentConnection("codex", db as any)

      expect(connection.defaultModel).toBe("gpt-5.3-codex")
      expect(connection.modelSelectionMode).toBe("manual")
    } finally {
      sqlite.close()
    }
  })
})
