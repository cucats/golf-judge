import type { RequestHandler } from "./$types";
import { redirect } from "@sveltejs/kit";
import { requireAdmin } from "#lib/server/auth.js";
import { problem, one } from "#lib/server/db.js";
import { now } from "#lib/types.js";
export const POST = async (event: Parameters<RequestHandler>[0]) => {
  requireAdmin(event);
  const p = await problem(event.params.pid);
  const row = (await one<{ id: number }>(
    "INSERT INTO problems (title,statement,test_input,test_output,grader,time_limit_ms,memory_limit_kb,created_at,updated_at) SELECT title || ' (copy)',statement,test_input,test_output,grader,time_limit_ms,memory_limit_kb,$2,$2 FROM problems WHERE id=$1 RETURNING id",
    [p.id, now()],
  ))!;
  redirect(303, `/admin/problems/${row.id}`);
};
