import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { isDirentDirectory } from "../../fs/dirent"
import { getEnabledPlugins } from "./claude-settings"
import { isPathInsideDirectory } from "../../ripple-projects/paths"
import { getAppManagedHyperframesSkillRoots } from "../../ripple-projects/hyperframes-skills"

export interface FileSkill {
  name: string
  description: string
  source: "app" | "user" | "project" | "plugin"
  provider: "claude" | "codex" | "plugin"
  readOnly: boolean
  pluginName?: string
  path: string
  content: string
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillMd(rawContent: string): { name?: string; description?: string; content: string } {
  try {
    const { data, content } = matter(rawContent)
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      content: content.trim(),
    }
  } catch (err) {
    console.error("[skills] Failed to parse frontmatter:", err)
    return { content: rawContent.trim() }
  }
}

/**
 * Scan a directory for SKILL.md files
 */
async function scanSkillsDirectory(
  dir: string,
  source: FileSkill["source"],
  provider: FileSkill["provider"],
  basePath?: string, // For project skills, the cwd to make paths relative to
): Promise<FileSkill[]> {
  const skills: FileSkill[] = []

  try {
    // Check if directory exists
    try {
      await fs.access(dir)
    } catch {
      return skills
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      // Check if entry is a directory (follows symlinks)
      const isDir = await isDirentDirectory(dir, entry)
      if (!isDir) continue

      // Validate entry name for security (prevent path traversal)
      if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
        console.warn(`[skills] Skipping invalid directory name: ${entry.name}`)
        continue
      }

      const skillMdPath = path.join(dir, entry.name, "SKILL.md")

      try {
        await fs.access(skillMdPath)
        const content = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(content)

        // For project skills, show relative path; for user skills, show ~/.claude/... path
        let displayPath: string
        if (source === "project" && basePath) {
          displayPath = path.relative(basePath, skillMdPath)
        } else {
          // For user skills, show ~/.claude/skills/... format
          const homeDir = os.homedir()
          displayPath = skillMdPath.startsWith(homeDir)
            ? "~" + skillMdPath.slice(homeDir.length)
            : skillMdPath
        }

        skills.push({
          name: parsed.name || entry.name,
          description: parsed.description || "",
          source,
          provider,
          readOnly: source === "app" || source === "plugin",
          path: displayPath,
          content: parsed.content,
        })
      } catch (err) {
        // Skill directory doesn't have SKILL.md or read failed - skip it
      }
    }
  } catch (err) {
    console.error(`[skills] Failed to scan directory ${dir}:`, err)
  }

  return skills
}

// Shared procedure for listing skills
const listSkillsProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const userClaudeSkillsDir = path.join(os.homedir(), ".claude", "skills")
    const userCodexSkillsDir = path.join(os.homedir(), ".agents", "skills")
    const appClaudeSkillsPromises = getAppManagedHyperframesSkillRoots("claude").map((dir) =>
      scanSkillsDirectory(dir, "app", "claude")
    )
    const appCodexSkillsPromises = getAppManagedHyperframesSkillRoots("codex").map((dir) =>
      scanSkillsDirectory(dir, "app", "codex")
    )
    const userClaudeSkillsPromise = scanSkillsDirectory(userClaudeSkillsDir, "user", "claude")
    const userCodexSkillsPromise = scanSkillsDirectory(userCodexSkillsDir, "user", "codex")

    let projectClaudeSkillsPromise = Promise.resolve<FileSkill[]>([])
    let projectCodexSkillsPromise = Promise.resolve<FileSkill[]>([])
    if (input?.cwd) {
      const projectClaudeSkillsDir = path.join(input.cwd, ".claude", "skills")
      const projectCodexSkillsDir = path.join(input.cwd, ".agents", "skills")
      projectClaudeSkillsPromise = scanSkillsDirectory(
        projectClaudeSkillsDir,
        "project",
        "claude",
        input.cwd,
      )
      projectCodexSkillsPromise = scanSkillsDirectory(
        projectCodexSkillsDir,
        "project",
        "codex",
        input.cwd,
      )
    }

    // Discover plugin skills
    const [enabledPluginSources, installedPlugins] = await Promise.all([
      getEnabledPlugins(),
      discoverInstalledPlugins(),
    ])
    const enabledPlugins = installedPlugins.filter(
      (p) => enabledPluginSources.includes(p.source),
    )
    const pluginSkillsPromises = enabledPlugins.map(async (plugin) => {
      const paths = getPluginComponentPaths(plugin)
      try {
        const skills = await scanSkillsDirectory(paths.skills, "plugin", "plugin")
        return skills.map((skill) => ({ ...skill, pluginName: plugin.source }))
      } catch {
        return []
      }
    })

    // Scan all directories in parallel
    const [
      appClaudeSkillGroups,
      appCodexSkillGroups,
      userClaudeSkills,
      userCodexSkills,
      projectClaudeSkills,
      projectCodexSkills,
      ...pluginSkillsArrays
    ] =
      await Promise.all([
        Promise.all(appClaudeSkillsPromises),
        Promise.all(appCodexSkillsPromises),
        userClaudeSkillsPromise,
        userCodexSkillsPromise,
        projectClaudeSkillsPromise,
        projectCodexSkillsPromise,
        ...pluginSkillsPromises,
      ])
    const pluginSkills = pluginSkillsArrays.flat()
    const appClaudeSkills = appClaudeSkillGroups.flat()
    const appCodexSkills = appCodexSkillGroups.flat()

    return [
      ...appClaudeSkills,
      ...appCodexSkills,
      ...projectClaudeSkills,
      ...projectCodexSkills,
      ...userClaudeSkills,
      ...userCodexSkills,
      ...pluginSkills,
    ]
  })

