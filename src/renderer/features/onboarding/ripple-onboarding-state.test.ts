import { describe, expect, test } from "bun:test"
import {
  buildOnboardingCompletedEvent,
  buildUpdateContactPreferenceInput,
  getEmailValidationError,
  shouldShowRippleOnboarding,
  summarizeOnboardingChoices,
} from "./ripple-onboarding-state"

describe("Ripple first-run onboarding state", () => {
  test("shows only for fresh or debug-reset states", () => {
    expect(shouldShowRippleOnboarding("notSeen")).toBe(true)
    expect(shouldShowRippleOnboarding("resetForDebug")).toBe(true)
    expect(shouldShowRippleOnboarding("completed")).toBe(false)
    expect(shouldShowRippleOnboarding("seenSkipped")).toBe(false)
    expect(shouldShowRippleOnboarding("dismissedBeforeProject")).toBe(false)
  })

  test("keeps email out of anonymous onboarding analytics", () => {
    const event = buildOnboardingCompletedEvent({
      completionState: "completed",
      choices: {
        email: "person@example.com",
        weeklyUpdatesEnabled: true,
        analyticsConsent: "granted",
      },
    })

    expect(event).toEqual({
      name: "ripple_onboarding_completed",
      properties: {
        completion_state: "completed",
        profile_choice: "email_saved",
        analytics_choice: "granted",
        update_email_choice: "enabled",
      },
    })
    expect(JSON.stringify(event)).not.toContain("person@example.com")
  })

  test("models email, analytics, and update emails as separate choices", () => {
    expect(
      summarizeOnboardingChoices({
        email: "",
        weeklyUpdatesEnabled: false,
        analyticsConsent: "denied",
      }),
    ).toEqual({
      profile_choice: "skipped",
      analytics_choice: "denied",
      update_email_choice: "disabled",
    })

    expect(
      buildUpdateContactPreferenceInput(
        {
          email: " Person@Example.COM ",
          weeklyUpdatesEnabled: true,
        },
        "onboarding",
      ),
    ).toEqual({
      email: "person@example.com",
      weeklyUpdatesEnabled: true,
      source: "onboarding",
    })
  })

  test("requires email only when weekly updates are enabled", () => {
    expect(getEmailValidationError("", false)).toBeNull()
    expect(getEmailValidationError("", true)).toMatch(/Enter an email/)
    expect(getEmailValidationError("not-email", false)).toMatch(/valid email/)
    expect(getEmailValidationError("person@example.com", true)).toBeNull()
  })
})
