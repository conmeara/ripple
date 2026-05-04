"use client"

import { useAtom, useSetAtom } from "jotai"
import {
  CheckCircle2,
  ExternalLink,
  Mail,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog"
import { ClaudeCodeIcon, CodexIcon, IconSpinner } from "../../components/ui/icons"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Logo } from "../../components/ui/logo"
import { Switch } from "../../components/ui/switch"
import {
  agentsLoginModalOpenAtom,
  claudeLoginModalConfigAtom,
  codexLoginModalOpenAtom,
} from "../../lib/atoms"
import { cn } from "../../lib/utils"
import { trpc } from "../../lib/trpc"
import { ClaudeLoginModal } from "../../components/dialogs/claude-login-modal"
import { CodexLoginModal } from "../../components/dialogs/codex-login-modal"
import type {
  AnalyticsConsent,
  AnalyticsStatus,
  UpdateContactPreferenceState,
} from "../../../shared/ripple-analytics"
import {
  buildOnboardingCompletedEvent,
  buildUpdateContactPreferenceInput,
  getEmailValidationError,
  normalizeOptionalEmail,
  RIPPLE_ANALYTICS_TRANSPARENCY_URL,
  rippleOnboardingStateAtom,
  rippleProfileEmailAtom,
  rippleWeeklyUpdatesEnabledAtom,
  shouldShowRippleOnboarding,
} from "./ripple-onboarding-state"

type OnboardingStep = "preferences" | "agents"

type ProviderCardProps = {
  title: string
  runtimeLabel: string
  fallbackStatus: string
  accent: "claude" | "codex"
  connected: boolean
  isLoading: boolean
  isFetching: boolean
  label?: string | null
  error?: unknown
  onConnect: () => void
}

function ProviderCard({
  title,
  runtimeLabel,
  fallbackStatus,
  accent,
  connected,
  isLoading,
  isFetching,
  label,
  error,
  onConnect,
}: ProviderCardProps) {
  const isChecking = isLoading || isFetching
  const Icon = accent === "claude" ? ClaudeCodeIcon : CodexIcon
  const iconClass =
    accent === "claude"
      ? "bg-[#D97757] text-white"
      : "bg-foreground text-background"
  const statusLabel = isChecking
    ? "Checking"
    : connected
      ? "Ready"
      : "Setup needed"
  const detail = error
    ? "Status check did not finish."
    : label || fallbackStatus

  return (
    <div className="flex min-h-[230px] flex-col rounded-md border border-border bg-background p-4 text-center">
      <div className="flex flex-1 flex-col">
        <div className="mx-auto flex w-max items-center justify-center gap-2 rounded-full border border-border p-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
            <Logo className="h-5 w-5" fill="white" />
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              iconClass,
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
        </div>

        <div className="mx-auto mt-8 flex min-h-6 max-w-[15rem] items-center">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        </div>

        <div className="mt-8 flex min-h-[68px] items-center rounded-md border border-border bg-muted/30 px-3 py-2 text-left">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground">
                {runtimeLabel}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                {detail}
              </div>
            </div>
            <Badge
              variant={connected ? "secondary" : "outline"}
              className="shrink-0 gap-1 text-[11px]"
            >
              {isChecking ? (
                <IconSpinner className="h-3 w-3" />
              ) : connected ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : null}
              {statusLabel}
            </Badge>
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant={connected ? "secondary" : "default"}
        className="mt-5 w-full"
        onClick={onConnect}
        disabled={isChecking}
      >
        {isChecking ? (
          <IconSpinner className="h-4 w-4" />
        ) : connected ? (
          "Manage connection"
        ) : (
          "Connect"
        )}
      </Button>
    </div>
  )
}

