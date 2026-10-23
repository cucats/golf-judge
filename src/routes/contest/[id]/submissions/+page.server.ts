import type { PageServerLoad, Actions } from "./$types";
import { error } from "@sveltejs/kit";
import { contest, query } from "#lib/server/db.js";
import { requireUser } from "#lib/server/auth.js";
import { leaderboard } from "#lib/server/leaderboard.js";
import type { Submission } from "#lib/types.js";
export const load = async (event: Parameters<PageServerLoad>[0]) => {
  const viewer = requireUser(event);
  const user = event.url.searchParams.get("user");
  if (!viewer.is_admin && viewer.username !== user)
    error(403, "You can only view your own submissions");
  const c = await contest(event.params.id);
  const board = await leaderboard(c.id);
  const entry =
    board.entries.find((e) => e.username === user) ??
    (user === viewer.username
      ? {
          username: viewer.username,
          rank: 0,
          problems_solved: 0,
          total_bytes: 0,
          problem_results: board.problems.map(() => null),
        }
      : undefined);
  if (!entry) error(404, "Player not found");
  const submissions = await query<Submission>(
    "SELECT * FROM submissions WHERE contest_id=$1 AND username=$2 ORDER BY created_at,id",
    [c.id, user],
  );
  return {
    contest: c,
    entry,
    playerCount: board.entries.length,
    problems: board.problems,
    submissions,
    selected: Number(event.url.searchParams.get("problem")) || null,
  };
};
