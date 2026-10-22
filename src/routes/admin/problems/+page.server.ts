import type { PageServerLoad, Actions } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { problemBank } from "#lib/server/db.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  requireAdmin(event);
  return {
    problems: await problemBank(),
    error: event.url.searchParams.has("in-use")
      ? "That problem is used by a contest or has submissions, so it can't be deleted."
      : null,
  };
};
