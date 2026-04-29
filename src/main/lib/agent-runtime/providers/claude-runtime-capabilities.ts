import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {
  getMergedGlobalMcpServers,
  getMergedLocalProjectMcpServers,
  readClaudeConfig,
  readClaudeDirConfig,
  readProjectMcpJson,
  resolveProjectPathFromWorktree,
  type ClaudeConfig,
  type McpServerConfig,
} from "../../claude-config"
import { ensureMcpTokensFresh } from "../../mcp-auth"
import {
  discoverInstalledPlugins,
  discoverPluginMcpServers,
  getPluginComponentPaths,
} from "../../plugins"
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "../../trpc/routers/claude-settings"

type SdkPluginConfig = { type: "local"; path: string }
type SettingSource = "project" | "user"

export interface ClaudeRuntimeCapabilities {
  mcpServers: Record<string, McpServerConfig>
  plugins: SdkPluginConfig[]
  settingSources: SettingSource[]
  systemPrompt:
    | { type: "preset"; preset: "claude_code"; append?: string }
    | undefined
  summary: {
    mcpServerNames: string[]
    skippedMcpServerNames: string[]
    pluginNames: string[]
    skillNames: string[]
    settingSources: SettingSource[]
    agentsMdLoaded: boolean
  }
}

async function readAgentsMd(cwd: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(cwd, "AGENTS.md"), "utf-8")
    return content.trim() ? content : null
  } catch {
    return null
  }
}

async function scanSkillNames(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const names: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
        continue
      }
      try {
        await fs.access(path.join(dir, entry.name, "SKILL.md"))
        names.push(entry.name)
      } catch {
        // Not a skill directory.
      }
    }
    return names.sort()
  } catch {
    return []
  }
}

function withSdkHttpDefaults(config: McpServerConfig): McpServerConfig {
  const next: McpServerConfig = { ...config }
  if (next.url && typeof next.type !== "string") {
    next.type = next.url.endsWith("/sse") ? "sse" : "http"
  }

  const oauth = next._oauth
  if (oauth?.accessToken) {
    const headers =
      next.headers && typeof next.headers === "object" && !Array.isArray(next.headers)
        ? next.headers as Record<string, string>
        : {}
    if (!headers.Authorization) {
      next.headers = {
        ...headers,
        Authorization: `Bearer ${oauth.accessToken}`,
      }
    }
  }
  return next
}

function isDisabledServer(config: McpServerConfig): boolean {
  return config.disabled === true
}

function needsMissingAuth(config: McpServerConfig): boolean {
  const headers =
    config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)
      ? config.headers as Record<string, string>
      : undefined
  if (headers?.Authorization) return false
  if (config._oauth?.accessToken) return false
  return Boolean(config.url && ["oauth", "bearer"].includes(config.authType ?? ""))
}

function splitSdkMcpServers(
  servers: Record<string, McpServerConfig>,
): {
  enabled: Record<string, McpServerConfig>
  skipped: string[]
} {
  const enabled: Record<string, McpServerConfig> = {}
  const skipped: string[] = []
  for (const [name, config] of Object.entries(servers)) {
    if (isDisabledServer(config) || needsMissingAuth(config)) {
      skipped.push(name)
      continue
    }
    enabled[name] = withSdkHttpDefaults(config)
  }
  return { enabled, skipped }
}

async function mergeClaudeMcpServers(
  cwd: string,
  config: ClaudeConfig,
  dirConfig: ClaudeConfig,
): Promise<Record<string, McpServerConfig>> {
  const globalServers = await getMergedGlobalMcpServers(config, dirConfig)
  const projectConfigServers = await getMergedLocalProjectMcpServers(
    cwd,
    config,
    dirConfig,
  )
  const projectMcpJsonServers = await readProjectMcpJson(cwd)
  const projectServers = { ...projectMcpJsonServers, ...projectConfigServers }

  const [
    enabledPluginSources,
    installedPlugins,
    pluginMcpConfigs,
    approvedServers,
  ] = await Promise.all([
    getEnabledPlugins(),
    discoverInstalledPlugins(),
    discoverPluginMcpServers(),
    getApprovedPluginMcpServers(),
  ])

  const installedPluginSources = new Set(installedPlugins.map((plugin) => plugin.source))
  const pluginServers: Record<string, McpServerConfig> = {}
  for (const pluginConfig of pluginMcpConfigs) {
    if (
      !enabledPluginSources.includes(pluginConfig.pluginSource) ||
      !installedPluginSources.has(pluginConfig.pluginSource)
    ) {
      continue
    }
    for (const [name, serverConfig] of Object.entries(pluginConfig.mcpServers)) {
      if (globalServers[name] || projectServers[name]) continue
      const identifier = `${pluginConfig.pluginSource}:${name}`
      if (approvedServers.includes(identifier)) {
        pluginServers[name] = serverConfig
      }
    }
  }

  return {
    ...pluginServers,
    ...globalServers,
    ...projectServers,
  }
}

