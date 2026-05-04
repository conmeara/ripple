/// <reference types="vite/client" />

// Extend Vite's ImportMetaEnv with our custom env vars
declare global {
  interface ImportMetaEnv {
    // Main process (MAIN_VITE_ prefix)
    readonly MAIN_VITE_SENTRY_DSN?: string
    readonly MAIN_VITE_RIPPLE_API_URL?: string
    readonly MAIN_VITE_RIPPLE_UPDATE_URL?: string
    readonly MAIN_VITE_RIPPLE_ANALYTICS_KEY?: string
    readonly MAIN_VITE_RIPPLE_ANALYTICS_HOST?: string

    // Renderer process (VITE_ prefix)
    readonly VITE_RIPPLE_ANALYTICS_KEY?: string
    readonly VITE_RIPPLE_ANALYTICS_HOST?: string
    readonly VITE_FEEDBACK_ISSUE_URL?: string
  }
}

export {}
