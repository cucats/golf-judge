import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '#lib/server/auth.js';
import { query, one } from '#lib/server/db.js';
import type { Contest } from '#lib/types.js';
export const load = async (event: Parameters<PageServerLoad>[0]) => {
	requireAdmin(event);
	return {
		contests: await query<
			Contest & { problem_count: number; participant_count: number; submission_count: number }
		>(
			`SELECT c.*,(SELECT COUNT(*) FROM contest_problems WHERE contest_id=c.id) AS problem_count,(SELECT COUNT(*) FROM contest_participants WHERE contest_id=c.id) AS participant_count,(SELECT COUNT(*) FROM submissions WHERE contest_id=c.id) AS submission_count FROM contests c ORDER BY created_at DESC`
		),
		bankSize: (await one<{ count: number }>('SELECT COUNT(*) FROM problems'))!.count
	};
};
