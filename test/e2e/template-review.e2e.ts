import {
  createProjectFromEntry,
  dismissFirstRun,
  expect,
  expectProjectFile,
  readProjectFile,
  test,
} from "./helpers/ripple-electron"

test.describe("Ripple template, layout, and review workflow", () => {
  test("creates from a bundled template, toggles panes, and records a frame comment @workflow", async ({
    page,
    e2e,
  }) => {
    await dismissFirstRun(page)

    const templateCard = page.getByTestId("ripple-template-card-app-showcase")
    await expect(templateCard).toBeVisible({ timeout: 30_000 })
    await templateCard.click()

    const projectName = `E2E Template ${e2e.runId}`
    await createProjectFromEntry(page, projectName)

    await expectProjectFile(e2e, projectName, "index.html")
    await expect(readProjectFile(e2e, projectName, "hyperframes.json")).resolves.toContain(
      '"templateId": "app-showcase"',
    )
    await expect(readProjectFile(e2e, projectName, "index.html")).resolves.toContain(
      "James Medrano",
    )

    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await page.getByRole("button", { name: "Toggle assets" }).click()
    await expect(page.getByTestId("ripple-preview-player")).toBeVisible()
    await page.getByRole("button", { name: "Toggle assets" }).click()

    await page.getByRole("button", { name: "Comments" }).click()
    await expect(page.getByTestId("ripple-comments-pane")).toBeVisible()
    await expect(page.getByPlaceholder("Comment on this frame...")).toBeVisible()

    const removeVisualContext = page.getByRole("button", {
      name: "Remove visual context",
    })
    if (await removeVisualContext.isVisible().catch(() => false)) {
      await removeVisualContext.click()
    }

    const commentText = "Make the phone screens pop at this frame."
    await page.getByPlaceholder("Comment on this frame...").fill(commentText)
    await page.getByRole("button", { name: "Send comment" }).click()
    await expect(
      page.locator("[data-comment-card='true']").filter({ hasText: commentText }),
    ).toBeVisible({ timeout: 30_000 })

    await page.getByTestId("ripple-renders-button").click()
    await expect(page.getByTestId("ripple-renders-pane")).toBeVisible()
    await expect(page.getByTestId("ripple-export-button")).toBeVisible()
  })
})
