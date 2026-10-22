import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { contest, contestProblems } from '#lib/server/db.js';
import { requireUser } from '#lib/server/auth.js';
export const load = async (event: Parameters<PageServerLoad>[0]) => {
	const c = await contest(event.params.id);
	if (c.status !== 'pending') redirect(303, `/contest/${c.id}/problems`);
	requireUser(event);
	return { contest: c, problemCount: (await contestProblems(c.id)).length };
};