export function RippleFirstRunDialog() {
  const [onboardingState, setOnboardingState] = useAtom(rippleOnboardingStateAtom)
  const [storedEmail, setStoredEmail] = useAtom(rippleProfileEmailAtom)
  const setWeeklyUpdatesEnabled = useSetAtom(rippleWeeklyUpdatesEnabledAtom)
  const setClaudeLoginOpen = useSetAtom(agentsLoginModalOpenAtom)
  const setClaudeLoginConfig = useSetAtom(claudeLoginModalConfigAtom)
  const setCodexLoginOpen = useSetAtom(codexLoginModalOpenAtom)
  const [step, setStep] = useState<OnboardingStep>("preferences")
  const [emailDraft, setEmailDraft] = useState(storedEmail)
  const [analyticsStatus, setAnalyticsStatus] = useState<AnalyticsStatus | null>(null)
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false)
  const [contactState, setContactState] =
    useState<UpdateContactPreferenceState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const emailDraftTouchedRef = useRef(false)
  const dialogWasOpenRef = useRef(false)
  const open = shouldShowRippleOnboarding(onboardingState)

  const claudeStatus = trpc.agentRuntime.authStatus.useQuery(
    { provider: "claude" },
    {
      enabled: open && step === "agents",
      retry: false,
      staleTime: 0,
    },
  )
  const codexStatus = trpc.agentRuntime.authStatus.useQuery(
    { provider: "codex" },
    {
      enabled: open && step === "agents",
      retry: false,
      staleTime: 0,
    },
  )

  useEffect(() => {
    if (!open) {
      dialogWasOpenRef.current = false
      return
    }
    if (dialogWasOpenRef.current) return
    dialogWasOpenRef.current = true
    setStep("preferences")
    setEmailDraft(storedEmail)
    emailDraftTouchedRef.current = false
    setFormError(null)
  }, [open, storedEmail])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    window.desktopApi?.getAnalyticsStatus()
      .then((status) => {
        if (cancelled) return
        setAnalyticsStatus(status)
        setAnalyticsEnabled(status.consent === "granted")
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[Onboarding] Failed to read analytics status:", error)
        }
      })

    window.desktopApi?.getUpdateContactPreference()
      .then((state) => {
        if (cancelled) return
        setContactState(state)
        if (!emailDraftTouchedRef.current) {
          setEmailDraft(storedEmail || state.email || "")
        }
        setWeeklyUpdatesEnabled(state.weeklyUpdatesEnabled)
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[Onboarding] Failed to read update contact preference:", error)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, setWeeklyUpdatesEnabled, storedEmail])

  const analyticsConsent: AnalyticsConsent = useMemo(() => {
    if (analyticsEnabled) return "granted"
    return analyticsStatus?.consent ?? "unset"
  }, [analyticsEnabled, analyticsStatus?.consent])

  const choices = useMemo(() => ({
    email: emailDraft,
    weeklyUpdatesEnabled: Boolean(normalizeOptionalEmail(emailDraft)),
    analyticsConsent,
  }), [analyticsConsent, emailDraft])

  const persistContactPreference = async () => {
    const normalizedEmail = normalizeOptionalEmail(emailDraft)
    const nextWeeklyUpdatesEnabled = Boolean(normalizedEmail)
    setWeeklyUpdatesEnabled(nextWeeklyUpdatesEnabled)

    const shouldSyncOptIn = nextWeeklyUpdatesEnabled
    const shouldSyncOptOut =
      !nextWeeklyUpdatesEnabled && contactState?.weeklyUpdatesEnabled
    const shouldSyncClear =
      !nextWeeklyUpdatesEnabled && Boolean(contactState?.email) && !normalizedEmail

    if (!shouldSyncOptIn && !shouldSyncOptOut && !shouldSyncClear) return

    const nextContact = await window.desktopApi?.syncUpdateContactPreference(
      buildUpdateContactPreferenceInput(
        {
          email: shouldSyncOptOut && !shouldSyncClear
            ? contactState?.email ?? normalizedEmail
            : normalizedEmail,
          weeklyUpdatesEnabled: nextWeeklyUpdatesEnabled,
        },
        "onboarding",
      ),
    )
    if (nextContact) setContactState(nextContact)
  }

  const persistAnalyticsConsent = async () => {
    const status = await window.desktopApi?.setAnalyticsConsent(
      analyticsEnabled ? "granted" : "denied",
      "onboarding",
    )
    if (status) setAnalyticsStatus(status)
  }

  const captureCompletion = async (
    completionState: "completed" | "skipped",
    completionChoices: typeof choices,
  ) => {
    await window.desktopApi?.captureAnalyticsEvent(
      buildOnboardingCompletedEvent({
        completionState,
        choices: completionChoices,
      }),
    )
  }

  const finish = async (completionState: "completed" | "skipped") => {
    if (completionState === "completed") {
      const validationError = getEmailValidationError(
        emailDraft,
        Boolean(normalizeOptionalEmail(emailDraft)),
      )
      if (validationError) {
        setFormError(validationError)
        return
      }
    }

    setFormError(null)
    setIsSaving(true)
    try {
      if (completionState === "completed") {
        const normalizedEmail = normalizeOptionalEmail(emailDraft)
        setStoredEmail(normalizedEmail)
        await persistContactPreference()
        await persistAnalyticsConsent()
      }
      await captureCompletion(
        completionState,
        completionState === "completed"
          ? choices
          : {
              email: "",
              weeklyUpdatesEnabled: false,
              analyticsConsent: analyticsStatus?.consent ?? "unset",
            },
      )
      setOnboardingState(completionState === "completed" ? "completed" : "seenSkipped")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.message("Onboarding saved locally", {
        description: "A setup check could not finish. Project creation is still available.",
      })
      console.warn("[Onboarding] Non-blocking setup failure:", message)
      setOnboardingState(completionState === "completed" ? "completed" : "seenSkipped")
    } finally {
      setIsSaving(false)
    }
  }

  const openTransparencyDoc = () => {
    void window.desktopApi?.openExternal(RIPPLE_ANALYTICS_TRANSPARENCY_URL)
  }

  const openClaudeSetup = () => {
    setClaudeLoginConfig({
      hideCustomModelSettingsLink: true,
      autoStartAuth: false,
    })
    setClaudeLoginOpen(true)
  }

  const openCodexSetup = () => {
    setCodexLoginOpen(true)
  }

  const continueToAgents = () => {
    const validationError = getEmailValidationError(
      emailDraft,
      Boolean(normalizeOptionalEmail(emailDraft)),
    )
    if (validationError) {
      setFormError(validationError)
      return
    }
    setFormError(null)
    setStep("agents")
  }

  const isPreferencesStep = step === "preferences"

  return (
    <>
      <AlertDialog open={open}>
        <AlertDialogContent className="w-[560px] max-h-[calc(100vh-3rem)] overflow-hidden p-0 outline-none ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0">
          <AlertDialogHeader className="space-y-2 pb-3">
            <div className="flex justify-end">
              <div
                className="flex items-center gap-1.5"
                aria-label={`Step ${isPreferencesStep ? "1" : "2"} of 2`}
              >
                <span
                  className={cn(
                    "h-1.5 w-5 rounded-full",
                    isPreferencesStep ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                />
                <span
                  className={cn(
                    "h-1.5 w-5 rounded-full",
                    !isPreferencesStep ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                />
              </div>
            </div>
            <AlertDialogTitle className="text-lg">
              {isPreferencesStep ? "Set up Ripple" : "Connect your agent"}
            </AlertDialogTitle>
            {isPreferencesStep ? (
              <AlertDialogDescription className="sr-only">
                Set your update and privacy preferences.
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription>
                Connect your Codex or Claude Code subscription.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>

          <AlertDialogBody className="max-h-[62vh] space-y-4 overflow-y-auto">
            {isPreferencesStep ? (
              <>
                <section className="rounded-md border border-border bg-background p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-foreground">Email updates</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Get release notes and early feature news. Optional.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ripple-onboarding-email" className="text-xs">
                        Email
                      </Label>
                      <Input
                        id="ripple-onboarding-email"
                        type="email"
                        value={emailDraft}
                        onChange={(event) => {
                          emailDraftTouchedRef.current = true
                          setEmailDraft(event.target.value)
                        }}
                        placeholder="you@example.com"
                        className="h-9"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Leave blank to skip updates.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-md border border-border bg-background p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-foreground">
                        Anonymous analytics
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Help me improve the project with anonymous product stats.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/20 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        Share anonymous product stats
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Ripple never sends your email, agent conversations, project
                        files, prompts, comments, media, paths, or creative content.
                      </p>
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                        onClick={openTransparencyDoc}
                      >
                        See exactly what can be sent
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                    <Switch
                      checked={analyticsEnabled}
                      onCheckedChange={setAnalyticsEnabled}
                      aria-label="Share anonymous product stats"
                    />
                  </div>
                </section>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <ProviderCard
                  title="OpenAI Codex"
                  runtimeLabel="Codex App Server"
                  fallbackStatus="Ready to connect with your ChatGPT login."
                  accent="codex"
                  connected={codexStatus.data?.connected === true}
                  isLoading={codexStatus.isLoading}
                  isFetching={codexStatus.isFetching}
                  label={codexStatus.data?.label}
                  error={codexStatus.error}
                  onConnect={openCodexSetup}
                />
                <ProviderCard
                  title="Claude Code"
                  runtimeLabel="Claude Agent SDK"
                  fallbackStatus="Ready to connect with your local Claude Code login."
                  accent="claude"
                  connected={claudeStatus.data?.connected === true}
                  isLoading={claudeStatus.isLoading}
                  isFetching={claudeStatus.isFetching}
                  label={claudeStatus.data?.label}
                  error={claudeStatus.error}
                  onConnect={openClaudeSetup}
                />
              </div>
            )}

            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {formError}
              </div>
            )}
          </AlertDialogBody>

          <AlertDialogFooter className="items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => {
                if (isPreferencesStep) {
                  void finish("skipped")
                } else {
                  setFormError(null)
                  setStep("preferences")
                }
              }}
            >
              {isPreferencesStep ? "Set up later" : "Back"}
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => {
                if (isPreferencesStep) {
                  continueToAgents()
                } else {
                  void finish("completed")
                }
              }}
            >
              {isSaving && <IconSpinner className="mr-2 h-4 w-4" />}
              {isPreferencesStep ? "Continue" : "Start creating"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ClaudeLoginModal hideCustomModelSettingsLink autoStartAuth={false} />
      <CodexLoginModal autoStart={false} />
    </>
  )
}
