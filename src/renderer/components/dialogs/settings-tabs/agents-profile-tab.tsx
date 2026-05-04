import { useAtom } from "jotai"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { UpdateContactPreferenceState } from "../../../../shared/ripple-analytics"
import {
  buildUpdateContactPreferenceInput,
  getEmailValidationError,
  normalizeOptionalEmail,
  rippleProfileEmailAtom,
  rippleWeeklyUpdatesEnabledAtom,
} from "../../../features/onboarding/ripple-onboarding-state"
import { Button } from "../../ui/button"
import { IconSpinner } from "../../../icons"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"
import { Switch } from "../../ui/switch"

function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

function formatSyncStatus(state: UpdateContactPreferenceState | null): string {
  if (!state?.weeklyUpdatesEnabled) return "Weekly updates are off."
  if (state.syncStatus === "synced") return "Weekly updates are enabled."
  if (state.syncStatus === "failed") return "Saved locally. Sync can be retried."
  return "Saved locally. Sync will run when contact capture is available."
}

export function AgentsProfileTab() {
  const [storedEmail, setStoredEmail] = useAtom(rippleProfileEmailAtom)
  const [weeklyUpdatesEnabled, setWeeklyUpdatesEnabled] = useAtom(
    rippleWeeklyUpdatesEnabledAtom,
  )
  const [emailDraft, setEmailDraft] = useState(storedEmail)
  const [contactState, setContactState] =
    useState<UpdateContactPreferenceState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNarrowScreen = useIsNarrowScreen()

  useEffect(() => {
    let cancelled = false
    window.desktopApi?.getUpdateContactPreference()
      .then((state) => {
        if (cancelled) return
        setContactState(state)
        const nextEmail = storedEmail || state.email || ""
        setEmailDraft(nextEmail)
        if (!storedEmail && state.email) setStoredEmail(state.email)
        setWeeklyUpdatesEnabled(state.weeklyUpdatesEnabled)
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [setStoredEmail, setWeeklyUpdatesEnabled, storedEmail])

  const savePreferences = async (nextWeeklyUpdatesEnabled = weeklyUpdatesEnabled) => {
    const validationError = getEmailValidationError(
      emailDraft,
      nextWeeklyUpdatesEnabled,
    )
    if (validationError) {
      setError(validationError)
      return
    }

    const normalizedEmail = normalizeOptionalEmail(emailDraft)
    setError(null)
    setIsSaving(true)
    setStoredEmail(normalizedEmail)
    setWeeklyUpdatesEnabled(nextWeeklyUpdatesEnabled)

    try {
      const shouldSyncOptIn = nextWeeklyUpdatesEnabled
      const shouldSyncOptOut =
        !nextWeeklyUpdatesEnabled && contactState?.weeklyUpdatesEnabled
      const shouldSyncClear =
        !nextWeeklyUpdatesEnabled && Boolean(contactState?.email) && !normalizedEmail

      if (shouldSyncOptIn || shouldSyncOptOut || shouldSyncClear) {
        const nextContact = await window.desktopApi?.syncUpdateContactPreference(
          buildUpdateContactPreferenceInput(
            {
              email: shouldSyncOptOut && !shouldSyncClear
                ? contactState?.email ?? normalizedEmail
                : normalizedEmail,
              weeklyUpdatesEnabled: nextWeeklyUpdatesEnabled,
            },
            "settings",
          ),
        )
        if (nextContact) setContactState(nextContact)
      } else {
        setContactState((current) =>
          current
            ? {
                ...current,
                email: normalizedEmail || null,
                weeklyUpdatesEnabled: false,
              }
            : current,
        )
      }

      toast.success("Profile preferences saved")
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError)
      setError(message)
      toast.error("Profile preferences were not synced", {
        description: "Local app access is unchanged.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <IconSpinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {!isNarrowScreen && (
        <div className="flex items-center justify-between pb-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Ripple Profile</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional contact preferences for this local app.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="flex items-center justify-between gap-6 p-4">
          <div className="flex-1">
            <Label className="text-sm font-medium" htmlFor="ripple-profile-email">
              Email
            </Label>
            <p className="text-sm text-muted-foreground">
              Optional. Ripple works locally if this is blank.
            </p>
          </div>
          <div className="w-80 flex-shrink-0">
            <Input
              id="ripple-profile-email"
              type="email"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              onBlur={() => void savePreferences()}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-6 border-t border-border p-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">
              Weekly App Updates
            </div>
            <p className="text-sm text-muted-foreground">
              Separate from anonymous product analytics.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {formatSyncStatus(contactState)}
            </p>
          </div>
          <Switch
            checked={weeklyUpdatesEnabled}
            onCheckedChange={(checked) => void savePreferences(checked)}
            disabled={isSaving}
          />
        </div>

        <div className="flex items-center justify-between gap-6 border-t border-border p-4">
          <div className="min-w-0 text-xs text-muted-foreground">
            {error || "Email updates use a separate contact identity from anonymous analytics."}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isSaving}
            onClick={() => void savePreferences()}
          >
            {isSaving && <IconSpinner className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
