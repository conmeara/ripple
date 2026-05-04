import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  captureAnalyticsEvent,
  getAnalyticsStatus,
  initAnalytics,
  resetAnalyticsForTests,
  setAnalyticsConsent,
  syncUpdateContactPreference,
  trackAppOpened,
} from "./analytics"
import type { AnalyticsRuntimeConfig } from "./config"

const enabledRuntime: AnalyticsRuntimeConfig = {
  key: "phc_test",
  host: "https://us.i.posthog.com",
  configured: true,
  enabled: true,
  environment: "production",
  reason: "enabled",
  forced: false,
}

function createProvider() {
  const captures: Array<{
    distinctId: string
    event: string
    properties?: Record<string, unknown>
  }> = []
  return {
    captures,
    provider: {
      capture(input: {
        distinctId: string
        event: string
        properties?: Record<string, unknown>
      }) {
        captures.push(input)
      },
    },
  }
}

async function createUserDataPath(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ripple-analytics-"))
}

afterEach(() => {
  resetAnalyticsForTests()
})

describe("main-process Ripple analytics boundary", () => {
  test("does not capture while consent is unset", async () => {
    const { captures, provider } = createProvider()
    initAnalytics({
      provider,
      runtimeConfig: enabledRuntime,
      userDataPath: await createUserDataPath(),
      appVersion: "0.0.72",
      platform: "darwin",
    })

    const result = captureAnalyticsEvent({
      name: "ripple_project_opened",
      properties: {
        open_source: "project_entry",
        project_kind: "local",
      },
    })

    expect(result.status).toBe("consent_required")
    expect(captures).toHaveLength(0)
    expect(getAnalyticsStatus().captureEnabled).toBe(false)
  })

  test("captures sanitized events after explicit consent", async () => {
    const { captures, provider } = createProvider()
    initAnalytics({
      provider,
      runtimeConfig: enabledRuntime,
      userDataPath: await createUserDataPath(),
      appVersion: "0.0.72",
      platform: "darwin",
    })

    setAnalyticsConsent("granted", "settings")
    const result = captureAnalyticsEvent({
      name: "ripple_export_started",
      properties: {
        format: "mp4",
        quality_preset: "standard",
        duration_bucket: "15_60s",
      },
    })

    expect(result).toEqual({ status: "captured", captured: true })
    expect(captures.map((capture) => capture.event)).toEqual([
      "ripple_analytics_consent_granted",
      "ripple_export_started",
    ])
    expect(String(captures[1]?.distinctId).startsWith("anon:")).toBe(true)
    expect(captures[1]?.properties).toMatchObject({
      format: "mp4",
      environment: "production",
      platform: "darwin",
    })
  })

  test("revoking consent does not send a final product event", async () => {
    const { captures, provider } = createProvider()
    initAnalytics({
      provider,
      runtimeConfig: enabledRuntime,
      userDataPath: await createUserDataPath(),
      appVersion: "0.0.72",
      platform: "darwin",
    })

    setAnalyticsConsent("granted", "settings")
    setAnalyticsConsent("denied", "settings")
    captureAnalyticsEvent({
      name: "ripple_project_opened",
      properties: {
        open_source: "project_entry",
        project_kind: "local",
      },
    })

    expect(captures.map((capture) => capture.event)).toEqual([
      "ripple_analytics_consent_granted",
    ])
  })

  test("rejects forbidden anonymous payloads before provider capture", async () => {
    const { captures, provider } = createProvider()
    initAnalytics({
      provider,
      runtimeConfig: enabledRuntime,
      userDataPath: await createUserDataPath(),
      appVersion: "0.0.72",
      platform: "darwin",
    })
    setAnalyticsConsent("granted", "settings")

    const result = captureAnalyticsEvent({
      name: "ripple_project_opened",
      properties: {
        open_source: "project_entry",
        project_kind: "local",
        setup_status: "/Users/conmeara/Ripple/Project/index.html",
      },
    })

    expect(result.status).toBe("invalid_event")
    expect(captures.map((capture) => capture.event)).toEqual([
      "ripple_analytics_consent_granted",
    ])
  })

  test("first permitted launch marker is written only after capture succeeds", async () => {
    const userDataPath = await createUserDataPath()
    const { captures, provider } = createProvider()
    initAnalytics({
      provider,
      runtimeConfig: { ...enabledRuntime, configured: false, enabled: false, reason: "unconfigured" },
      userDataPath,
      appVersion: "0.0.72",
      platform: "darwin",
    })
    setAnalyticsConsent("granted", "settings")
    trackAppOpened()
    expect(captures).toHaveLength(0)

    resetAnalyticsForTests()
    const active = createProvider()
    initAnalytics({
      provider: active.provider,
      runtimeConfig: enabledRuntime,
      userDataPath,
      appVersion: "0.0.72",
      platform: "darwin",
    })
    setAnalyticsConsent("granted", "settings")
    trackAppOpened()

    const appOpened = active.captures.find((capture) => capture.event === "ripple_app_opened")
    expect(appOpened?.properties?.first_permitted_launch).toBe(true)
    await expect(readFile(join(userDataPath, ".first_permitted_analytics_launch_tracked"), "utf8")).resolves.toContain("T")
  })

  test("weekly update contact capture is separate from anonymous analytics consent", async () => {
    const { captures, provider } = createProvider()
    initAnalytics({
      provider,
      runtimeConfig: enabledRuntime,
      userDataPath: await createUserDataPath(),
      appVersion: "0.0.72",
      platform: "darwin",
    })
    setAnalyticsConsent("denied", "settings")

    const state = syncUpdateContactPreference({
      email: "person@example.com",
      weeklyUpdatesEnabled: true,
      source: "onboarding",
    })

    expect(state.syncStatus).toBe("synced")
    expect(captures).toHaveLength(1)
    expect(String(captures[0]?.distinctId).startsWith("contact:")).toBe(true)
    expect(captures[0]?.event).toBe("ripple_contact_opt_in")
    expect(captures[0]?.properties).toMatchObject({
      email: "person@example.com",
      weekly_updates_enabled: true,
      contact_source: "onboarding",
    })
  })

  test("clamps update contact source before capture", async () => {
    const { captures, provider } = createProvider()
    initAnalytics({
      provider,
      runtimeConfig: enabledRuntime,
      userDataPath: await createUserDataPath(),
      appVersion: "0.0.72",
      platform: "darwin",
    })

    syncUpdateContactPreference({
      email: "person@example.com",
      weeklyUpdatesEnabled: true,
      source: "failed at /Users/alice/Ripple/index.html phc_12345678901234567890",
    })

    expect(captures).toHaveLength(1)
    expect(captures[0]?.properties?.contact_source).toBe("unknown")
  })
})
