import { RIPPLE_IDENTITY } from "../../shared/app-identity"

const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

type RuntimeEnv = Record<string, string | undefined>

const LEGACY_API_ENV = "MAIN_VITE_API_URL"
const LEGACY_UPDATE_ENV = "MAIN_VITE_UPDATE_URL"
const ANALYTICS_FORCE_ENV = "MAIN_VITE_RIPPLE_ANALYTICS_FORCE"

export interface AnalyticsRuntimeOptions {
  isPackaged?: boolean
  isDev?: boolean
  isTest?: boolean
}

export interface AnalyticsRuntimeConfig {
  key: string | null
  host: string | null
  configured: boolean
  enabled: boolean
  environment: "production" | "development" | "test"
  reason: string
  forced: boolean
}

function getImportMetaEnv(): RuntimeEnv {
  return ((import.meta as unknown as { env?: RuntimeEnv }).env ?? {}) as RuntimeEnv
}

function getRuntimeEnv(): RuntimeEnv {
  return {
    ...process.env,
    ...getImportMetaEnv(),
  }
}

function getTrimmedEnvValue(env: RuntimeEnv, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return null
}

export function isLegacy21stUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === "21st.dev" || hostname.endsWith(".21st.dev")
  } catch {
    return value.includes("21st.dev")
  }
}

/**
 * Get an explicitly configured hosted API URL.
 *
 * Ripple local-first boot must not default to the old 21st.dev backend. A
 * future Ripple service can opt in through MAIN_VITE_RIPPLE_API_URL. The older
 * MAIN_VITE_API_URL is accepted only for non-legacy local/private builds.
 */
export function getConfiguredApiUrl(env: RuntimeEnv = getRuntimeEnv()): string | null {
  const configured = getTrimmedEnvValue(
    env,
    RIPPLE_IDENTITY.env.apiUrl,
    LEGACY_API_ENV,
  )
  if (!configured || isLegacy21stUrl(configured)) return null
  return configured.replace(/\/+$/, "")
}

export function getApiUrl(): string | null {
  return getConfiguredApiUrl()
}

export function getConfiguredUpdateFeedUrl(
  env: RuntimeEnv = getRuntimeEnv(),
): string | null {
  const configured = getTrimmedEnvValue(
    env,
    RIPPLE_IDENTITY.env.updateUrl,
    LEGACY_UPDATE_ENV,
  )
  if (!configured || isLegacy21stUrl(configured)) return null
  return configured.replace(/\/+$/, "")
}

export function getReservedAnalyticsEnv(env: RuntimeEnv = getRuntimeEnv()): {
  mainKey: string | null
  mainHost: string | null
  rendererKey: string | null
  rendererHost: string | null
  force: boolean
} {
  return {
    mainKey: getTrimmedEnvValue(env, RIPPLE_IDENTITY.env.analyticsKey),
    mainHost: getTrimmedEnvValue(env, RIPPLE_IDENTITY.env.analyticsHost),
    rendererKey: getTrimmedEnvValue(env, RIPPLE_IDENTITY.env.rendererAnalyticsKey),
    rendererHost: getTrimmedEnvValue(env, RIPPLE_IDENTITY.env.rendererAnalyticsHost),
    force: env[ANALYTICS_FORCE_ENV] === "true",
  }
}

export function getAnalyticsRuntimeConfig(
  env: RuntimeEnv = getRuntimeEnv(),
  options: AnalyticsRuntimeOptions = {},
): AnalyticsRuntimeConfig {
  const reserved = getReservedAnalyticsEnv(env)
  const isTest =
    options.isTest ??
    (env.NODE_ENV === "test" || env.BUN_ENV === "test")
  const isDev = options.isDev ?? Boolean(env.ELECTRON_RENDERER_URL)
  const isPackaged = options.isPackaged ?? (!isDev && !isTest)
  const environment =
    isTest ? "test" : isDev || !isPackaged ? "development" : "production"

  if (!reserved.mainKey || !reserved.mainHost) {
    return {
      key: reserved.mainKey,
      host: reserved.mainHost,
      configured: false,
      enabled: false,
      environment,
      reason: "unconfigured",
      forced: reserved.force,
    }
  }

  if (reserved.force) {
    return {
      key: reserved.mainKey,
      host: reserved.mainHost,
      configured: true,
      enabled: true,
      environment,
      reason: "forced",
      forced: true,
    }
  }

  if (isTest) {
    return {
      key: reserved.mainKey,
      host: reserved.mainHost,
      configured: true,
      enabled: false,
      environment,
      reason: "disabled_in_test",
      forced: false,
    }
  }

  if (isDev || !isPackaged) {
    return {
      key: reserved.mainKey,
      host: reserved.mainHost,
      configured: true,
      enabled: false,
      environment,
      reason: "disabled_in_development",
      forced: false,
    }
  }

  return {
    key: reserved.mainKey,
    host: reserved.mainHost,
    configured: true,
    enabled: true,
    environment: "production",
    reason: "enabled",
    forced: false,
  }
}

export function isAnalyticsRuntimeEnabled(
  env?: RuntimeEnv,
  options?: AnalyticsRuntimeOptions,
): boolean {
  return getAnalyticsRuntimeConfig(env, options).enabled
}

export function requireApiUrl(featureName: string): string {
  const apiUrl = getApiUrl()
  if (!apiUrl) {
    throw new Error(`${featureName} is not configured for local Ripple builds`)
  }
  return apiUrl
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return IS_DEV
}
