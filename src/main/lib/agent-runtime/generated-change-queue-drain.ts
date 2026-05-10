export interface GeneratedChangeQueueDrainResult {
  claimed: boolean
}

export type GeneratedChangeQueueProcessor<
  TResult extends GeneratedChangeQueueDrainResult,
> = (input?: { projectId?: string | null }) => Promise<TResult>

const GENERATED_CHANGE_QUEUE_PARALLELISM = 4

export async function drainGeneratedChangeQueueForProject<
  TResult extends GeneratedChangeQueueDrainResult,
>(
  input: { projectId?: string | null } = {},
  options: {
    parallelism?: number
    processor: GeneratedChangeQueueProcessor<TResult>
  },
): Promise<void> {
  const parallelism = Math.max(
    1,
    Math.floor(options.parallelism ?? GENERATED_CHANGE_QUEUE_PARALLELISM),
  )
  await Promise.all(Array.from({ length: parallelism }, async () => {
    for (;;) {
      const result = await options.processor(input)
      if (!result.claimed) break
    }
  }))
}
