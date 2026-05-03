const APP_SERVER_CLIENT_ID = "ripple-desktop/phase-13"

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
