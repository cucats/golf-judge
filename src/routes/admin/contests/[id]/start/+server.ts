import type { RequestHandler } from "./$types";
import { redirect } from "@sveltejs/kit";
import { requireAdmin } from "#lib/server/auth.js";
import { contest, query } from "#lib/server/db.js";
import { now } from "#lib/types.js";
export const POST = async (event: Parameters<RequestHandler>[0]) => {
  requireAdmin(event);
  const c = await contest(event.params.id);
  await query(
    "UPDATE contests SET status='active',start_time=$2 WHERE id=$1 AND status='pending'",
    [c.id, now()],
  );
  redirect(303, `/admin/contests/${c.id}`);
};
