import type { PageServerLoad, Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { authenticate, login, safeNext } from "#lib/server/auth.js";
import { normalizeEmail, validEmail } from "#lib/server/email.js";
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
    const email = normalizeEmail(String(f.get("email") ?? ""));
    if (email && !validEmail(email))
      return fail(400, { error: "Invalid email", username, email, next });
    const message = await authenticate(
      username,
      String(f.get("password") ?? ""),
      email || null,
    );
    if (message) return fail(400, { error: message, username, email, next });
    await login(event, username);
    redirect(303, next);
  },
};
