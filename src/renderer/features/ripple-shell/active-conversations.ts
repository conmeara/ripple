export interface ActiveConversationState {
  ids: string[]
  activeId: string | null
}

const STORAGE_PREFIX = "ripple-active-conversations"

export function addActiveConversationId(
  ids: readonly string[],
  conversationId: string | null | undefined,
): string[] {
  if (!conversationId) return [...ids]
  if (ids.includes(conversationId)) return [...ids]
  return [...ids, conversationId]
}

export function closeActiveConversationId(input: {
  ids: readonly string[]
  activeId: string | null
  conversationId: string
}): ActiveConversationState {
  const index = input.ids.indexOf(input.conversationId)
  const ids = input.ids.filter((id) => id !== input.conversationId)
  if (input.activeId !== input.conversationId) {
    return { ids, activeId: input.activeId }
  }

  const nextActiveId = ids[Math.min(Math.max(index - 1, 0), ids.length - 1)] ?? null
  return { ids, activeId: nextActiveId }
}

export function pruneActiveConversationIds(input: {
  ids: readonly string[]
  activeId: string | null
  availableIds: Iterable<string>
}): ActiveConversationState {
  const available = new Set(input.availableIds)
  const ids = input.ids.filter((id) => available.has(id))
  const activeId = input.activeId && ids.includes(input.activeId)
    ? input.activeId
    : ids[ids.length - 1] ?? null
  return { ids, activeId }
}

export function shouldShowActiveConversationTabs(
  activeConversations: readonly unknown[],
): boolean {
  return activeConversations.length > 0
}

export function mergeConversationHistoryItems<T extends {
  id: string
  chatId?: string | null
}>(
  projectItems: readonly T[],
  revealedItems: Iterable<T>,
): T[] {
  const map = new Map<string, T>()
  for (const item of projectItems) map.set(item.id, item)
  for (const item of revealedItems) {
    if (item.chatId && item.chatId !== item.id) continue
    map.set(item.id, item)
  }
  return Array.from(map.values())
}

export function activeConversationStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId}`
}

export function loadActiveConversationIds(projectId: string): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(activeConversationStorageKey(projectId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
      : []
  } catch {
    return []
  }
}

export function saveActiveConversationIds(projectId: string, ids: readonly string[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    activeConversationStorageKey(projectId),
    JSON.stringify(Array.from(new Set(ids))),
  )
}
