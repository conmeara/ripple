const APP_SERVER_CLIENT_ID = "ripple-desktop/phase-13"

export const APP_MANAGED_CODEX_SHELL_ENV_NAMES = [
  "PATH",
  "Path",
  "NODE_PATH",
  "HYPERFRAMES_BROWSER_PATH",
  "HYPERFRAMES_NO_AUTO_INSTALL",
  "HYPERFRAMES_NO_TELEMETRY",
  "HYPERFRAMES_NO_UPDATE_CHECK",
  "PRODUCER_HEADLESS_SHELL_PATH",
  "RIPPLE_AGENT_VISUAL_CONTEXT_MODE",
  "RIPPLE_AGENT_WORKSPACE_ROOT",
  "RIPPLE_VISUAL_CONTEXT_BRIDGE_DIR",
  "RIPPLE_VISUAL_CONTEXT_BRIDGE_TOKEN",
  "RIPPLE_VISUAL_CONTEXT_ENDPOINT",
  "RIPPLE_VISUAL_CONTEXT_TOKEN",
] as const

export function buildCodexShellEnvironmentPolicyConfig(
  env?: NodeJS.ProcessEnv,
): {
  inherit: "all"
  include_only: string[]
  ignore_default_excludes: true
  experimental_use_profile: false
  set?: Record<string, string>
} {
  const forcedEnv: Record<string, string> = {}
  for (const name of APP_MANAGED_CODEX_SHELL_ENV_NAMES) {
    const value = env?.[name]
    if (typeof value === "string" && value.length > 0) {
      forcedEnv[name] = value
    }
  }
  return {
    inherit: "all",
    include_only: [...APP_MANAGED_CODEX_SHELL_ENV_NAMES],
    ignore_default_excludes: true,
    experimental_use_profile: false,
    ...(Object.keys(forcedEnv).length > 0 ? { set: forcedEnv } : {}),
  }
}

export function buildCodexAppServerEnv(apiKey?: string | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_APP_SERVER_CLIENT: APP_SERVER_CLIENT_ID,
  }

  const normalizedApiKey = apiKey?.trim()
  if (normalizedApiKey) {
    env.CODEX_API_KEY = normalizedApiKey
    env.OPENAI_API_KEY = normalizedApiKey
  }

  return env
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

export function buildCodexAppServerArgs(env?: NodeJS.ProcessEnv): string[] {
  const args = [
    "app-server",
    "-c",
    "shell_environment_policy.inherit=all",
    "-c",
    `shell_environment_policy.include_only=${JSON.stringify(APP_MANAGED_CODEX_SHELL_ENV_NAMES)}`,
    "-c",
    "shell_environment_policy.ignore_default_excludes=true",
    "-c",
    "shell_environment_policy.experimental_use_profile=false",
  ]
  const pathValue = env?.PATH ?? env?.Path
  if (pathValue) {
    args.push("-c", `shell_environment_policy.set.PATH=${tomlString(pathValue)}`)
  }
  if (process.platform === "win32" && env?.Path) {
    args.push("-c", `shell_environment_policy.set.Path=${tomlString(env.Path)}`)
  }
  return args
}
