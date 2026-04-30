import { describe, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import simpleGit from "simple-git"
import {
  buildRevisionAcceptPatch,
  buildRevisionProposalPatch,
  refreshRevisionProposalFromLatest,
  resolveRevisionProjectPath,
} from "./revision-acceptance"
import { acceptIsolatedWorkspace } from "./isolated-workspace-acceptance"
import { extractAssistantFinalResponseFromMessages } from "./comment-summary"
import {
  appendRippleCommentPromptMessage,
  buildRevisionPrompt,
} from "./comment-prompt"

const execFileAsync = promisify(execFile)

async function configureGit(projectPath: string): Promise<void> {
  await execFileAsync("git", ["-C", projectPath, "init", "-b", "main"])
  await execFileAsync("git", ["-C", projectPath, "config", "user.name", "Test"])
  await execFileAsync("git", [
    "-C",
    projectPath,
    "config",
    "user.email",
    "test@example.invalid",
  ])
}

describe("comment revision summaries", () => {
  test("uses Ripple localPath when resolving project operations", () => {
    expect(
      resolveRevisionProjectPath({
        path: "/legacy/project",
        localPath: "/Users/example/Ripple/project",
      }),
    ).toBe("/Users/example/Ripple/project")
  })

  test("uses the final assistant response instead of progress text", () => {
    const messages = JSON.stringify([
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "I'm making a minimal first-frame change.",
          },
          {
            type: "tool-Bash",
            input: { command: "git diff -- index.html" },
          },
          {
            type: "text",
            text: "At 00:00:00:00, the main title now reads \"hi\" while keeping the same existing fade-up motion and timing.",
          },
        ],
      },
    ])

    expect(extractAssistantFinalResponseFromMessages(messages)).toBe(
      "At 00:00:00:00, the main title now reads \"hi\" while keeping the same existing fade-up motion and timing.",
    )
  })

  test("keeps the final assistant response available for read-more UI", () => {
    const longResponse = [
      "Changed the title text in `index.html:85` from \"test 01\" to \"test3\".",
      "The eyebrow ends at frame 90 and the title is visible at frame 91.",
      "I kept the existing timing, easing, and composition dimensions intact.",
      "The lower-third treatment still starts at the same frame.",
      "No asset paths or export settings were changed.",
    ].join(" ")
    const messages = JSON.stringify([
      {
        role: "assistant",
        parts: [{ type: "text", text: longResponse }],
      },
    ])

    expect(extractAssistantFinalResponseFromMessages(messages)).toBe(longResponse)
  })

  test("adds frame and composition context to revision conversation prompts", () => {
    const prompt = buildRevisionPrompt({
      body: "Make this line land harder.",
      project: { name: "Launch Promo" } as any,
      composition: {
        name: "Lower Third",
        filePath: "compositions/lower-third.html",
      } as any,
      thread: {
        anchorType: "range",
        startTime: 1250,
        endTime: 2750,
        startFrame: 38,
        endFrame: 83,
        elementSelector: ".lower-third-title",
        clipKey: "lower-third:title",
        sourceFile: "compositions/lower-third.html",
        compositionId: "composition-1",
      } as any,
    })

    expect(prompt).toContain("Make this line land harder.")
    expect(prompt).toContain("Composition: Lower Third (compositions/lower-third.html)")
    expect(prompt).toContain("Time: 00:00:01:08 to 00:00:02:23")
    expect(prompt).toContain("Frame: 38 to 83")
    expect(prompt).toContain("Element selector: .lower-third-title")
    expect(prompt).toContain("Clip: lower-third:title")
  })

  test("appends follow-up prompts to the same revision conversation transcript", () => {
    const existing = JSON.stringify([
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Make the title bigger." }],
        metadata: { source: "ripple-comment", revisionId: "rev-1" },
      },
      {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "text", text: "Updated the title." }],
      },
    ])

    const next = JSON.parse(
      appendRippleCommentPromptMessage({
        messages: existing,
        prompt: "A little less large.",
        threadId: "thread-1",
        revisionId: "rev-2",
        model: "opus",
      }),
    )

    expect(next).toHaveLength(3)
    expect(next[2].parts[0].text).toBe("A little less large.")
    expect(next[2].metadata).toMatchObject({
      source: "ripple-comment",
      threadId: "thread-1",
      revisionId: "rev-2",
      model: "opus",
    })
  })

  test("appends pasted attachments to revision conversation prompts", () => {
    const next = JSON.parse(
      appendRippleCommentPromptMessage({
        messages: [],
        prompt: "Use this reference.",
        threadId: "thread-1",
        revisionId: "rev-1",
        attachments: [
          {
            type: "image",
            base64Data: "aW1hZ2U=",
            mediaType: "image/png",
            filename: "frame.png",
          },
          {
            type: "file",
            base64Data: "ZmlsZQ==",
            mediaType: "application/pdf",
            filename: "brief.pdf",
            size: 12,
          },
        ],
      }),
    )

    expect(next).toHaveLength(1)
    expect(next[0].parts).toEqual([
      { type: "text", text: "Use this reference." },
      {
        type: "data-image",
        data: {
          base64Data: "aW1hZ2U=",
          mediaType: "image/png",
          filename: "frame.png",
        },
      },
      {
        type: "data-file",
        data: {
          base64Data: "ZmlsZQ==",
          mediaType: "application/pdf",
          filename: "brief.pdf",
          size: 12,
        },
      },
    ])
  })

  test("accept patch includes committed and uncommitted revision changes", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-accept-patch-"))
    try {
      await configureGit(projectPath)
      await writeFile(join(projectPath, "index.html"), "<main>Base</main>", "utf8")
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Base"])
      const baseCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()

      await writeFile(
        join(projectPath, "committed.html"),
        "<main>Committed change</main>",
        "utf8",
      )
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Committed change"])
      await writeFile(
        join(projectPath, "index.html"),
        "<main>Working tree change</main>",
        "utf8",
      )

      const patch = await buildRevisionAcceptPatch({
        revisionPath: projectPath,
        baseProjectCommit: baseCommit,
      })

      expect(patch).toContain("committed.html")
      expect(patch).toContain("Committed change")
      expect(patch).toContain("Working tree change")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("accepts an isolated revision workspace through the shared acceptance service", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-accept-service-project-"))
    const revisionPath = await mkdtemp(join(tmpdir(), "ripple-accept-service-revision-"))
    try {
      await configureGit(projectPath)
      await execFileAsync("git", [
        "-C",
        projectPath,
        "config",
        "ripple.revisionManaged",
        "true",
      ])
      await writeFile(join(projectPath, "index.html"), "<main>Base</main>", "utf8")
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Base"])
      const baseCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()
      await execFileAsync("git", [
        "-C",
        projectPath,
        "worktree",
        "add",
        revisionPath,
        baseCommit,
      ])

      await writeFile(join(revisionPath, "index.html"), "<main>Accepted</main>", "utf8")

      const result = await acceptIsolatedWorkspace({
        strategy: "patch",
        projectPath,
        workspacePath: revisionPath,
        baseProjectCommit: baseCommit,
        commitMessage: "Accept test revision",
      })

      expect(result.acceptedProjectCommit).toBeTruthy()
      expect(result.proposalPatch).toContain("Accepted")
      expect(await readFile(join(projectPath, "index.html"), "utf8")).toContain(
        "Accepted",
      )
      expect((await simpleGit(projectPath).status()).isClean()).toBe(true)
    } finally {
      await rm(revisionPath, { recursive: true, force: true })
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("proposal patch includes committed and untracked revision changes", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-proposal-patch-"))
    try {
      await configureGit(projectPath)
      await writeFile(join(projectPath, "index.html"), "<main>Base</main>", "utf8")
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Base"])
      const baseCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()

      await writeFile(
        join(projectPath, "committed.html"),
        "<main>Committed change</main>",
        "utf8",
      )
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Committed change"])
      await writeFile(
        join(projectPath, "untracked.html"),
        "<main>Untracked change</main>",
        "utf8",
      )

      const patch = await buildRevisionProposalPatch({
        revisionPath: projectPath,
        baseProjectCommit: baseCommit,
      })

      expect(patch).toContain("committed.html")
      expect(patch).toContain("Committed change")
      expect(patch).toContain("untracked.html")
      expect(patch).toContain("Untracked change")
    } finally {
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("refreshes a revision proposal onto the latest project commit", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-refresh-project-"))
    const revisionPath = await mkdtemp(join(tmpdir(), "ripple-refresh-revision-"))
    try {
      await configureGit(projectPath)
      await writeFile(join(projectPath, "index.html"), "<main>Base</main>", "utf8")
      await writeFile(join(projectPath, "title.html"), "<h1>Base</h1>", "utf8")
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Base"])
      const baseCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()
      await execFileAsync("git", [
        "-C",
        projectPath,
        "worktree",
        "add",
        revisionPath,
        baseCommit,
      ])

      await writeFile(join(revisionPath, "title.html"), "<h1>Comment B</h1>", "utf8")
      await writeFile(join(projectPath, "index.html"), "<main>Accepted A</main>", "utf8")
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Accept A"])
      const latestCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()

      const result = await refreshRevisionProposalFromLatest({
        projectPath,
        revisionPath,
        baseProjectCommit: baseCommit,
      })

      expect(result.refreshed).toBe(true)
      expect(result.currentCommit).toBe(latestCommit)
      expect(await readFile(join(revisionPath, "index.html"), "utf8")).toContain(
        "Accepted A",
      )
      expect(await readFile(join(revisionPath, "title.html"), "utf8")).toContain(
        "Comment B",
      )
      expect(result.summaryPatch).toContain("Comment B")
    } finally {
      await rm(revisionPath, { recursive: true, force: true })
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("leaves a conflicting proposal for the agent refresh path", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ripple-refresh-conflict-project-"))
    const revisionPath = await mkdtemp(join(tmpdir(), "ripple-refresh-conflict-revision-"))
    try {
      await configureGit(projectPath)
      await writeFile(join(projectPath, "title.html"), "<h1>Base</h1>", "utf8")
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Base"])
      const baseCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()
      await execFileAsync("git", [
        "-C",
        projectPath,
        "worktree",
        "add",
        revisionPath,
        baseCommit,
      ])

      await writeFile(join(revisionPath, "title.html"), "<h1>Comment B</h1>", "utf8")
      await writeFile(join(projectPath, "title.html"), "<h1>Accepted A</h1>", "utf8")
      await execFileAsync("git", ["-C", projectPath, "add", "-A"])
      await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Accept A"])

      const result = await refreshRevisionProposalFromLatest({
        projectPath,
        revisionPath,
        baseProjectCommit: baseCommit,
      })

      expect(result.refreshed).toBe(false)
      expect(result.error).toBeTruthy()
      expect(await readFile(join(revisionPath, "title.html"), "utf8")).toContain(
        "Comment B",
      )
    } finally {
      await rm(revisionPath, { recursive: true, force: true })
      await rm(projectPath, { recursive: true, force: true })
    }
  })
})
