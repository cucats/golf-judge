import type { PageServerLoad, Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { contest } from "#lib/server/db.js";
import { verifyPassword } from "#lib/server/auth.js";
import {
  contestNext,
  contestPassword,
  grantContestAccess,
  hasContestAccess,
} from "#lib/server/contest-access.js";

export const load: PageServerLoad = async (event) => {
  const c = await contest(event.params.id);
  const next = contestNext(c.id, event.url.searchParams.get("next"));
  const hash = (await contestPassword(c.id))?.password_hash;
  if (!hash || hasContestAccess(event, c.id, hash)) redirect(303, next);
  return { name: c.name, next };
};

export const actions = {
  default: async (event: Parameters<Actions[string]>[0]) => {
    const c = await contest(event.params.id);
    const form = await event.request.formData();
    const next = contestNext(c.id, String(form.get("next") ?? ""));
    const hash = (await contestPassword(c.id))?.password_hash;
    if (!hash || hasContestAccess(event, c.id, hash)) redirect(303, next);
    if (!(await verifyPassword(hash, String(form.get("password") ?? ""))))
      return fail(400, { error: "Incorrect contest password", next });
    grantContestAccess(event, c.id, hash);
    redirect(303, next);
  },
};
