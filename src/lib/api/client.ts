/**
 * Shared client fetch helper for React Query hooks.
 * Throws on non-OK responses so useQuery can surface errors.
 */
export async function apiGet<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: 'GET',
  })

  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`)
  }

  return res.json() as Promise<T>
}

/** Stable serialization for query keys from filter objects. */
export function stableSearchParamsKey(
  searchParams: Record<string, unknown>
): string {
  const entries: Array<[string, string]> = []

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'page' || value === undefined || value === null || value === '') {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        entries.push([key, String(item)])
      }
    } else {
      entries.push([key, String(value)])
    }
  }

  entries.sort(([aKey, aVal], [bKey, bVal]) => {
    if (aKey === bKey) return aVal.localeCompare(bVal)
    return aKey.localeCompare(bKey)
  })

  return new URLSearchParams(entries).toString()
}

export function appendSearchParams(
  params: URLSearchParams,
  searchParams: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'page' || value === undefined || value === null || value === '') {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item))
      }
    } else {
      params.set(key, String(value))
    }
  }
}
