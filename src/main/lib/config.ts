/**
 * Shared configuration for the desktop app
 */
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

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
 * future Ripple service can opt in through MAIN_VITE_API_URL, but legacy 21st
 * URLs are treated as disabled.
 */
export function getApiUrl(): string | null {
  const configured = (import.meta.env.MAIN_VITE_API_URL as string | undefined)?.trim()
  if (!configured || isLegacy21stUrl(configured)) return null
  return configured.replace(/\/+$/, "")
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
