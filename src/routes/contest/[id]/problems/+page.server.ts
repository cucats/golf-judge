import type { PageServerLoad, Actions } from "./$types";
import { contest, contestProblems, query } from "#lib/server/db.js";
import { problemAccess } from "#lib/server/auth.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  const c = await contest(event.params.id);
  problemAccess(c, event);
  const progress = event.locals.user
    ? await query<{
        problem_id: number;
        best_bytes: number | null;
        attempts: number;
      }>(
        "SELECT problem_id,MIN(code_length) FILTER (WHERE verdict='AC') AS best_bytes,COUNT(*) FILTER (WHERE verdict<>'SE') AS attempts FROM submissions WHERE contest_id=$1 AND username=$2 GROUP BY problem_id",
        [c.id, event.locals.user.username],
      )
    : [];
  return {
    contest: c,
    problems: (await contestProblems(c.id)).map((p) => ({
      ...p,
      best_bytes:
        progress.find((s) => s.problem_id === p.id)?.best_bytes ?? null,
      attempts: progress.find((s) => s.problem_id === p.id)?.attempts ?? 0,
    })),
  };
};
