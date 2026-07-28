const DEFAULT_TIMEOUT_MS = 12_000

export async function withTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
