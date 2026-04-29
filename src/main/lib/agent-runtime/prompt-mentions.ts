export interface AgentRuntimePromptMentions {
  cleanedPrompt: string
  prompt: string
  agentMentions: string[]
  skillMentions: string[]
  fileMentions: string[]
  folderMentions: string[]
  toolMentions: string[]
}

function isSafeToolMention(name: string): boolean {
  return (
    /^[a-zA-Z0-9_-]+$/.test(name) ||
    /^mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$/.test(name)
  )
}

function toolInstruction(tool: string): string {
  if (tool.startsWith("mcp__")) {
    return `Use the ${tool} tool for this request.`
  }
  return `Use tools from the ${tool} MCP server for this request.`
}

export function prepareAgentRuntimePrompt(
  prompt: string,
): AgentRuntimePromptMentions {
  const agentMentions: string[] = []
  const skillMentions: string[] = []
  const fileMentions: string[] = []
  const folderMentions: string[] = []
  const toolMentions: string[] = []

  const mentionRegex = /@\[(file|folder|skill|agent|tool):([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = mentionRegex.exec(prompt)) !== null) {
    const [, type, name] = match
    switch (type) {
      case "agent":
        agentMentions.push(name)
        break
      case "skill":
        skillMentions.push(name)
        break
      case "file":
        fileMentions.push(name)
        break
      case "folder":
        folderMentions.push(name)
        break
      case "tool":
        if (isSafeToolMention(name)) {
          toolMentions.push(name)
        }
        break
    }
  }

  const cleanedPrompt = prompt
    .replace(/@\[agent:[^\]]+\]/g, "")
    .replace(/@\[skill:[^\]]+\]/g, "")
    .replace(/@\[tool:[^\]]+\]/g, "")
    .replace(/@\[file:local:([^\]]+)\]/g, "$1")
    .replace(/@\[file:external:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:local:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:external:([^\]]+)\]/g, "$1")
    .trim()

  const instructions: string[] = []
  if (toolMentions.length > 0) {
    instructions.push(...toolMentions.map(toolInstruction))
  }
  if (agentMentions.length > 0) {
    instructions.push(`Use the ${agentMentions.join(", ")} agent(s) for this task.`)
  }
  if (skillMentions.length > 0) {
    instructions.push(`Use the "${skillMentions.join('", "')}" skill(s) for this task.`)
  }

  const promptParts = [
    ...(instructions.length > 0 ? [instructions.join(" ")] : []),
    ...(cleanedPrompt ? [cleanedPrompt] : []),
  ]
  const finalPrompt = promptParts.join("\n\n").trim() || prompt.trim()

  return {
    cleanedPrompt,
    prompt: finalPrompt,
    agentMentions,
    skillMentions,
    fileMentions,
    folderMentions,
    toolMentions,
  }
}
