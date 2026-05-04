/**
 * Ripple analytics boundary - renderer process.
 *
 * Phase 15 intentionally keeps inherited analytics no-op. Phase 16 will add
 * Ripple-owned consent, event taxonomy, and provider configuration.
 */

let initialized = false
let currentUserId: string | null = null

/**
 * Check if user has opted out of analytics
 * Reads directly from localStorage to avoid circular dependencies
 */
function isOptedOut(): boolean {
  try {
    const optOut = localStorage.getItem("preferences:analytics-opt-out")
    return optOut === "true"
  } catch {
    return false
  }
}

/**
 * Initialize analytics for renderer process.
 */
export async function initAnalytics() {
  if (initialized) return

  initialized = true
  console.log("[Analytics] Disabled for Phase 15; awaiting Ripple analytics setup")
}

/**
 * Capture an analytics event
 */
export function capture(
  eventName: string,
  properties?: Record<string, any>,
) {
  void eventName
  void properties
  if (!initialized || isOptedOut()) return
}

/**
 * Identify a user
 */
export function identify(
  userId: string,
  traits?: Record<string, any>,
) {
  currentUserId = userId

  void traits
  if (!initialized || isOptedOut()) return
}

/**
 * Get current user ID
 */
export function getCurrentUserId(): string | null {
  return currentUserId
}

/**
 * Reset user identification (on logout)
 */
export function reset() {
  currentUserId = null
}

/**
 * Shutdown PostHog
 */
export function shutdown() {
  if (initialized) {
    initialized = false
  }
}

// ============================================================================
// Specific event helpers (for renderer-specific events)
// ============================================================================

/**
 * Track message sent from UI
 */
export function trackMessageSent(data: {
  workspaceId: string
  messageLength: number
  mode: "plan" | "agent"
}) {
  capture("message_sent", {
    workspace_id: data.workspaceId,
    message_length: data.messageLength,
    mode: data.mode,
  })
}
