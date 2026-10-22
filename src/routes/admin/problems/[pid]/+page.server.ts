import type { PageServerLoad, Actions } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { problem, id } from "#lib/server/db.js";
import { defaultProblem, usage, saveProblem } from "#lib/server/admin.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  requireAdmin(event);
  const p = await problem(event.params.pid);
  return {
    problem: p,
    usedIn: p.id ? await usage(p.id) : [],
    saved: event.url.searchParams.has("saved"),
  };
};
export const actions = {
  default: (event: Parameters<Actions[string]>[0]) =>
    saveProblem(event, id(event.params.pid)),
};
