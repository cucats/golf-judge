import type { PageServerLoad } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { query } from "#lib/server/db.js";
import type { User } from "#lib/types.js";

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  return {
    users: await query<User & { created_at: number }>(
      "SELECT username,is_admin,created_at FROM users ORDER BY lower(username),username",
    ),
  };
};
