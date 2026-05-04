import { describe, expect, test } from "bun:test"
import {
  getConfiguredApiUrl,
  getConfiguredUpdateFeedUrl,
  getReservedAnalyticsEnv,
  isAnalyticsRuntimeEnabled,
  isLegacy21stUrl,
} from "./config"

describe("Ripple hosted service config", () => {
  test("leaves hosted services disabled when env vars are unset", () => {
    expect(getConfiguredApiUrl({})).toBeNull()
    expect(getConfiguredUpdateFeedUrl({})).toBeNull()
  })

  test("rejects legacy 21st.dev URLs", () => {
    expect(isLegacy21stUrl("https://21st.dev")).toBe(true)
    expect(isLegacy21stUrl("https://api.21st.dev/desktop")).toBe(true)
    expect(
      getConfiguredApiUrl({ MAIN_VITE_RIPPLE_API_URL: "https://21st.dev" }),
    ).toBeNull()
    expect(
      getConfiguredUpdateFeedUrl({
        MAIN_VITE_RIPPLE_UPDATE_URL: "https://cdn.21st.dev/releases/desktop",
      }),
    ).toBeNull()
  })

  test("accepts Ripple-owned API and update env vars", () => {
    expect(
      getConfiguredApiUrl({
        MAIN_VITE_RIPPLE_API_URL: "https://api.ripple.local///",
      }),
    ).toBe("https://api.ripple.local")
    expect(
      getConfiguredUpdateFeedUrl({
        MAIN_VITE_RIPPLE_UPDATE_URL: "https://updates.ripple.local///",
      }),
    ).toBe("https://updates.ripple.local")
  })

  test("keeps non-legacy old env compatibility while preferring Ripple names", () => {
    expect(
      getConfiguredApiUrl({
        MAIN_VITE_API_URL: "http://localhost:3000/",
      }),
    ).toBe("http://localhost:3000")
    expect(
      getConfiguredApiUrl({
        MAIN_VITE_RIPPLE_API_URL: "https://api.ripple.local",
        MAIN_VITE_API_URL: "http://localhost:3000",
      }),
    ).toBe("https://api.ripple.local")
  })

  test("reserves Ripple analytics env names while Phase 15 keeps analytics no-op", () => {
    expect(
      getReservedAnalyticsEnv({
        MAIN_VITE_RIPPLE_ANALYTICS_KEY: "phc_test",
        MAIN_VITE_RIPPLE_ANALYTICS_HOST: "https://analytics.ripple.local",
        VITE_RIPPLE_ANALYTICS_KEY: "phc_renderer",
        VITE_RIPPLE_ANALYTICS_HOST: "https://renderer.ripple.local",
      }),
    ).toEqual({
      mainKey: "phc_test",
      mainHost: "https://analytics.ripple.local",
      rendererKey: "phc_renderer",
      rendererHost: "https://renderer.ripple.local",
    })
    expect(isAnalyticsRuntimeEnabled()).toBe(false)
  })
})
