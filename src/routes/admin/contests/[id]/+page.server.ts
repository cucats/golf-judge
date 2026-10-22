import type { PageServerLoad, Actions } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import {
  contest,
  contestProblems,
  problemBank,
  one,
  id,
} from "#lib/server/db.js";
import { saveContest } from "#lib/server/admin.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  requireAdmin(event);
  const c = await contest(event.params.id);
  return {
    contest: c,
    choices: await problemBank(),
    selected: c ? await contestProblems(c.id) : [],
    counts: c
      ? (await one<{ participants: number; submissions: number }>(
          "SELECT (SELECT COUNT(*) FROM contest_participants WHERE contest_id=$1) AS participants,(SELECT COUNT(*) FROM submissions WHERE contest_id=$1) AS submissions",
          [c.id],
        ))!
      : { participants: 0, submissions: 0 },
    origin: event.url.origin,
  };
};
export const actions = {
  default: (event: Parameters<Actions[string]>[0]) =>
    saveContest(event, id(event.params.id)),
};
