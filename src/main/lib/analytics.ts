/**
 * Ripple analytics boundary - main process owned.
 *
 * Renderer code never initializes PostHog directly. This module owns persisted
 * consent, anonymous install identity, contact identity separation,
 * allowlisted/sanitized capture, provider lifecycle, and disabled-by-default
 * local behavior.
 */

import { randomUUID } from "node:crypto"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { PostHog } from "posthog-node"
import {
  bucketSeconds,
  categorizeError,
  sanitizeAnalyticsEventPayload,
  type AnalyticsCaptureResult,
  type AnalyticsConsent,
  type AnalyticsEnvironment,
  type AnalyticsProperties,
  type AnalyticsStatus,
  type ContactSyncStatus,
  type RippleAnalyticsEventName,
  type RippleContactEventName,
  type UpdateContactPreferenceInput,
  type UpdateContactPreferenceState,
} from "../../shared/ripple-analytics"
import {
  getAnalyticsRuntimeConfig,
  type AnalyticsRuntimeConfig,
  type AnalyticsRuntimeOptions,
} from "./config"

const PREFERENCES_FILE = "analytics-preferences.json"
const FIRST_PERMITTED_LAUNCH_MARKER = ".first_permitted_analytics_launch_tracked"

interface AnalyticsPreferences {
  analyticsConsent: AnalyticsConsent
  installId: string
  contactId: string
  contact: UpdateContactPreferenceState
  updatedAt: string
}

interface AnalyticsProvider {
  capture(input: {
    distinctId: string
    event: string
    properties?: Record<string, unknown>
  }): unknown
  shutdown?(): Promise<unknown>
}

interface AnalyticsControllerOptions {
  provider?: AnalyticsProvider
  runtimeConfig?: AnalyticsRuntimeConfig
  runtimeOptions?: AnalyticsRuntimeOptions
  userDataPath?: string
  now?: () => Date
  appVersion?: string
  platform?: NodeJS.Platform
}

const defaultContactState: UpdateContactPreferenceState = {
  email: null,
  weeklyUpdatesEnabled: false,
  syncStatus: "idle",
  updatedAt: new Date(0).toISOString(),
  lastError: null,
}

let preferences: AnalyticsPreferences | null = null
let provider: AnalyticsProvider | null = null
let injectedProvider: AnalyticsProvider | null = null
let initialized = false
let runtimeConfigOverride: AnalyticsRuntimeConfig | null = null
let runtimeOptionsOverride: AnalyticsRuntimeOptions | null = null
let userDataPathOverride: string | null = null
let nowOverride: (() => Date) | null = null
let appVersionOverride: string | null = null
let platformOverride: NodeJS.Platform | null = null

function now(): Date {
  return nowOverride ? nowOverride() : new Date()
}

function getIsoNow(): string {
  return now().toISOString()
}

function getUserDataPath(): string {
  if (userDataPathOverride) return userDataPathOverride
  return path.join(tmpdir(), "ripple-analytics")
}

function getPreferencesPath(): string {
  return path.join(getUserDataPath(), PREFERENCES_FILE)
}

function getFirstPermittedLaunchMarkerPath(): string {
  return path.join(getUserDataPath(), FIRST_PERMITTED_LAUNCH_MARKER)
}

function createDefaultPreferences(): AnalyticsPreferences {
  const timestamp = getIsoNow()
  return {
    analyticsConsent: "unset",
    installId: randomUUID(),
    contactId: randomUUID(),
    contact: {
      ...defaultContactState,
      updatedAt: timestamp,
    },
    updatedAt: timestamp,
  }
}

function normalizeConsent(value: unknown): AnalyticsConsent {
  return value === "granted" || value === "denied" || value === "unset"
    ? value
    : "unset"
}

function normalizeContactSyncStatus(value: unknown): ContactSyncStatus {
  return value === "pending" ||
    value === "synced" ||
    value === "failed" ||
    value === "optedOutPending" ||
    value === "idle"
    ? value
    : "idle"
}

function normalizeContact(value: unknown): UpdateContactPreferenceState {
  if (!value || typeof value !== "object") return { ...defaultContactState }
  const candidate = value as Partial<UpdateContactPreferenceState>
  return {
    email: typeof candidate.email === "string" ? candidate.email : null,
    weeklyUpdatesEnabled: candidate.weeklyUpdatesEnabled === true,
    syncStatus: normalizeContactSyncStatus(candidate.syncStatus),
    updatedAt: typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : getIsoNow(),
    lastError: typeof candidate.lastError === "string" ? candidate.lastError : null,
  }
}

