import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs"
import { dirname, join } from "path"

const MIGRATION_MARKER_FILE = "ripple-migration.json"

const SAFE_RELATIVE_FILES = [
  "data/agents.db",
  "data/agents.db-wal",
  "data/agents.db-shm",
  "auth.dat",
  "auth.dat.json",
  "auth.json",
  "window-settings.json",
  "update-channel.json",
] as const

const SAFE_RELATIVE_DIRS = [
  "project-icons",
  "Local Storage",
] as const

const REAL_STATE_RELATIVE_PATHS = [
  ...SAFE_RELATIVE_FILES,
  ...SAFE_RELATIVE_DIRS,
] as const

export interface UserDataMigrationResult {
  migrated: boolean
  sourcePath: string | null
  destinationPath: string
  copiedPaths: string[]
  markerPath?: string
  skippedReason?: "destination-has-state" | "no-legacy-state"
  authReadable?: boolean
}

export interface UserDataMigrationOptions {
  destinationPath: string
  legacyPaths: string[]
  appVersion?: string
  validateAuth?: (destinationPath: string) => boolean
}

function hasPath(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

export function hasRealUserDataState(userDataPath: string): boolean {
  return REAL_STATE_RELATIVE_PATHS.some((relativePath) =>
    hasPath(join(userDataPath, relativePath)),
  )
}

function hasMigrationMarker(userDataPath: string): boolean {
  return hasPath(join(userDataPath, MIGRATION_MARKER_FILE))
}

function copyDirectory(sourcePath: string, destinationPath: string): void {
  mkdirSync(destinationPath, { recursive: true })

  for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntry = join(sourcePath, entry.name)
    const destinationEntry = join(destinationPath, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(sourceEntry, destinationEntry)
    } else if (entry.isFile()) {
      mkdirSync(dirname(destinationEntry), { recursive: true })
      copyFileSync(sourceEntry, destinationEntry)
    }
  }
}

function copyPath(sourcePath: string, destinationPath: string): void {
  const sourceStat = statSync(sourcePath)
  if (sourceStat.isDirectory()) {
    copyDirectory(sourcePath, destinationPath)
    return
  }

  mkdirSync(dirname(destinationPath), { recursive: true })
  copyFileSync(sourcePath, destinationPath)
}

function copySafeState(sourcePath: string, destinationPath: string): string[] {
  const copiedPaths: string[] = []

  for (const relativePath of SAFE_RELATIVE_FILES) {
    const source = join(sourcePath, relativePath)
    if (!hasPath(source)) continue
    const destination = join(destinationPath, relativePath)
    copyPath(source, destination)
    copiedPaths.push(relativePath)
  }

  for (const relativePath of SAFE_RELATIVE_DIRS) {
    const source = join(sourcePath, relativePath)
    if (!hasPath(source)) continue
    const destination = join(destinationPath, relativePath)
    copyPath(source, destination)
    copiedPaths.push(relativePath)
  }

  return copiedPaths
}

function writeMigrationMarker(
  destinationPath: string,
  marker: {
    sourcePath: string
    copiedPaths: string[]
    appVersion?: string
    authReadable?: boolean
  },
): string {
  const markerPath = join(destinationPath, MIGRATION_MARKER_FILE)
  mkdirSync(destinationPath, { recursive: true })
  writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        sourcePath: marker.sourcePath,
        copiedPaths: marker.copiedPaths,
        appVersion: marker.appVersion ?? null,
        authReadable: marker.authReadable ?? null,
      },
      null,
      2,
    )}\n`,
  )
  return markerPath
}

export function migrateLegacyUserData(
  options: UserDataMigrationOptions,
): UserDataMigrationResult {
  const { destinationPath, legacyPaths, validateAuth } = options

  if (hasRealUserDataState(destinationPath) || hasMigrationMarker(destinationPath)) {
    return {
      migrated: false,
      sourcePath: null,
      destinationPath,
      copiedPaths: [],
      skippedReason: "destination-has-state",
    }
  }

  const sourcePath = legacyPaths.find((candidate) => hasRealUserDataState(candidate))
  if (!sourcePath) {
    return {
      migrated: false,
      sourcePath: null,
      destinationPath,
      copiedPaths: [],
      skippedReason: "no-legacy-state",
    }
  }

  const copiedPaths = copySafeState(sourcePath, destinationPath)
  const copiedAuth = copiedPaths.some((relativePath) =>
    relativePath === "auth.dat" ||
    relativePath === "auth.dat.json" ||
    relativePath === "auth.json",
  )
  const authReadable = copiedAuth && validateAuth
    ? validateAuth(destinationPath)
    : undefined
  const markerPath = writeMigrationMarker(destinationPath, {
    sourcePath,
    copiedPaths,
    appVersion: options.appVersion,
    authReadable,
  })

  return {
    migrated: true,
    sourcePath,
    destinationPath,
    copiedPaths,
    markerPath,
    authReadable,
  }
}
