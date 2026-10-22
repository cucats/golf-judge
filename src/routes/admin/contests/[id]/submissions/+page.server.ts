import type { PageServerLoad, Actions } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { contest, contestProblems } from "#lib/server/db.js";
import { submissions } from "#lib/server/submissions.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  requireAdmin(event);
  const c = await contest(event.params.id);
  return {
    contest: c,
    problems: await contestProblems(c.id),
    submissions: await submissions(c.id, event.url.searchParams),
    filters: Object.fromEntries(event.url.searchParams),
  };
};