function normalizePreferences(value: unknown): AnalyticsPreferences {
  if (!value || typeof value !== "object") return createDefaultPreferences()
  const candidate = value as Partial<AnalyticsPreferences>
  const defaults = createDefaultPreferences()
  return {
    analyticsConsent: normalizeConsent(candidate.analyticsConsent),
    installId: typeof candidate.installId === "string" && candidate.installId
      ? candidate.installId
      : defaults.installId,
    contactId: typeof candidate.contactId === "string" && candidate.contactId
      ? candidate.contactId
      : defaults.contactId,
    contact: normalizeContact(candidate.contact),
    updatedAt: typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : defaults.updatedAt,
  }
}

function loadPreferences(): AnalyticsPreferences {
  if (preferences) return preferences
  const filePath = getPreferencesPath()
  try {
    const raw = fs.readFileSync(filePath, "utf8")
    preferences = normalizePreferences(JSON.parse(raw))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[Analytics] Could not read analytics preferences:", error)
    }
    preferences = createDefaultPreferences()
    savePreferences(preferences)
  }
  return preferences
}

function savePreferences(next: AnalyticsPreferences): void {
  preferences = next
  try {
    fs.mkdirSync(path.dirname(getPreferencesPath()), { recursive: true })
    fs.writeFileSync(getPreferencesPath(), JSON.stringify(next, null, 2))
  } catch (error) {
    console.warn("[Analytics] Could not save analytics preferences:", error)
  }
}

function getRuntimeConfig(): AnalyticsRuntimeConfig {
  if (runtimeConfigOverride) return runtimeConfigOverride
  return getAnalyticsRuntimeConfig(undefined, runtimeOptionsOverride ?? {})
}

function getAppVersion(): string {
  return appVersionOverride ?? process.env.npm_package_version ?? "0.0.0"
}

function getPlatform(): NodeJS.Platform {
  return platformOverride ?? process.platform
}

function createPostHogProvider(config: AnalyticsRuntimeConfig): AnalyticsProvider | null {
  if (!config.key || !config.host) return null
  return new PostHog(config.key, {
    host: config.host,
    flushAt: 1,
    flushInterval: 5000,
  })
}

function ensureProvider(): AnalyticsProvider | null {
  if (provider) return provider
  const runtime = getRuntimeConfig()
  if (!runtime.configured || !runtime.enabled) return null
  provider = injectedProvider ?? createPostHogProvider(runtime)
  return provider
}

function getDistinctId(): string {
  return `anon:${loadPreferences().installId}`
}

function getContactDistinctId(): string {
  return `contact:${loadPreferences().contactId}`
}

function getCommonProperties(runtime: AnalyticsRuntimeConfig): AnalyticsProperties {
  return {
    app_version: getAppVersion(),
    platform: getPlatform(),
    environment: runtime.environment as AnalyticsEnvironment,
    capture_source: "main_process",
  }
}

function isFirstPermittedLaunch(): boolean {
  try {
    return !fs.existsSync(getFirstPermittedLaunchMarkerPath())
  } catch {
    return false
  }
}

function markFirstPermittedLaunchTracked(): void {
  try {
    fs.writeFileSync(getFirstPermittedLaunchMarkerPath(), getIsoNow())
  } catch {
    // Local marker failure should not block the app or analytics capture.
  }
}

function logSkippedCapture(status: AnalyticsCaptureResult): void {
  if (status.status === "consent_required") return
  if (status.status === "disabled" || status.status === "unconfigured") return
  if (status.status === "invalid_event") {
    console.warn("[Analytics] Dropped invalid analytics event:", status.reason)
  }
}

export function initAnalytics(options: AnalyticsControllerOptions = {}): void {
  injectedProvider = options.provider ?? injectedProvider
  runtimeConfigOverride = options.runtimeConfig ?? runtimeConfigOverride
  runtimeOptionsOverride = options.runtimeOptions ?? runtimeOptionsOverride
  userDataPathOverride = options.userDataPath ?? userDataPathOverride
  nowOverride = options.now ?? nowOverride
  appVersionOverride = options.appVersion ?? appVersionOverride
  platformOverride = options.platform ?? platformOverride

  loadPreferences()
  initialized = true

  const runtime = getRuntimeConfig()
  if (!runtime.configured) {
    console.log("[Analytics] Disabled; Ripple PostHog is not configured")
  } else if (!runtime.enabled) {
    console.log(`[Analytics] Disabled; ${runtime.reason}`)
  } else {
    console.log(`[Analytics] Ready; capture requires explicit consent (${runtime.environment})`)
  }
}

