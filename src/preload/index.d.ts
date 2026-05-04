import type {
  AnalyticsCaptureResult,
  AnalyticsConsent,
  AnalyticsStatus,
  RippleAnalyticsEventPayload,
  UpdateContactPreferenceInput,
  UpdateContactPreferenceState,
} from "../shared/ripple-analytics"

export type UpdateReleaseNotes = string | Array<{ version?: string; note?: string }>

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: UpdateReleaseNotes
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

export interface WorktreeSetupFailurePayload {
  kind: "create-failed" | "setup-failed"
  message: string
  projectId: string
}

export interface DesktopApi {
  // Platform info
  platform: NodeJS.Platform
  arch: string
  getVersion: () => Promise<string>
  isPackaged: () => Promise<boolean>

  // Auto-update
  checkForUpdates: (force?: boolean) => Promise<UpdateInfo | null>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => void
  setUpdateChannel: (channel: "latest" | "beta") => Promise<boolean>
  getUpdateChannel: () => Promise<"latest" | "beta">
  getAutoUpdateChecksEnabled: () => Promise<boolean>
  setAutoUpdateChecksEnabled: (enabled: boolean) => Promise<boolean>
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
  onUpdateManualCheck: (callback: () => void) => () => void

  // Window controls
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  windowToggleFullscreen: () => Promise<void>
  windowIsFullscreen: () => Promise<boolean>
  setTrafficLightVisibility: (visible: boolean) => Promise<void>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  onFocusChange: (callback: (isFocused: boolean) => void) => () => void

  // Zoom
  zoomIn: () => Promise<void>
  zoomOut: () => Promise<void>
  zoomReset: () => Promise<void>
  getZoom: () => Promise<number>

  // DevTools
  toggleDevTools: () => Promise<void>

  // Analytics
  getAnalyticsStatus: () => Promise<AnalyticsStatus>
  setAnalyticsConsent: (consent: AnalyticsConsent, source?: string) => Promise<AnalyticsStatus>
  migrateLegacyAnalyticsOptOut: (optedOut: boolean) => Promise<AnalyticsStatus>
  captureAnalyticsEvent: (payload: RippleAnalyticsEventPayload) => Promise<AnalyticsCaptureResult>
  syncUpdateContactPreference: (input: UpdateContactPreferenceInput) => Promise<UpdateContactPreferenceState>
  getUpdateContactPreference: () => Promise<UpdateContactPreferenceState>
  setAnalyticsOptOut: (optedOut: boolean) => Promise<void>

  // Native features
  setBadge: (count: number | null) => Promise<void>
  showNotification: (options: { title: string; body: string }) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getApiBaseUrl: () => Promise<string | null>
  hostedApiFetch: (
    streamId: string,
    path: string,
    options?: { method?: string; body?: string; headers?: Record<string, string> },
  ) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; error: string | null }>
  abortHostedApiFetch: (streamId: string) => Promise<boolean>
  onStreamChunk: (streamId: string, callback: (chunk: Uint8Array) => void) => () => void
  onStreamDone: (streamId: string, callback: () => void) => () => void
  onStreamError: (streamId: string, callback: (error: string) => void) => () => void

  // Clipboard
  clipboardWrite: (text: string) => Promise<void>
  clipboardRead: () => Promise<string>

  // Auth
  getUser: () => Promise<DesktopUser | null>
  isAuthenticated: () => Promise<boolean>
  logout: () => Promise<void>
  startAuthFlow: () => Promise<void>
  submitAuthCode: (code: string) => Promise<void>
  updateUser: (updates: { name?: string }) => Promise<DesktopUser | null>
  onAuthSuccess: (callback: (user: any) => void) => () => void
  onAuthError: (callback: (error: string) => void) => () => void

  // Multi-window
  newWindow: (options?: { chatId?: string; subChatId?: string }) => Promise<{ blocked: boolean } | void>

  // Chat ownership — prevent same chat open in multiple windows
  claimChat: (chatId: string) => Promise<{ ok: true } | { ok: false; ownerStableId: string }>
  releaseChat: (chatId: string) => Promise<void>
  focusChatOwner: (chatId: string) => Promise<boolean>

  // Shortcuts
  onShortcutNewAgent: (callback: () => void) => () => void

  // Worktree setup failures
  onWorktreeSetupFailed: (callback: (payload: WorktreeSetupFailurePayload) => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
