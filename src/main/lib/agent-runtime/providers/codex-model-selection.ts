const CODEX_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh"])

export type CodexModelSelection = {
  model: string | null
  effort: string | null
}

export function normalizeCodexModelSelection(
  model: string | null | undefined,
): CodexModelSelection {
  if (!model) return { model: null, effort: null }

  const [baseModel, effort, ...extra] = model.split("/")
  if (!baseModel || extra.length > 0 || !effort || !CODEX_EFFORT_LEVELS.has(effort)) {
    return { model, effort: null }
  }

  return { model: baseModel, effort }
}