export function getAnalyticsStatus(): AnalyticsStatus {
  const prefs = loadPreferences()
  const runtime = getRuntimeConfig()
  const captureEnabled =
    runtime.configured &&
    runtime.enabled &&
    prefs.analyticsConsent === "granted"

  return {
    consent: prefs.analyticsConsent,
    environment: runtime.environment as AnalyticsEnvironment,
    configured: runtime.configured,
    runtimeEnabled: runtime.enabled,
    captureEnabled,
    reason: captureEnabled ? "enabled" : runtime.reason,
    provider: runtime.configured ? "posthog" : "none",
    contactSyncStatus: prefs.contact.syncStatus,
  }
}

export function getAnalyticsConsent(): AnalyticsConsent {
  return loadPreferences().analyticsConsent
}

export function migrateLegacyAnalyticsOptOut(optedOut: boolean): AnalyticsStatus {
  const prefs = loadPreferences()
  if (prefs.analyticsConsent === "unset" && optedOut) {
    savePreferences({
      ...prefs,
      analyticsConsent: "denied",
      updatedAt: getIsoNow(),
    })
  }
  return getAnalyticsStatus()
}

export function setAnalyticsConsent(
  consent: AnalyticsConsent,
  source = "settings",
): AnalyticsStatus {
  const prefs = loadPreferences()
  savePreferences({
    ...prefs,
    analyticsConsent: consent,
    updatedAt: getIsoNow(),
  })

  if (consent === "granted") {
    const result = captureAnalyticsEvent({
      name: "ripple_analytics_consent_granted",
      properties: { consent_source: source },
    })
    logSkippedCapture(result)
  }

  return getAnalyticsStatus()
}

export function captureAnalyticsEvent(input: {
  name: RippleAnalyticsEventName
  properties?: AnalyticsProperties
}): AnalyticsCaptureResult {
  if (!initialized) initAnalytics()

  const prefs = loadPreferences()
  if (prefs.analyticsConsent !== "granted") {
    return {
      status: "consent_required",
      captured: false,
      reason: "analytics consent is not granted",
    }
  }

  const runtime = getRuntimeConfig()
  if (!runtime.configured) {
    return {
      status: "unconfigured",
      captured: false,
      reason: runtime.reason,
    }
  }
  if (!runtime.enabled) {
    return {
      status: "disabled",
      captured: false,
      reason: runtime.reason,
    }
  }

  let sanitized
  try {
    sanitized = sanitizeAnalyticsEventPayload({
      name: input.name,
      properties: {
        ...input.properties,
        ...getCommonProperties(runtime),
      },
    })
  } catch (error) {
    return {
      status: "invalid_event",
      captured: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  const activeProvider = ensureProvider()
  if (!activeProvider) {
    return {
      status: "unconfigured",
      captured: false,
      reason: "provider unavailable",
    }
  }

  try {
    activeProvider.capture({
      distinctId: getDistinctId(),
      event: sanitized.name,
      properties: sanitized.properties,
    })
    return { status: "captured", captured: true }
  } catch (error) {
    return {
      status: "provider_error",
      captured: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export function trackAppOpened(): void {
  const firstPermittedLaunch = isFirstPermittedLaunch()
  const result = captureAnalyticsEvent({
    name: "ripple_app_opened",
    properties: {
      first_permitted_launch: firstPermittedLaunch,
      launch_kind: "normal",
    },
  })
  if (result.captured && firstPermittedLaunch) {
    markFirstPermittedLaunchTracked()
  } else {
    logSkippedCapture(result)
  }
}

export function trackProjectCreated(input: {
  creationSource: string
  projectKind: string
  result?: string
  templateId?: string | null
  setupStatus?: string | null
  compositionCount?: number | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_project_created",
    properties: {
      creation_source: input.creationSource,
      project_kind: input.projectKind,
      result: input.result ?? "success",
      template_id: input.templateId ?? undefined,
      setup_status: input.setupStatus ?? undefined,
      composition_count_bucket: input.compositionCount == null
        ? undefined
        : String(input.compositionCount <= 0 ? "0" : input.compositionCount <= 1 ? "1" : input.compositionCount <= 3 ? "2-3" : input.compositionCount <= 10 ? "4-10" : "11+"),
    },
  }))
}

export function trackProjectOpened(input: {
  openSource: string
  projectKind: string
  setupStatus?: string | null
  compositionCount?: number | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_project_opened",
    properties: {
      open_source: input.openSource,
      project_kind: input.projectKind,
      setup_status: input.setupStatus ?? undefined,
      composition_count_bucket: input.compositionCount == null
        ? undefined
        : String(input.compositionCount <= 0 ? "0" : input.compositionCount <= 1 ? "1" : input.compositionCount <= 3 ? "2-3" : input.compositionCount <= 10 ? "4-10" : "11+"),
    },
  }))
}

export function trackFirstRunSetupFailure(input: {
  setupStep: string
  error: unknown
  runtimeStatus?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_first_run_setup_failed",
    properties: {
      setup_step: input.setupStep,
      error_category: categorizeError(input.error),
      runtime_status: input.runtimeStatus ?? undefined,
    },
  }))
}

