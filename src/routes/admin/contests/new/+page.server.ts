import type { PageServerLoad, Actions } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { problemBank } from "#lib/server/db.js";
import { saveContest } from "#lib/server/admin.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  requireAdmin(event);
  return {
    contest: null,
    choices: await problemBank(),
    selected: [],
    counts: { participants: 0, submissions: 0 },
    origin: event.url.origin,
  };
};
export const actions = {
  default: (event: Parameters<Actions[string]>[0]) => saveContest(event, 0),
};
