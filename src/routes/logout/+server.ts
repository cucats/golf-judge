import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { logout } from '#lib/server/auth.js';
export const POST = (event: Parameters<RequestHandler>[0]) => {
	logout(event);
	redirect(303, '/');
};
