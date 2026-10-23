import type { PageServerLoad, Actions } from "./$types";
import { contestFields, query } from "#lib/server/db.js";
import type { Contest } from "#lib/types.js";
export const load = async () => ({
  contests: await query<Contest>(
    `SELECT ${contestFields} FROM contests c WHERE c.password_hash IS NULL ORDER BY COALESCE(c.start_time,c.created_at) DESC`,
  ),
});
