import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth.js';
import { problem, query, one } from '#lib/server/db.js';
export const POST = async (event: Parameters<RequestHandler>[0]) => {
	requireAdmin(event);
	const p = await problem(event.params.pid);
	const used = (await one<{ used: boolean }>(
		'SELECT EXISTS(SELECT 1 FROM contest_problems WHERE problem_id=$1) OR EXISTS(SELECT 1 FROM submissions WHERE problem_id=$1) AS used',
		[p.id]
	))!;
	if (used.used) redirect(303, '/admin/problems?in-use=1');
	try {
		await query('DELETE FROM problems WHERE id=$1', [p.id]);
	} catch (err) {
		if ((err as { code?: string }).code === '23503') redirect(303, '/admin/problems?in-use=1');
		throw err;
	}
	redirect(303, '/admin/problems');
};
