import type { PageServerLoad, Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { authenticate, login, safeNext } from "#lib/server/auth.js";
export const load = ({ url, locals }: Parameters<PageServerLoad>[0]) => {
  const next = safeNext(url.searchParams.get("next"));
  if (locals.user) redirect(303, next);
  return { next };
};
export const actions = {
  default: async (event: Parameters<Actions[string]>[0]) => {
    const f = await event.request.formData();
    const username = String(f.get("username") ?? "").trim();
    const next = safeNext(String(f.get("next") ?? "/"));
    const message = await authenticate(
      username,
      String(f.get("password") ?? ""),
    );
    if (message) return fail(400, { error: message, username, next });
    await login(event, username);
    redirect(303, next);
  },
};