export function trackPreviewReady(input: {
  previewSource: string
  durationSeconds?: number | null
  runtimeStatus?: string | null
  compositionKind?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_preview_ready",
    properties: {
      preview_source: input.previewSource,
      duration_bucket: bucketSeconds(input.durationSeconds),
      runtime_status: input.runtimeStatus ?? undefined,
      composition_kind: input.compositionKind ?? undefined,
    },
  }))
}

export function trackPreviewFailed(input: {
  previewSource: string
  error: unknown
  runtimeStatus?: string | null
  compositionKind?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_preview_failed",
    properties: {
      preview_source: input.previewSource,
      error_category: categorizeError(input.error),
      runtime_status: input.runtimeStatus ?? undefined,
      composition_kind: input.compositionKind ?? undefined,
    },
  }))
}

export function trackCommentCreated(input: {
  commentScope: string
  frameBucket?: string | null
  elementTarget?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_comment_created",
    properties: {
      comment_scope: input.commentScope,
      frame_bucket: input.frameBucket ?? undefined,
      element_target: input.elementTarget ?? undefined,
    },
  }))
}

export function trackCommentReplied(commentScope: string): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_comment_replied",
    properties: { comment_scope: commentScope },
  }))
}

export function trackCommentResolved(commentScope: string): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_comment_resolved",
    properties: { comment_scope: commentScope },
  }))
}

export function trackRevisionRequested(input: {
  revisionSource: string
  commentScope?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_revision_requested",
    properties: {
      revision_source: input.revisionSource,
      comment_scope: input.commentScope ?? undefined,
    },
  }))
}

export function trackRevisionAccepted(input: {
  acceptanceSource: string
  changeCountBucket?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_revision_accepted",
    properties: {
      acceptance_source: input.acceptanceSource,
      change_count_bucket: input.changeCountBucket ?? undefined,
    },
  }))
}

export function trackRevisionRejected(input: {
  rejectionSource: string
  changeCountBucket?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_revision_rejected",
    properties: {
      rejection_source: input.rejectionSource,
      change_count_bucket: input.changeCountBucket ?? undefined,
    },
  }))
}

export function trackChatCreated(input: {
  chatKind: string
  isIsolated: boolean
  entryPoint?: string
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_chat_created",
    properties: {
      chat_kind: input.chatKind,
      is_isolated: input.isIsolated,
      entry_point: input.entryPoint,
    },
  }))
}

export function trackChatArchived(chatKind: string): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_chat_archived",
    properties: { chat_kind: chatKind },
  }))
}

export function trackChatDeleted(chatKind: string): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_chat_deleted",
    properties: { chat_kind: chatKind },
  }))
}

export function trackExportStarted(input: {
  format: string
  qualityPreset: string
  durationSeconds?: number | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_export_started",
    properties: {
      format: input.format,
      quality_preset: input.qualityPreset,
      duration_bucket: bucketSeconds(input.durationSeconds),
    },
  }))
}

