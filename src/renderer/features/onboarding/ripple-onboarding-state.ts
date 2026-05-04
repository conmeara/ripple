import { atomWithStorage } from "jotai/utils"
import type {
  AnalyticsConsent,
  RippleAnalyticsEventPayload,
  UpdateContactPreferenceInput,
} from "../../../shared/ripple-analytics"

export const RIPPLE_ANALYTICS_TRANSPARENCY_URL =
  "https://github.com/conmeara/ripple/blob/main/docs/privacy/analytics.md"

export type RippleOnboardingState =
  | "notSeen"
  | "seenSkipped"
  | "completed"
  | "dismissedBeforeProject"
  | "resetForDebug"

export type RippleOnboardingCompletionState = "completed" | "skipped"

export interface RippleOnboardingChoices {
  email: string
  weeklyUpdatesEnabled: boolean
  analyticsConsent: AnalyticsConsent
}

export const rippleOnboardingStateAtom =
  atomWithStorage<RippleOnboardingState>(
    "ripple:onboarding-state",
    "notSeen",
    undefined,
    { getOnInit: true },
  )

export const rippleProfileEmailAtom = atomWithStorage<string>(
  "ripple:profile-email",
  "",
  undefined,
  { getOnInit: true },
)

export const rippleWeeklyUpdatesEnabledAtom = atomWithStorage<boolean>(
  "ripple:weekly-updates-enabled",
  false,
  undefined,
  { getOnInit: true },
)

export function shouldShowRippleOnboarding(
  state: RippleOnboardingState,
): boolean {
  return state === "notSeen" || state === "resetForDebug"
}

export function normalizeOptionalEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function getEmailValidationError(
  email: string,
  weeklyUpdatesEnabled: boolean,
): string | null {
  const normalized = normalizeOptionalEmail(email)
  if (!weeklyUpdatesEnabled && !normalized) return null
  if (weeklyUpdatesEnabled && !normalized) {
    return "Enter an email address for weekly updates, or leave weekly updates off."
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return "Enter a valid email address."
  }
  return null
}

export function summarizeOnboardingChoices(
  choices: RippleOnboardingChoices,
): {
  profile_choice: "email_saved" | "skipped"
  analytics_choice: AnalyticsConsent
  update_email_choice: "enabled" | "disabled"
} {
  return {
    profile_choice: normalizeOptionalEmail(choices.email)
      ? "email_saved"
      : "skipped",
    analytics_choice: choices.analyticsConsent,
    update_email_choice: choices.weeklyUpdatesEnabled ? "enabled" : "disabled",
  }
}

export function buildOnboardingCompletedEvent(input: {
  completionState: RippleOnboardingCompletionState
  choices: RippleOnboardingChoices
}): RippleAnalyticsEventPayload {
  return {
    name: "ripple_onboarding_completed",
    properties: {
      completion_state: input.completionState,
      ...summarizeOnboardingChoices(input.choices),
    },
  }
}

export function buildUpdateContactPreferenceInput(
  choices: Pick<RippleOnboardingChoices, "email" | "weeklyUpdatesEnabled">,
  source: "onboarding" | "settings",
): UpdateContactPreferenceInput {
  return {
    email: normalizeOptionalEmail(choices.email) || null,
    weeklyUpdatesEnabled: choices.weeklyUpdatesEnabled,
    source,
  }
}
