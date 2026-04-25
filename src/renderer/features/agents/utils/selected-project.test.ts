import { describe, expect, test } from "bun:test"
import { toSelectedProject } from "./selected-project"

describe("selected project mapping", () => {
  test("prefers Ripple localPath and preserves Phase 2 project metadata", () => {
    expect(
      toSelectedProject({
        id: "project-1",
        name: "Launch Video",
        path: "/legacy/path",
        localPath: "/Users/example/Ripple/launch-video",
        slug: "launch-video",
        aspectRatioPreset: "wide-16-9",
        activeCompositionId: "composition-1",
        templateId: "starter-title-card",
        setupStatus: "ready",
        setupError: null,
        gitProvider: "github",
      }),
    ).toEqual({
      id: "project-1",
      name: "Launch Video",
      path: "/Users/example/Ripple/launch-video",
      localPath: "/Users/example/Ripple/launch-video",
      slug: "launch-video",
      aspectRatioPreset: "wide-16-9",
      activeCompositionId: "composition-1",
      templateId: "starter-title-card",
      setupStatus: "ready",
      setupError: null,
      lastSetupCheckAt: undefined,
      iconPath: undefined,
      updatedAt: undefined,
      gitRemoteUrl: undefined,
      gitProvider: "github",
      gitOwner: undefined,
      gitRepo: undefined,
    })
  })

  test("rejects projects without a usable local path", () => {
    expect(() =>
      toSelectedProject({
        id: "project-1",
        name: "Launch Video",
      }),
    ).toThrow("Project is missing a local path.")
  })
})
