import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: "../../test-results/ripple-e2e",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  reporter: [
    ["list"],
    ["html", { outputFolder: "../../playwright-report/ripple-e2e", open: "never" }],
    ["json", { outputFile: "../../test-results/ripple-e2e/report.json" }],
  ],
  expect: {
    timeout: 20_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },
  use: {
    actionTimeout: 20_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
})
