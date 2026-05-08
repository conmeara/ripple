export function shouldCaptureCommentVisualContext(input: {
  captureVisualContext?: boolean
  screenshotPath?: string | null
}): boolean {
  return input.captureVisualContext === true && !input.screenshotPath
}
