import { beforeAll, describe, expect, mock, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { eq } from "drizzle-orm"
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compositions, exportJobs, projects } from "../db/schema"
import type { HyperframesProjectContext } from "../hyperframes/types"

type ServiceModule = typeof import("./service")

let serviceModule: ServiceModule

beforeAll(async () => {
  mock.module("electron", () => ({
    shell: {
      showItemInFolder: () => undefined,
      openPath: async () => "",
    },
    app: {
      getPath: () => "/tmp/ripple-export-service-test",
      isPackaged: false,
    },
  }))
  serviceModule = await import("./service")
})

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec(`
    CREATE TABLE projects (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      slug text,
      local_path text UNIQUE,
      path text NOT NULL UNIQUE,
      aspect_ratio_preset text,
      active_composition_id text,
      template_id text,
      setup_status text DEFAULT 'unknown' NOT NULL,
      setup_error text,
      last_setup_check_at integer,
      created_at integer,
      updated_at integer,
      archived_at integer,
      git_remote_url text,
      git_provider text,
      git_owner text,
      git_repo text,
      icon_path text
    );
    CREATE TABLE compositions (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      name text NOT NULL,
      file_path text NOT NULL,
      data_composition_id text NOT NULL,
      width integer NOT NULL,
      height integer NOT NULL,
      parent_composition_id text,
      kind text DEFAULT 'root' NOT NULL,
      created_at integer,
      updated_at integer
    );
    CREATE TABLE revisions (
      id text PRIMARY KEY NOT NULL,
      thread_id text NOT NULL,
      project_id text NOT NULL,
      prompt text NOT NULL,
      status text DEFAULT 'queued' NOT NULL
    );
    CREATE TABLE export_jobs (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      composition_id text,
      revision_id text,
      source_context_key text NOT NULL,
      source_label text DEFAULT 'Main' NOT NULL,
      label text NOT NULL,
      format text DEFAULT 'mp4' NOT NULL,
      fps integer DEFAULT 30 NOT NULL,
      quality_preset text DEFAULT 'standard' NOT NULL,
      settings_json text DEFAULT '{}' NOT NULL,
      output_path text,
      destination_path text,
      status text DEFAULT 'queued' NOT NULL,
      progress integer DEFAULT 0 NOT NULL,
      progress_label text,
      pid integer,
      stdout_tail text DEFAULT '' NOT NULL,
      stderr_tail text DEFAULT '' NOT NULL,
      error_message text,
      output_size_bytes integer,
      duration_seconds integer,
      width integer,
      height integer,
      started_at integer,
      created_at integer,
      updated_at integer,
      completed_at integer,
      cancelled_at integer
    );
  `)
  const db = drizzle(sqlite, {
    schema: { projects, compositions, exportJobs },
  })
  return { sqlite, db }
}

async function createProjectFixture() {
  const root = await mkdtemp(join(tmpdir(), "ripple-export-service-"))
  await mkdir(join(root, "exports"), { recursive: true })
  await writeFile(join(root, "hyperframes.json"), "{}", "utf8")
  await writeFile(
    join(root, "index.html"),
    `<div data-composition-id="main" data-width="1920" data-height="1080"></div>`,
    "utf8",
  )
  return root
}

function createContext(root: string): HyperframesProjectContext {
  return {
    key: "project:project-1",
    projectId: "project-1",
    projectPath: root,
    project: {
      id: "project-1",
      name: "Launch Promo",
      slug: "launch",
      path: root,
      localPath: root,
      activeCompositionId: "composition-1",
    },
  } as HyperframesProjectContext
}

function createProbeResult(input: {
  durationSeconds?: number
  width?: number
  height?: number
  formatName?: string
  videoCodec?: string
} = {}) {
  return {
    durationSeconds: input.durationSeconds ?? 6,
    width: input.width ?? 1920,
    height: input.height ?? 1080,
    formatName: input.formatName ?? "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: input.videoCodec ?? "h264",
  }
}

function createContextResolvers(root: string) {
  const context = createContext(root)
  return {
    resolveProjectContext: async () => context,
    resolvePreviewContext: async () => context,
  }
}

async function writePngFrame(path: string, width = 1920, height = 1080) {
  const png = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write("IHDR", 12, "ascii")
  png.writeUInt32BE(width, 16)
  png.writeUInt32BE(height, 20)
  await writeFile(path, png)
}

