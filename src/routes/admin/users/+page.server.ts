import type { PageServerLoad } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { query } from "#lib/server/db.js";
import type { User } from "#lib/types.js";

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  return {
    users: await query<
      User & {
        created_at: number;
        contest_count: number;
        submission_count: number;
        last_submission_at: number | null;
      }
    >(
      `SELECT u.username,u.is_admin,u.created_at,
        COALESCE(c.contest_count,0) AS contest_count,
        COALESCE(s.submission_count,0) AS submission_count,
        s.last_submission_at
      FROM users u
      LEFT JOIN (
        SELECT username,COUNT(*) AS contest_count
        FROM contest_participants GROUP BY username
      ) c ON c.username=u.username
      LEFT JOIN (
        SELECT username,COUNT(*) AS submission_count,MAX(created_at) AS last_submission_at
        FROM submissions GROUP BY username
      ) s ON s.username=u.username
      ORDER BY lower(u.username),u.username`,
    ),
  };
};
