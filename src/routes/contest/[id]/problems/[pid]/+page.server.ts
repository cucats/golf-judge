import type { PageServerLoad, Actions } from "./$types";
import { contest, inContest, id, one } from "#lib/server/db.js";
import { problemAccess } from "#lib/server/auth.js";
import { markdown } from "#lib/markdown.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  const c = await contest(event.params.id);
  problemAccess(c, event);
  const p = await inContest(c.id, id(event.params.pid));
  const best = event.locals.user
    ? await one<{ bytes: number | null }>(
        "SELECT MIN(code_length) AS bytes FROM submissions WHERE contest_id=$1 AND problem_id=$2 AND username=$3 AND verdict='AC'",
        [c.id, p.id, event.locals.user.username],
      )
    : undefined;
  return {
    contest: c,
    problem: {
      id: p.id,
      title: p.title,
      problem_order: p.problem_order,
      time_limit_ms: p.time_limit_ms,
      test_count: p.test_count,
      memory_limit_kb: p.memory_limit_kb,
    },
    publicCases: p.test_cases.flatMap((test, index) =>
      test.public
        ? [{ case: index + 1, input: test.input, output: test.output }]
        : [],
    ),
    html: markdown(p.statement),
    bestBytes: best?.bytes ?? null,
  };
};
