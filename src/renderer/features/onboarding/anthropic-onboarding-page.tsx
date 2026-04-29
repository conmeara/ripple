"use client"

import { useSetAtom } from "jotai"
import { CheckCircle2, ChevronLeft, Copy, RefreshCw } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { ClaudeCodeIcon, IconSpinner } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import {
  anthropicOnboardingCompletedAtom,
  billingMethodAtom,
} from "../../lib/atoms"
import { trpc } from "../../lib/trpc"

export function AnthropicOnboardingPage() {
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setBillingMethod = useSetAtom(billingMethodAtom)

  const authStatus = trpc.agentRuntime.authStatus.useQuery(
    { provider: "claude" },
    {
      refetchOnMount: true,
      staleTime: 0,
    },
  )
  const setupCommand = trpc.agentRuntime.setupCommand.useQuery({
    provider: "claude",
  })

  const isConnected = authStatus.data?.connected === true
  const shellCommand = setupCommand.data?.shellCommand || "claude auth login"

  useEffect(() => {
    if (isConnected) {
      setAnthropicOnboardingCompleted(true)
    }
  }, [isConnected, setAnthropicOnboardingCompleted])

  const handleBack = () => {
    setBillingMethod(null)
  }

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(shellCommand)
    toast.success("Claude login command copied")
  }

  const handleSkip = () => {
    setAnthropicOnboardingCompleted(true)
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <button
        onClick={handleBack}
        className="fixed top-12 left-4 flex items-center justify-center h-8 w-8 rounded-full hover:bg-foreground/5 transition-colors"
        aria-label="Back"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="w-full max-w-[440px] space-y-7 px-4">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Logo className="w-5 h-5" fill="white" />
            </div>
            <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center">
              <ClaudeCodeIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Connect Claude
            </h1>
            <p className="text-sm text-muted-foreground">
              Claude edits run through the local Claude Agent SDK.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Claude Agent SDK</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {authStatus.isLoading
                  ? "Checking connection..."
                  : authStatus.data?.label || "Claude setup status unavailable"}
              </div>
            </div>
            {authStatus.isLoading ? (
              <IconSpinner className="h-4 w-4 text-muted-foreground" />
            ) : isConnected ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Setup needed
              </Badge>
            )}
          </div>
        </div>

        {!isConnected && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
              {shellCommand}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleCopyCommand}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
              <Button
                variant="secondary"
                onClick={() => void authStatus.refetch()}
                disabled={authStatus.isFetching}
              >
                {authStatus.isFetching ? (
                  <IconSpinner className="mr-2 h-4 w-4" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {isConnected ? (
            <Button
              className="w-full"
              onClick={() => setAnthropicOnboardingCompleted(true)}
            >
              Continue
            </Button>
          ) : (
            <Button variant="ghost" className="w-full" onClick={handleSkip}>
              Set up later
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
