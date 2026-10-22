import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth.js';
import { contest, query } from '#lib/server/db.js';
import { now } from '#lib/types.js';
export const POST = async (event: Parameters<RequestHandler>[0]) => {
	requireAdmin(event);
	const c = await contest(event.params.id);
	await query("UPDATE contests SET status='ended' WHERE id=$1 AND status='active'", [c.id]);
	redirect(303, `/admin/contests/${c.id}`);
};
