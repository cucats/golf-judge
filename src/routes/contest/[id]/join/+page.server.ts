import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { contest, participate } from '#lib/server/db.js';
import { requireUser } from '#lib/server/auth.js';
import { ended } from '#lib/types.js';
export const load = async (event: Parameters<PageServerLoad>[0]) => {
	const c = await contest(event.params.id);
	if (ended(c)) redirect(303, `/contest/${c.id}/leaderboard`);
	const user = requireUser(event);
	await participate(c.id, user.username);
	redirect(303, `/contest/${c.id}/${c.status === 'pending' ? 'waiting' : 'problems'}`);
};
