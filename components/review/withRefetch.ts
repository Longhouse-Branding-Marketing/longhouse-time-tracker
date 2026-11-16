import { invalidateApiCache } from "@/lib/api";
import type { ActionResult } from "@/app/review/actions";

export function withRefetch(
  action: (fd: FormData) => Promise<ActionResult>,
  appendAuth: (fd: FormData) => void
) {
  return async (fd: FormData): Promise<ActionResult> => {
    appendAuth(fd);
    const result = await action(fd);
    if (result.ok) invalidateApiCache();
    return result;
  };
}
