import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { contest } from '#lib/server/db.js';
import { leaderboard } from '#lib/server/leaderboard.js';
import { ended } from '#lib/types.js';
export const load = async (event: Parameters<PageServerLoad>[0]) => {
	const c = await contest(event.params.id);
	if (c.status === 'pending' && !event.locals.user?.is_admin)
		redirect(303, `/contest/${c.id}/join`);
	return {
		contest: c,
		board: await leaderboard(c.id),
		inspect: ended(c) || !!event.locals.user?.is_admin
	};
};
