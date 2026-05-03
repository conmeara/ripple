import type { CodexUserInput } from "./codex-app-server-input"

export interface CodexSkillMetadata {
  name: string
  description?: string
  path: string
  enabled: boolean
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function normalizeCodexSkillEntries(response: unknown): CodexSkillMetadata[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return []
  const skills: CodexSkillMetadata[] = []
  for (const entry of response.data) {
    if (!isRecord(entry) || !Array.isArray(entry.skills)) continue
    for (const skill of entry.skills) {
      if (!isRecord(skill)) continue
      if (typeof skill.name !== "string" || typeof skill.path !== "string") continue
      skills.push({
        name: skill.name,
        description: typeof skill.description === "string" ? skill.description : undefined,
        path: skill.path,
        enabled: skill.enabled !== false,
      })
    }
  }

  const byPath = new Map<string, CodexSkillMetadata>()
  for (const skill of skills) {
    byPath.set(skill.path, skill)
  }
  return Array.from(byPath.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function buildCodexSkillInputs(
  mentions: string[],
  skills: CodexSkillMetadata[],
): Array<Extract<CodexUserInput, { type: "skill" }>> {
  const enabledByName = new Map(
    skills
      .filter((skill) => skill.enabled)
      .map((skill) => [skill.name.toLowerCase(), skill]),
  )
  const inputs: Array<Extract<CodexUserInput, { type: "skill" }>> = []
  const seen = new Set<string>()

  for (const mention of mentions) {
    const key = mention.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const skill = enabledByName.get(key)
    if (!skill) continue
    inputs.push({
      type: "skill",
      name: skill.name,
      path: skill.path,
    })
  }

  return inputs
}
