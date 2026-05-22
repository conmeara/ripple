import type { Server } from "node:http"

function isRetryableListenError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "EADDRINUSE" || code === "EACCES"
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function listenOnce(server: Server, host: string): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    let settled = false
    const cleanup = () => {
      server.off("error", onError)
    }
    const onError = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      try {
        server.close(() => rejectPort(error))
      } catch {
        rejectPort(error)
      }
    }

    server.once("error", onError)
    server.listen(0, host, () => {
      if (settled) return
      settled = true
      cleanup()
      const address = server.address()
      if (typeof address === "object" && address?.port) {
        resolvePort(address.port)
      } else {
        rejectPort(new Error("Failed to bind local HTTP server."))
      }
    })
  })
}

export async function listenOnLocalhost(
  server: Server,
  label: string,
): Promise<number> {
  const host = "127.0.0.1"
  let lastError: unknown = null

  const maxAttempts = 8
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await listenOnce(server, host)
    } catch (error) {
      lastError = error
      if (!isRetryableListenError(error) || attempt === maxAttempts - 1) break
      await delay(10 + attempt * 25)
    }
  }

  if (lastError instanceof Error) {
    lastError.message = `${label} could not bind a local HTTP server: ${lastError.message}`
    throw lastError
  }
  throw new Error(`${label} could not bind a local HTTP server.`)
}

export function closeLocalHttpServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    if (!server.listening) {
      resolveClose()
      return
    }
    server.close(() => resolveClose())
  })
}
