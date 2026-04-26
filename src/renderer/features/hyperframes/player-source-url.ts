export function buildHyperframesPlayerFetchUrl(
  sourceUrl: string,
  reloadVersion: number,
): string {
  const separator = sourceUrl.includes("?") ? "&" : "?"
  return `${sourceUrl}${separator}rippleReload=${reloadVersion}`
}

export function buildHyperframesPlayerBlobDocument(input: {
  html: string
  sourceUrl: string
}): string {
  return `${input.html}\n<!-- ripple-player-source:${input.sourceUrl} -->`
}