async function waitForStatus(
  service: InstanceType<ServiceModule["ExportService"]>,
  jobId: string,
  status: string,
) {
  for (let index = 0; index < 20; index += 1) {
    const job = service.get(jobId)
    if (job?.status === status) return job
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return service.get(jobId)
}

describe("ExportService", () => {
  test("persists a Producer-backed export and records completed output facts", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async (input) => {
          input.onProgress?.({
            status: "rendering",
            progress: 50,
            label: "Capturing frames",
          })
          await writeFile(input.outputPath, "video", "utf8")
          return { durationSeconds: 6, width: 1920, height: 1080 }
        },
        probeOutput: async () => createProbeResult(),
      })

      const started = await service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
      })
      const completed = await waitForStatus(service, started.id, "completed")

      expect(completed).toMatchObject({
        status: "completed",
        progress: 100,
        outputSizeBytes: 5,
        durationSeconds: 6,
        width: 1920,
        height: 1080,
      })
      expect(completed?.outputPath).toContain("/exports/")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("persists a PNG sequence export as a directory and copies audio sidecars", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      const destinationPath = join(root, "chosen", "launch-main-png-sequence")
      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async (input) => {
          expect(input.format).toBe("png-sequence")
          expect(input.outputPath.endsWith("-png-sequence")).toBe(true)
          await mkdir(input.outputPath, { recursive: true })
          await writePngFrame(join(input.outputPath, "frame_000000.png"))
          await writePngFrame(join(input.outputPath, "frame_000001.png"))
          await writeFile(join(input.outputPath, "audio.aac"), "audio", "utf8")
          return { durationSeconds: 2, width: 1920, height: 1080 }
        },
      })
      const destination = service.createDestinationToken({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "png-sequence",
        path: destinationPath,
      })

      const started = await service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "png-sequence",
        fps: 30,
        qualityPreset: "standard",
        destinationToken: destination.id,
      })
      const completed = await waitForStatus(service, started.id, "completed")

      expect(completed).toMatchObject({
        status: "completed",
        progress: 100,
        outputSizeBytes: 53,
        durationSeconds: 2,
        width: 1920,
        height: 1080,
        destinationPath,
        displayPath: destinationPath,
      })
      expect(completed?.outputPath?.endsWith("-png-sequence")).toBe(true)
      expect((await readdir(destinationPath)).sort()).toEqual([
        "audio.aac",
        "frame_000000.png",
        "frame_000001.png",
      ])
      expect(await readFile(join(destinationPath, "audio.aac"), "utf8")).toBe("audio")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects a project exports folder that resolves outside the project", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    const outside = await mkdtemp(join(tmpdir(), "ripple-export-outside-"))
    try {
      await rm(join(root, "exports"), { recursive: true, force: true })
      await symlink(outside, join(root, "exports"), "dir")
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async () => {
          throw new Error("should not render")
        },
      })

      await expect(service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
      })).rejects.toThrow("Export output folder")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  test("exports the active chat worktree preview source", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    const chatRoot = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      const mainContext = createContext(root)
      const chatContext = {
        ...mainContext,
        key: "chat-worktree-chat-1",
        projectId: "chat-worktree-chat-1",
        projectPath: chatRoot,
      }
      const service = new serviceModule.ExportService({
        db: db as never,
        resolveProjectContext: async () => mainContext,
        resolvePreviewContext: async (input) => input.chatId ? chatContext : mainContext,
        execute: async (input) => {
          expect(input.projectDir).toBe(chatRoot)
          await writeFile(input.outputPath, "chat-video", "utf8")
          return { durationSeconds: 6, width: 1920, height: 1080 }
        },
        probeOutput: async () => createProbeResult(),
      })

      const started = await service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        chatId: "chat-1",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
      })
      const completed = await waitForStatus(service, started.id, "completed")

      expect(completed?.status).toBe("completed")
      expect(completed?.sourceContextKey).toBe("chat-worktree-chat-1")
      expect(completed?.sourceLabel).toBe("Current Preview")
      expect(completed?.revisionId).toBeNull()
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
      await rm(chatRoot, { recursive: true, force: true })
    }
  })

  test("fails the job when FFprobe facts do not match the export", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async (input) => {
          await writeFile(input.outputPath, "video", "utf8")
          return { durationSeconds: 6, width: 1920, height: 1080 }
        },
        probeOutput: async () => createProbeResult({ width: 1280 }),
      })

      const started = await service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
      })
      const failed = await waitForStatus(service, started.id, "failed")

      expect(failed?.status).toBe("failed")
      expect(failed?.errorMessage).toContain("Export dimensions")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects an explicit missing composition instead of falling back", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async () => {
          throw new Error("should not render")
        },
      })

      await expect(service.start({
        projectId: "project-1",
        compositionId: "missing-composition",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
      })).rejects.toThrow("selected composition")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("cancels an active export with AbortSignal", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async (input) => {
          await new Promise((_resolve, reject) => {
            input.signal?.addEventListener("abort", () => reject(new Error("aborted")))
          })
          return { durationSeconds: null, width: null, height: null }
        },
      })

      const started = await service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
      })
      await service.cancel(started.id)
      const cancelled = await waitForStatus(service, started.id, "cancelled")

      expect(cancelled?.status).toBe("cancelled")
      expect(cancelled?.cancelledAt).toBeInstanceOf(Date)
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("retries a failed export to the same chosen destination", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      let attempt = 0
      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async (input) => {
          attempt += 1
          if (attempt === 1) {
            throw new Error("first render failed")
          }
          await writeFile(input.outputPath, "retry-video", "utf8")
          return { durationSeconds: 6, width: 1920, height: 1080 }
        },
        probeOutput: async () => createProbeResult(),
      })
      const destinationPath = join(root, "chosen", "launch.mp4")
      const destination = service.createDestinationToken({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "mp4",
        path: destinationPath,
      })

      const started = await service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
        destinationToken: destination.id,
      })
      const failed = await waitForStatus(service, started.id, "failed")
      const retried = await service.retry(started.id)
      const completed = await waitForStatus(service, retried.id, "completed")

      expect(failed?.destinationPath).toBe(destinationPath)
      expect(completed?.status).toBe("completed")
      expect(completed?.destinationPath).toBe(destinationPath)
      expect(completed?.displayPath).toBe(destinationPath)
      expect(await readFile(destinationPath, "utf8")).toBe("retry-video")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("does not mark a job complete after cancellation during finalization", async () => {
    const { sqlite, db } = createTestDb()
    const root = await createProjectFixture()
    try {
      db.insert(projects).values({
        id: "project-1",
        name: "Launch Promo",
        slug: "launch",
        path: root,
        localPath: root,
        activeCompositionId: "composition-1",
      }).run()
      db.insert(compositions).values({
        id: "composition-1",
        projectId: "project-1",
        name: "Main",
        filePath: "index.html",
        dataCompositionId: "main",
        width: 1920,
        height: 1080,
      }).run()

      let resolveProbeStarted: () => void = () => {}
      let releaseProbe: () => void = () => {}
      const probeStarted = new Promise<void>((resolve) => {
        resolveProbeStarted = resolve
      })
      const probeCanFinish = new Promise<void>((resolve) => {
        releaseProbe = resolve
      })

      const service = new serviceModule.ExportService({
        db: db as never,
        ...createContextResolvers(root),
        execute: async (input) => {
          await writeFile(input.outputPath, "video", "utf8")
          return { durationSeconds: 6, width: 1920, height: 1080 }
        },
        probeOutput: async () => {
          resolveProbeStarted()
          await probeCanFinish
          return createProbeResult()
        },
      })

      const started = await service.start({
        projectId: "project-1",
        compositionId: "composition-1",
        format: "mp4",
        fps: 30,
        qualityPreset: "draft",
      })
      await probeStarted
      await service.cancel(started.id)
      releaseProbe()

      const afterFinalization = await waitForStatus(service, started.id, "completed")
      expect(afterFinalization?.status).toBe("cancelled")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("marks stale running jobs as interrupted once", () => {
    const { sqlite, db } = createTestDb()
    try {
      db.insert(exportJobs).values({
        id: "export-1",
        projectId: "project-1",
        sourceContextKey: "project:project-1",
        sourceLabel: "Main",
        label: "Main MP4",
        format: "mp4",
        fps: 30,
        qualityPreset: "standard",
        settingsJson: "{}",
        status: "running",
        progress: 40,
        stdoutTail: "",
        stderrTail: "",
      }).run()

      const service = new serviceModule.ExportService({ db: db as never })
      expect(service.recoverInterruptedJobs()).toEqual({ interrupted: 1 })
      expect(service.recoverInterruptedJobs()).toEqual({ interrupted: 0 })
      expect(
        db.select()
          .from(exportJobs)
          .where(eq(exportJobs.id, "export-1"))
          .get()?.status,
      ).toBe("interrupted")
    } finally {
      sqlite.close()
    }
  })
})
