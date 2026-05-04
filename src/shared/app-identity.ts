export const RIPPLE_IDENTITY = {
  productName: "Ripple",
  devProductName: "Ripple Dev",
  appId: "app.ripple.desktop",
  devAppId: "app.ripple.desktop.dev",
  protocol: "ripple",
  devProtocol: "ripple-dev",
  cliCommand: "ripple",
  legacyCliCommand: "1code",
  mcpClientName: "ripple-desktop",
  oauthClientName: "ripple",
  oauthFallbackClientName: "Codex",
  userDataDir: "Ripple",
  devUserDataDir: "Ripple Dev",
  legacyUserDataDirs: {
    production: ["1Code"],
    dev: ["Agents Dev"],
  },
  legacyProtocols: ["twentyfirst-agents", "twentyfirst-agents-dev"],
  changelogUrl: "https://github.com/conmeara/ripple/releases",
  env: {
    apiUrl: "MAIN_VITE_RIPPLE_API_URL",
    updateUrl: "MAIN_VITE_RIPPLE_UPDATE_URL",
    analyticsKey: "MAIN_VITE_RIPPLE_ANALYTICS_KEY",
    analyticsHost: "MAIN_VITE_RIPPLE_ANALYTICS_HOST",
    rendererAnalyticsKey: "VITE_RIPPLE_ANALYTICS_KEY",
    rendererAnalyticsHost: "VITE_RIPPLE_ANALYTICS_HOST",
  },
} as const

export type RippleIdentity = typeof RIPPLE_IDENTITY

export function getAppProtocol(isDev: boolean): string {
  return isDev ? RIPPLE_IDENTITY.devProtocol : RIPPLE_IDENTITY.protocol
}

export function getAppUserDataDir(isDev: boolean): string {
  return isDev ? RIPPLE_IDENTITY.devUserDataDir : RIPPLE_IDENTITY.userDataDir
}

export function getLegacyUserDataDirs(isDev: boolean): readonly string[] {
  return isDev
    ? RIPPLE_IDENTITY.legacyUserDataDirs.dev
    : RIPPLE_IDENTITY.legacyUserDataDirs.production
}

export function getAppId(isDev: boolean): string {
  return isDev ? RIPPLE_IDENTITY.devAppId : RIPPLE_IDENTITY.appId
}

export function isLegacyProtocol(protocol: string): boolean {
  return RIPPLE_IDENTITY.legacyProtocols.includes(
    protocol.replace(/:$/, "") as (typeof RIPPLE_IDENTITY.legacyProtocols)[number],
  )
}

export function isAcceptedInboundProtocol(protocol: string, isDev: boolean): boolean {
  const normalized = protocol.replace(/:$/, "")
  return normalized === getAppProtocol(isDev) || isLegacyProtocol(normalized)
}
