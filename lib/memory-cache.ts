/**
 * Process-local cache for payloads too large for Next.js `unstable_cache`
 * (hard 2MB per-entry limit). Cleared alongside `revalidateTag(TIME_TRACKING_TAG)`.
 */

type Entry<T> = { generation: number; value: T };

let generation = 0;
const store = new Map<string, Entry<unknown>>();

/** Drop all in-memory time-tracking bundles (call with revalidateTag). */
export function bustMemoryCache() {
  generation += 1;
  store.clear();
}

export async function memoryCached<T>(
  key: string,
  load: () => Promise<T>
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.generation === generation) return hit.value;

  const value = await load();
  store.set(key, { generation, value });
  return value;
}
