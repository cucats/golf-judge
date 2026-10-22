import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { contest } from "#lib/server/db.js";
import { leaderboard } from "#lib/server/leaderboard.js";
export const GET = async (event: Parameters<RequestHandler>[0]) => {
  const c = await contest(event.params.id);
  if (c.status === "pending" && !event.locals.user?.is_admin)
    error(404, "Not found");
  return Response.json(await leaderboard(c.id));
};
