import { useAtom, useSetAtom } from "jotai"
import { Download, ExternalLink, RefreshCw, RotateCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  betaUpdatesEnabledAtom,
  updateStateAtom,
  type UpdateState,
} from "../../../lib/atoms"
import { cn } from "../../../lib/utils"
import { useUpdateChecker } from "../../../lib/hooks/use-update-checker"
import { Button } from "../../ui/button"
import { Switch } from "../../ui/switch"

function formatDate(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatReleaseNotes(notes: UpdateState["releaseNotes"]): string | null {
  if (!notes) return null
  if (typeof notes === "string") return notes.trim() || null
  const text = notes
    .map((entry) => entry.note?.trim())
    .filter(Boolean)
    .join("\n\n")
  return text || null
}

function getReleaseUrl(version?: string): string {
  return version
    ? `https://github.com/conmeara/ripple/releases/tag/v${version}`
    : "https://github.com/conmeara/ripple/releases"
}

function getStatusText(state: UpdateState, currentVersion: string | null): string {
  switch (state.status) {
    case "checking":
      return "Checking for app updates..."
    case "available":
      return state.version
        ? `Ripple ${state.version} is available.`
        : "An update is available."
    case "downloading":
      return state.progress != null
        ? `Downloading ${Math.round(state.progress)}%.`
        : "Downloading update..."
    case "ready":
      return state.version
        ? `Ripple ${state.version} is ready to install.`
        : "Ready to restart and install."
    case "not-available":
      return currentVersion
        ? `Ripple ${currentVersion} is up to date.`
        : "Ripple is up to date."
    case "error":
      return state.error || "Update check unavailable."
    case "idle":
    default:
      return "Manual checks are available anytime."
  }
}

export function AppUpdatesTab() {
  const { state, checkForUpdates, downloadUpdate, installUpdate } = useUpdateChecker()
  const setUpdateState = useSetAtom(updateStateAtom)
  const [betaUpdatesEnabled, setBetaUpdatesEnabled] = useAtom(betaUpdatesEnabledAtom)
  const [autoUpdateChecksEnabled, setAutoUpdateChecksEnabled] = useState(false)
  const [autoUpdateChecksSaving, setAutoUpdateChecksSaving] = useState(false)
  const [channelSaving, setChannelSaving] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [isPackaged, setIsPackaged] = useState(true)

  useEffect(() => {
    window.desktopApi?.getVersion().then(setCurrentVersion)
    window.desktopApi?.isPackaged?.().then(setIsPackaged)
    window.desktopApi?.getUpdateChannel?.().then((channel) => {
      setBetaUpdatesEnabled(channel === "beta")
    })
    window.desktopApi?.getAutoUpdateChecksEnabled?.()
      .then((enabled) => setAutoUpdateChecksEnabled(enabled))
      .catch((error) => {
        console.error("Failed to load automatic update check preference:", error)
      })
  }, [setBetaUpdatesEnabled])

  const releaseDate = formatDate(state.releaseDate)
  const releaseNotes = useMemo(
    () => formatReleaseNotes(state.releaseNotes),
    [state.releaseNotes],
  )
  const showReleaseDetails =
    state.status === "available" ||
    state.status === "ready" ||
    Boolean(releaseNotes)

  const handleAutoUpdateChecksChange = async (checked: boolean) => {
    const previous = autoUpdateChecksEnabled
    setAutoUpdateChecksEnabled(checked)
    setAutoUpdateChecksSaving(true)
    try {
      const persisted = await window.desktopApi?.setAutoUpdateChecksEnabled?.(checked)
      if (typeof persisted === "boolean") {
        setAutoUpdateChecksEnabled(persisted)
      }
    } catch (error) {
      setAutoUpdateChecksEnabled(previous)
      console.error("Failed to save automatic update check preference:", error)
    } finally {
      setAutoUpdateChecksSaving(false)
    }
  }

  const handleEarlyAccessChange = async (checked: boolean) => {
    const previous = betaUpdatesEnabled
    setBetaUpdatesEnabled(checked)
    setChannelSaving(true)
    try {
      const saved = await window.desktopApi?.setUpdateChannel?.(
        checked ? "beta" : "latest",
      )
      if (!saved) {
        setBetaUpdatesEnabled(previous)
      }
    } catch (error) {
      setBetaUpdatesEnabled(previous)
      console.error("Failed to save update channel preference:", error)
    } finally {
      setChannelSaving(false)
    }
  }

  const handleCheckForUpdates = async () => {
    if (!isPackaged) {
      setUpdateState({
        status: "error",
        error: "Update checks are available in packaged builds.",
      })
      return
    }

    setUpdateState({ status: "checking" })
    try {
      const result = await checkForUpdates()
      if (!result) {
        setUpdateState({
          status: "not-available",
          version: currentVersion ?? undefined,
        })
      }
    } catch (error) {
      setUpdateState({
        status: "error",
        error: error instanceof Error ? error.message : "Update check failed.",
      })
    }
  }

  const handleDownloadUpdate = async () => {
    const ok = await downloadUpdate()
    if (!ok) {
      setUpdateState({
        status: "error",
        error: "Update download failed. Try again when your connection is stable.",
      })
    }
  }

  const handleOpenRelease = () => {
    window.desktopApi?.openExternal(getReleaseUrl(state.version))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col space-y-1.5 text-center sm:text-left">
        <h3 className="text-sm font-semibold text-foreground">App Updates</h3>
        <p className="text-xs text-muted-foreground">
          Manage Ripple versions, release details, and Early Access builds.
        </p>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Automatic Checks
            </span>
            <span className="text-xs text-muted-foreground">
              Let Ripple check for app updates in the background.
            </span>
          </div>
          <Switch
            checked={autoUpdateChecksEnabled}
            onCheckedChange={(checked) => void handleAutoUpdateChecksChange(checked)}
            disabled={autoUpdateChecksSaving}
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-4 border-t border-border">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Early Access
            </span>
            <span className="text-xs text-muted-foreground">
              Receive beta versions before they are released to everyone.
            </span>
          </div>
          <Switch
            checked={betaUpdatesEnabled}
            onCheckedChange={(checked) => void handleEarlyAccessChange(checked)}
            disabled={channelSaving}
          />
        </div>
      </div>

      <div className="bg-background rounded-lg border border-border overflow-hidden">
        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <span className="text-sm font-medium text-foreground">
                {currentVersion ? `Current version ${currentVersion}` : "Current version"}
              </span>
              <p
                className={cn(
                  "text-xs",
                  state.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {getStatusText(state, currentVersion)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCheckForUpdates()}
              disabled={state.status === "checking" || state.status === "downloading"}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4 mr-2",
                  state.status === "checking" && "animate-spin",
                )}
              />
              {state.status === "checking" ? "Checking..." : "Check Now"}
            </Button>
          </div>

          {(state.status === "available" || state.status === "downloading") && (
            <Button
              size="sm"
              onClick={() => void handleDownloadUpdate()}
              disabled={state.status === "downloading"}
            >
              <Download className="h-4 w-4 mr-2" />
              {state.status === "downloading" ? "Downloading..." : "Download Update"}
            </Button>
          )}

          {state.status === "ready" && (
            <Button size="sm" onClick={installUpdate}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restart to update
            </Button>
          )}
        </div>

        {showReleaseDetails && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-foreground">
                  {state.version ? `Ripple ${state.version}` : "Release Details"}
                </h4>
                {releaseDate && (
                  <p className="text-xs text-muted-foreground">{releaseDate}</p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={handleOpenRelease}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Release Notes
              </Button>
            </div>
            {releaseNotes && (
              <p className="whitespace-pre-line text-xs leading-5 text-muted-foreground">
                {releaseNotes}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