export function trackExportSucceeded(input: {
  format: string
  qualityPreset: string
  durationSeconds?: number | null
  renderSeconds?: number | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_export_succeeded",
    properties: {
      format: input.format,
      quality_preset: input.qualityPreset,
      duration_bucket: bucketSeconds(input.durationSeconds),
      render_time_bucket: bucketSeconds(input.renderSeconds),
    },
  }))
}

export function trackExportFailed(input: {
  format: string
  qualityPreset: string
  durationSeconds?: number | null
  error: unknown
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_export_failed",
    properties: {
      format: input.format,
      quality_preset: input.qualityPreset,
      duration_bucket: bucketSeconds(input.durationSeconds),
      error_category: categorizeError(input.error),
    },
  }))
}

export function trackExportCancelled(input: {
  format: string
  qualityPreset?: string | null
}): void {
  logSkippedCapture(captureAnalyticsEvent({
    name: "ripple_export_cancelled",
    properties: {
      format: input.format,
      quality_preset: input.qualityPreset ?? undefined,
    },
  }))
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase()
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid email address for weekly updates.")
  }
  return trimmed
}

function normalizeContactSource(source: string | null | undefined): string {
  switch (source) {
    case "settings":
    case "onboarding":
      return source
    default:
      return "unknown"
  }
}

function captureContactEvent(
  event: RippleContactEventName,
  contact: UpdateContactPreferenceState,
  source: string,
): AnalyticsCaptureResult {
  const runtime = getRuntimeConfig()
  if (!runtime.configured) {
    return { status: "unconfigured", captured: false, reason: runtime.reason }
  }
  if (!runtime.enabled) {
    return { status: "disabled", captured: false, reason: runtime.reason }
  }
  const activeProvider = ensureProvider()
  if (!activeProvider) {
    return { status: "unconfigured", captured: false, reason: "provider unavailable" }
  }

  try {
    activeProvider.capture({
      distinctId: getContactDistinctId(),
      event,
      properties: {
        email: contact.email,
        weekly_updates_enabled: contact.weeklyUpdatesEnabled,
        contact_source: source,
        app_version: getAppVersion(),
        platform: getPlatform(),
        environment: runtime.environment,
      },
    })
    return { status: "captured", captured: true }
  } catch (error) {
    return {
      status: "provider_error",
      captured: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export function syncUpdateContactPreference(
  input: UpdateContactPreferenceInput,
): UpdateContactPreferenceState {
  if (!initialized) initAnalytics()

  const prefs = loadPreferences()
  const email = normalizeEmail(input.email ?? prefs.contact.email)
  const source = normalizeContactSource(input.source ?? "settings")
  const event: RippleContactEventName = input.weeklyUpdatesEnabled
    ? prefs.contact.weeklyUpdatesEnabled ? "ripple_contact_updated" : "ripple_contact_opt_in"
    : "ripple_contact_opt_out"

  if (input.weeklyUpdatesEnabled && !email) {
    throw new Error("Enter an email address to receive weekly Ripple updates.")
  }

  const nextContact: UpdateContactPreferenceState = {
    email,
    weeklyUpdatesEnabled: input.weeklyUpdatesEnabled,
    syncStatus: input.weeklyUpdatesEnabled ? "pending" : "optedOutPending",
    updatedAt: getIsoNow(),
    lastError: null,
  }

  savePreferences({
    ...prefs,
    contact: nextContact,
    updatedAt: getIsoNow(),
  })

  const result = captureContactEvent(event, nextContact, source)
  const finalContact: UpdateContactPreferenceState = {
    ...nextContact,
    syncStatus: result.captured
      ? "synced"
      : result.status === "provider_error" ? "failed" : nextContact.syncStatus,
    lastError: result.status === "provider_error" ? result.reason ?? "provider_error" : null,
  }
  savePreferences({
    ...loadPreferences(),
    contact: finalContact,
    updatedAt: getIsoNow(),
  })

  return finalContact
}

export async function shutdown(): Promise<void> {
  if (provider?.shutdown) {
    try {
      await provider.shutdown()
    } catch (error) {
      console.warn("[Analytics] Failed to shut down provider:", error)
    }
  }
  provider = null
  initialized = false
}

export function resetAnalyticsForTests(): void {
  preferences = null
  provider = null
  injectedProvider = null
  initialized = false
  runtimeConfigOverride = null
  runtimeOptionsOverride = null
  userDataPathOverride = null
  nowOverride = null
  appVersionOverride = null
  platformOverride = null
}
