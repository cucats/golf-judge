import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { contest } from "#lib/server/db.js";
import { submissions } from "#lib/server/submissions.js";
export const GET = async (event: Parameters<RequestHandler>[0]) => {
  if (!event.locals.user?.is_admin) error(401, "Admin login required");
  const c = await contest(event.params.id);
  return Response.json(await submissions(c.id, event.url.searchParams));
};