/**
 * Generate SKILL.md content from name, description, and body
 */
function generateSkillMd(skill: { name: string; description: string; content: string }): string {
  const frontmatter: string[] = []
  frontmatter.push(`name: ${skill.name}`)
  if (skill.description) {
    frontmatter.push(`description: ${skill.description}`)
  }
  return `---\n${frontmatter.join("\n")}\n---\n\n${skill.content}`
}

/**
 * Resolve the absolute filesystem path of a skill given its display path
 */
function resolveSkillPath(displayPath: string): string {
  if (displayPath.startsWith("~/")) {
    return path.join(os.homedir(), displayPath.slice(2))
  }
  return path.resolve(displayPath)
}

function assertMutableSkillPath(input: {
  absolutePath: string
  cwd?: string
}): void {
  const allowedRoots = [
    path.join(os.homedir(), ".claude", "skills"),
    path.join(os.homedir(), ".agents", "skills"),
  ]
  if (input.cwd) {
    allowedRoots.push(path.join(input.cwd, ".claude", "skills"))
    allowedRoots.push(path.join(input.cwd, ".agents", "skills"))
  }

  if (!allowedRoots.some((root) => isPathInsideDirectory(root, input.absolutePath))) {
    throw new Error("Skill edits are only allowed in user or project skill folders.")
  }
}

function resolveMutableSkillPath(input: {
  displayPath: string
  cwd?: string
}): string {
  if (input.displayPath.includes("..")) {
    throw new Error("Invalid path")
  }
  const absolutePath = input.cwd &&
      !input.displayPath.startsWith("~") &&
      !path.isAbsolute(input.displayPath)
    ? path.resolve(input.cwd, input.displayPath)
    : resolveSkillPath(input.displayPath)

  assertMutableSkillPath({ absolutePath, cwd: input.cwd })
  return absolutePath
}

export const skillsRouter = router({
  /**
   * List all skills from filesystem
   * - User skills: ~/.claude/skills/
   * - Project skills: .claude/skills/ (relative to cwd)
   */
  list: listSkillsProcedure,

  /**
   * Alias for list - used by @ mention
   */
  listEnabled: listSkillsProcedure,

  /**
   * Create a new skill
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        content: z.string(),
        source: z.enum(["user", "project"]),
        provider: z.enum(["claude", "codex"]).optional(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      if (!safeName) {
        throw new Error("Skill name must contain at least one alphanumeric character")
      }

      let targetDir: string
      const provider = input.provider ?? "claude"
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project skills")
        }
        targetDir = path.join(
          input.cwd,
          provider === "claude" ? ".claude" : ".agents",
          "skills",
        )
      } else {
        targetDir = path.join(
          os.homedir(),
          provider === "claude" ? ".claude" : ".agents",
          "skills",
        )
      }

      const skillDir = path.join(targetDir, safeName)
      const skillMdPath = path.join(skillDir, "SKILL.md")

      // Check if already exists
      try {
        await fs.access(skillMdPath)
        throw new Error(`Skill "${safeName}" already exists`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err
        }
      }

      // Create directory and write SKILL.md
      await fs.mkdir(skillDir, { recursive: true })

      const fileContent = generateSkillMd({
        name: safeName,
        description: input.description,
        content: input.content,
      })

      await fs.writeFile(skillMdPath, fileContent, "utf-8")

      return {
        name: safeName,
        path: skillMdPath,
        source: input.source,
        provider,
      }
    }),

  /**
   * Update a skill's SKILL.md content
   */
  update: publicProcedure
    .input(
      z.object({
        path: z.string(),
        name: z.string(),
        description: z.string(),
        content: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const absolutePath = resolveMutableSkillPath({
        displayPath: input.path,
        cwd: input.cwd,
      })

      // Verify file exists before writing
      await fs.access(absolutePath)

      const fileContent = generateSkillMd({
        name: input.name,
        description: input.description,
        content: input.content,
      })

      await fs.writeFile(absolutePath, fileContent, "utf-8")

      return { success: true }
    }),

  /**
   * Delete a skill directory
   */
  delete: publicProcedure
    .input(
      z.object({
        path: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const absolutePath = resolveMutableSkillPath({
        displayPath: input.path,
        cwd: input.cwd,
      })

      // Skills are directories containing SKILL.md — delete the parent directory
      const skillDir = path.dirname(absolutePath)
      await fs.access(skillDir)
      await fs.rm(skillDir, { recursive: true })

      return { success: true }
    }),
})
