import type { LayoutServerLoad } from './$types';
export const load = ({ locals }: Parameters<LayoutServerLoad>[0]) => ({ user: locals.user });
