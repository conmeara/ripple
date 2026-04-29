"use client"

import { useAtom } from "jotai"
import { CheckCircle2, Copy, RefreshCw, X } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"
import { pendingAuthRetryMessageAtom } from "../../features/agents/atoms"
import { agentsLoginModalOpenAtom } from "../../lib/atoms"
import { trpc } from "../../lib/trpc"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "../ui/alert-dialog"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { ClaudeCodeIcon, IconSpinner } from "../ui/icons"
import { Logo } from "../ui/logo"

type ClaudeLoginModalProps = {
  hideCustomModelSettingsLink?: boolean
  autoStartAuth?: boolean
}

export function ClaudeLoginModal(_: ClaudeLoginModalProps) {
  const [open, setOpen] = useAtom(agentsLoginModalOpenAtom)
  const [pendingAuthRetry, setPendingAuthRetry] = useAtom(
    pendingAuthRetryMessageAtom,
  )
  const authStatus = trpc.agentRuntime.authStatus.useQuery(
    { provider: "claude" },
    {
      enabled: open,
      refetchOnMount: true,
      staleTime: 0,
    },
  )
  const setupCommand = trpc.agentRuntime.setupCommand.useQuery(
    { provider: "claude" },
    { enabled: open },
  )

  const isConnected = authStatus.data?.connected === true
  const shellCommand =
    setupCommand.data?.shellCommand || "claude auth login"

  useEffect(() => {
    if (!open || !isConnected) return
    if (
      pendingAuthRetry?.provider === "claude-code" &&
      !pendingAuthRetry.readyToRetry
    ) {
      setPendingAuthRetry({ ...pendingAuthRetry, readyToRetry: true })
    }
  }, [isConnected, open, pendingAuthRetry, setPendingAuthRetry])

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(shellCommand)
    toast.success("Claude login command copied")
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (
      !nextOpen &&
      pendingAuthRetry?.provider === "claude-code" &&
      !pendingAuthRetry.readyToRetry
    ) {
      setPendingAuthRetry(null)
    }
    setOpen(nextOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[420px] p-6">
        <AlertDialogCancel className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </AlertDialogCancel>

        <div className="space-y-6">
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
              <p className="text-xs text-muted-foreground">
                Run the command once in Terminal, finish the browser login, then
                refresh. Project creation, preview, comments, assets, and export
                still work without this connection.
              </p>
            </div>
          )}

          {isConnected && (
            <Button className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
