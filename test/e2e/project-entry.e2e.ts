import {
  createProjectFromEntry,
  dismissFirstRun,
  expect,
  expectProjectFile,
  test,
} from "./helpers/ripple-electron"

test.describe("Ripple fresh launch and project workflow", () => {
  test("skips setup, creates a blank project, opens preview, and exposes export controls @smoke @visual", async ({
    page,
    e2e,
  }) => {
    await dismissFirstRun(page)

    await expect(page.getByTestId("ripple-project-entry")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Create a project" })).toBeVisible()
    await expect(page.getByText("Local files are saved in ~/Ripple")).toBeVisible()
    await expect(page.getByTestId("ripple-project-entry-form")).toHaveScreenshot(
      "project-entry-form.png",
    )

    const projectName = `E2E Blank ${e2e.runId}`
    await createProjectFromEntry(page, projectName)

    await expectProjectFile(e2e, projectName, "index.html")
    await expectProjectFile(e2e, projectName, "hyperframes.json")
    await expectProjectFile(e2e, projectName, "compositions/blank.html")

    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await expect(page.getByTestId("ripple-preview-stage")).toBeVisible()
    const previewTime = page.getByRole("slider", { name: "Preview time" })
    await expect(previewTime).toBeVisible()
    await expect(previewTime).toHaveAttribute("aria-disabled", "false", { timeout: 45_000 })

    const playButton = page.getByRole("button", { name: "Play", exact: true })
    await expect(playButton).toBeEnabled()
    await playButton.click()
    const pauseButton = page.getByRole("button", { name: "Pause", exact: true })
    await expect(pauseButton).toBeVisible()
    await pauseButton.click()

    const timelineBox = await previewTime.boundingBox()
    expect(timelineBox).not.toBeNull()
    if (!timelineBox) throw new Error("Preview timeline did not expose a clickable box")
    await page.mouse.click(timelineBox.x + timelineBox.width * 0.5, timelineBox.y + timelineBox.height / 2)
    await expect.poll(async () => Number(await previewTime.getAttribute("aria-valuenow"))).toBeGreaterThan(0)

    await page.getByTestId("ripple-renders-button").click()
    await expect(page.getByTestId("ripple-renders-pane")).toBeVisible()
    await expect(page.getByTestId("ripple-export-button")).toBeVisible()
    await expect(page.getByText("No renders yet")).toBeVisible()
  })
})
