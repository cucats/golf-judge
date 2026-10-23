import type { PageServerLoad, Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { requireAdmin } from "#lib/server/auth.js";
import {
  contest,
  contestProblems,
  problemBank,
  one,
  id,
} from "#lib/server/db.js";
import { saveContest } from "#lib/server/admin.js";
import { now } from "#lib/types.js";
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
  save: (event: Parameters<Actions[string]>[0]) =>
    saveContest(event, id(event.params.id)),
  reopen: async (event: Parameters<Actions[string]>[0]) => {
    requireAdmin(event);
    const c = await contest(event.params.id);
    const reopened = await one<{ id: number }>(
      "UPDATE contests SET status='active' WHERE id=$1 AND status='ended' AND (duration=0 OR $2<start_time+duration) RETURNING id",
      [c.id, now()],
    );
    if (!reopened)
      return fail(400, {
        error:
          c.status === "ended"
            ? "Extend the duration or set it to 0 and save before reopening this contest."
            : "Only ended contests can be reopened.",
      });
    redirect(303, `/admin/contests/${c.id}`);
  },
};
