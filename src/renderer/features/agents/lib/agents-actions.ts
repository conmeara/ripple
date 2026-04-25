/**
 * Centralized action system for Agents
 * Actions can be triggered via hotkeys or UI buttons
 */

import type { SettingsTab } from "../../../lib/atoms"
import type { DesktopView, SelectedProject } from "../atoms"

// ============================================================================
// TYPES
// ============================================================================

export type AgentActionSource = "hotkey" | "ui_button" | "context-menu"

export type AgentActionCategory = "general" | "navigation" | "chat" | "view"

export interface AgentActionContext {
  // Navigation
  setSelectedChatId?: (id: string | null) => void
  setSelectedProject?: (project: SelectedProject) => void
  setProjectEntryReturnProject?: (project: NonNullable<SelectedProject> | null) => void
  setSelectedDraftId?: (id: string | null) => void
  setShowNewChatForm?: (show: boolean) => void
  setDesktopView?: (view: DesktopView) => void

  // UI states
  setSidebarOpen?: (open: boolean | ((prev: boolean) => boolean)) => void
  setSettingsActiveTab?: (tab: SettingsTab) => void
  setFileSearchDialogOpen?: (open: boolean) => void
  toggleChatSearch?: () => void

  // Data
  selectedChatId?: string | null
  selectedProject?: SelectedProject
  releaseSelectedChat?: (id: string) => Promise<void>
}

export interface AgentActionResult {
  success: boolean
  error?: string
}

export type AgentActionHandler = (
  context: AgentActionContext,
  source: AgentActionSource,
) => Promise<AgentActionResult> | AgentActionResult

