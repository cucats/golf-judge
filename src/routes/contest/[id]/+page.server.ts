import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
export const load = ({ params }: Parameters<PageServerLoad>[0]) =>
  redirect(303, `/contest/${params.id}/join`);