export async function loadClaudeRuntimeCapabilities(
  cwd: string,
): Promise<ClaudeRuntimeCapabilities> {
  const resolvedCwd = resolveProjectPathFromWorktree(cwd) || cwd
  const [config, dirConfig, enabledPluginSources, installedPlugins, agentsMd] =
    await Promise.all([
      readClaudeConfig(),
      readClaudeDirConfig(),
      getEnabledPlugins(),
      discoverInstalledPlugins(),
      readAgentsMd(cwd),
    ])

  const enabledPlugins = installedPlugins.filter((plugin) =>
    enabledPluginSources.includes(plugin.source),
  )
  const plugins: SdkPluginConfig[] = enabledPlugins.map((plugin) => ({
    type: "local",
    path: plugin.path,
  }))

  const mergedServers = await mergeClaudeMcpServers(cwd, config, dirConfig)
  const freshServers = Object.keys(mergedServers).length > 0
    ? await ensureMcpTokensFresh(mergedServers, resolvedCwd)
    : mergedServers
  const { enabled: mcpServers, skipped: skippedMcpServerNames } =
    splitSdkMcpServers(freshServers)

  const pluginSkillPromises = enabledPlugins.map(async (plugin) => {
    const paths = getPluginComponentPaths(plugin)
    return scanSkillNames(paths.skills)
  })
  const [projectSkillNames, userSkillNames, ...pluginSkillNameGroups] =
    await Promise.all([
      scanSkillNames(path.join(cwd, ".claude", "skills")),
      scanSkillNames(path.join(os.homedir(), ".claude", "skills")),
      ...pluginSkillPromises,
    ])
  const skillNames = Array.from(
    new Set([
      ...projectSkillNames,
      ...userSkillNames,
      ...pluginSkillNameGroups.flat(),
    ]),
  ).sort()
  const settingSources: SettingSource[] = ["project", "user"]

  return {
    mcpServers,
    plugins,
    settingSources,
    systemPrompt: agentsMd
      ? {
          type: "preset",
          preset: "claude_code",
          append: `\n\n# AGENTS.md\nThe following are the project's AGENTS.md instructions:\n\n${agentsMd}`,
        }
      : { type: "preset", preset: "claude_code" },
    summary: {
      mcpServerNames: Object.keys(mcpServers).sort(),
      skippedMcpServerNames: skippedMcpServerNames.sort(),
      pluginNames: enabledPlugins.map((plugin) => plugin.source).sort(),
      skillNames,
      settingSources,
      agentsMdLoaded: Boolean(agentsMd),
    },
  }
}

export function formatClaudeCapabilityLabel(
  summary: ClaudeRuntimeCapabilities["summary"],
): string | null {
  const parts: string[] = []
  if (summary.mcpServerNames.length > 0) {
    parts.push(`${summary.mcpServerNames.length} MCP server${summary.mcpServerNames.length === 1 ? "" : "s"}`)
  }
  if (summary.pluginNames.length > 0) {
    parts.push(`${summary.pluginNames.length} plugin${summary.pluginNames.length === 1 ? "" : "s"}`)
  }
  if (summary.skillNames.length > 0) {
    parts.push(`${summary.skillNames.length} skill${summary.skillNames.length === 1 ? "" : "s"}`)
  }
  if (summary.agentsMdLoaded) {
    parts.push("AGENTS.md")
  }
  if (summary.skippedMcpServerNames.length > 0) {
    parts.push(`${summary.skippedMcpServerNames.length} MCP skipped`)
  }
  return parts.length > 0 ? `Loaded Claude context: ${parts.join(", ")}` : null
}