export interface AgentActionDefinition {
  id: string
  label: string
  description?: string
  category: AgentActionCategory
  hotkey?: string | string[]
  handler: AgentActionHandler
  isAvailable?: (context: AgentActionContext) => boolean
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

const openShortcutsAction: AgentActionDefinition = {
  id: "open-shortcuts",
  label: "Keyboard shortcuts",
  description: "Show all keyboard shortcuts",
  category: "general",
  hotkey: "?",
  handler: async (context) => {
    // Open settings page on Keyboard tab
    context.setSettingsActiveTab?.("keyboard")
    context.setDesktopView?.("settings")
    context.setSidebarOpen?.(true)
    return { success: true }
  },
}

const createNewAgentAction: AgentActionDefinition = {
  id: "create-new-agent",
  label: "New project",
  description: "Create a new project",
  category: "general",
  hotkey: "cmd+n",
  handler: async (context) => {
    console.log("[Action] create-new-agent handler called")
    if (context.selectedChatId) {
      await context.releaseSelectedChat?.(context.selectedChatId)
    }
    // Route keyboard/menu users to the same project creation flow as the rail button.
    context.setProjectEntryReturnProject?.(context.selectedProject ?? null)
    context.setSelectedProject?.(null)
    context.setSelectedChatId?.(null)
    context.setSelectedDraftId?.(null)
    context.setShowNewChatForm?.(true)
    context.setDesktopView?.(null)
    return { success: true }
  },
}

const openSettingsAction: AgentActionDefinition = {
  id: "open-settings",
  label: "Settings",
  description: "Open settings page",
  category: "general",
  hotkey: ["cmd+,", "ctrl+,"],
  handler: async (context) => {
    context.setSettingsActiveTab?.("preferences")
    context.setDesktopView?.("settings")
    context.setSidebarOpen?.(true)
    return { success: true }
  },
}

const toggleSidebarAction: AgentActionDefinition = {
  id: "toggle-sidebar",
  label: "Toggle sidebar",
  description: "Show/hide left sidebar",
  category: "view",
  hotkey: ["cmd+\\", "ctrl+\\"],
  handler: async (context) => {
    context.setSidebarOpen?.((prev) => !prev)
    return { success: true }
  },
}

const toggleChatSearchAction: AgentActionDefinition = {
  id: "toggle-chat-search",
  label: "Search messages",
  description: "Search through chat history",
  category: "view",
  hotkey: ["cmd+f", "ctrl+f"],
  handler: async (context) => {
    context.toggleChatSearch?.()
    return { success: true }
  },
}

const openKanbanAction: AgentActionDefinition = {
  id: "open-kanban",
  label: "Open Kanban board",
  description: "Open the Kanban board view",
  category: "view",
  hotkey: "cmd+shift+k",
  handler: async (context) => {
    // Clear selected chat, draft, and new form state to show Kanban view
    context.setSelectedChatId?.(null)
    context.setSelectedDraftId?.(null)
    context.setShowNewChatForm?.(false)
    // Clear automations/inbox view
    context.setDesktopView?.(null)
    return { success: true }
  },
}

const openAutomationsAction: AgentActionDefinition = {
  id: "open-automations",
  label: "Automations",
  description: "Open automations page",
  category: "navigation",
  handler: async (context) => {
    context.setSelectedChatId?.(null)
    context.setSelectedDraftId?.(null)
    context.setShowNewChatForm?.(false)
    context.setDesktopView?.("automations")
    return { success: true }
  },
}

const openInEditorAction: AgentActionDefinition = {
  id: "open-in-editor",
  label: "Open in editor",
  description: "Open worktree in preferred editor",
  category: "general",
  hotkey: "cmd+o",
  handler: async () => {
    // Handled by the info-section component via event dispatch
    window.dispatchEvent(new CustomEvent("open-in-editor"))
    return { success: true }
  },
}

const openInboxAction: AgentActionDefinition = {
  id: "open-inbox",
  label: "Inbox",
  description: "Open inbox",
  category: "navigation",
  handler: async (context) => {
    context.setSelectedChatId?.(null)
    context.setSelectedDraftId?.(null)
    context.setShowNewChatForm?.(false)
    context.setDesktopView?.("inbox")
    return { success: true }
  },
}

const openFileInEditorAction: AgentActionDefinition = {
  id: "open-file-in-editor",
  label: "Open file in editor",
  description: "Open currently previewed file in preferred editor",
  category: "general",
  hotkey: "cmd+shift+o",
  handler: async () => {
    window.dispatchEvent(new CustomEvent("open-file-in-editor"))
    return { success: true }
  },
}

const fileSearchAction: AgentActionDefinition = {
  id: "file-search",
  label: "Go to file",
  description: "Search and open a file in the project",
  category: "navigation",
  hotkey: "cmd+p",
  handler: async (context) => {
    context.setFileSearchDialogOpen?.(true)
    return { success: true }
  },
}

// ============================================================================
// ACTION REGISTRY
// ============================================================================

export const AGENT_ACTIONS: Record<string, AgentActionDefinition> = {
  "open-shortcuts": openShortcutsAction,
  "create-new-agent": createNewAgentAction,
  "open-settings": openSettingsAction,
  "toggle-sidebar": toggleSidebarAction,
  "toggle-chat-search": toggleChatSearchAction,
  "open-kanban": openKanbanAction,
  "open-automations": openAutomationsAction,
  "open-inbox": openInboxAction,
  "open-in-editor": openInEditorAction,
  "open-file-in-editor": openFileInEditorAction,
  "file-search": fileSearchAction,
}

export function getAgentAction(id: string): AgentActionDefinition | undefined {
  return AGENT_ACTIONS[id]
}

export function getAvailableAgentActions(
  context: AgentActionContext,
): AgentActionDefinition[] {
  return Object.values(AGENT_ACTIONS).filter((action) => {
    if (action.isAvailable) {
      return action.isAvailable(context)
    }
    return true
  })
}

export async function executeAgentAction(
  actionId: string,
  context: AgentActionContext,
  source: AgentActionSource,
): Promise<AgentActionResult> {
  const action = AGENT_ACTIONS[actionId]

  if (!action) {
    return { success: false, error: `Action ${actionId} not found` }
  }

  if (action.isAvailable && !action.isAvailable(context)) {
    return { success: false, error: `Action ${actionId} not available` }
  }

  try {
    return await action.handler(context, source)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
