import type { PageServerLoad, Actions } from "./$types";
import { query } from "#lib/server/db.js";
import type { Contest } from "#lib/types.js";
export const load = async () => ({
  contests: await query<Contest>(
    "SELECT * FROM contests ORDER BY COALESCE(start_time,created_at) DESC",
  ),
});
