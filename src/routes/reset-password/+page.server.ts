import type { PageServerLoad, Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { login } from "#lib/server/auth.js";
import { normalizeEmail, validEmail, resetMailer } from "#lib/server/email.js";
import {
  completeReset,
  requestReset,
  resetCookie,
  resetLifetime,
  resetStage,
  verifyResetCode,
} from "#lib/server/password-reset.js";

export const load = async (event: Parameters<PageServerLoad>[0]) => ({
  stage: await resetStage(event.cookies.get(resetCookie)),
});

export const actions = {
  send: async (event: Parameters<Actions[string]>[0]) => {
    const form = await event.request.formData();
    const email = normalizeEmail(String(form.get("email") ?? ""));
    if (!validEmail(email))
      return fail(400, { error: "Invalid email", stage: "email" as const });
    let send;
    try {
      send = resetMailer();
    } catch {
      return fail(503, {
        error: "Unable to send code",
        stage: "email" as const,
      });
    }
    const token = await requestReset(email, event.getClientAddress(), send);
    if (!token)
      return fail(429, { error: "Try again later", stage: "email" as const });
    event.cookies.set(resetCookie, token, {
      path: "/reset-password",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.INSECURE_COOKIES === undefined,
      maxAge: resetLifetime,
    });
    redirect(303, "/reset-password");
  },
  verify: async (event: Parameters<Actions[string]>[0]) => {
    const form = await event.request.formData();
    const code = String(form.get("code") ?? "").trim();
    const token = event.cookies.get(resetCookie);
    if (!(await verifyResetCode(token, code)))
      return fail(400, {
        error: "Invalid or expired code",
        stage: await resetStage(token),
      });
    redirect(303, "/reset-password");
  },
  reset: async (event: Parameters<Actions[string]>[0]) => {
    const form = await event.request.formData();
    const password = String(form.get("new_password") ?? "");
    if ([...password].length < 4)
      return fail(400, {
        error: "Choose a password of at least 4 characters",
        stage: "password" as const,
      });
    if (password !== form.get("confirm_password"))
      return fail(400, {
        error: "New passwords do not match",
        stage: "password" as const,
      });
    const username = await completeReset(
      event.cookies.get(resetCookie),
      password,
    );
    if (!username)
      return fail(400, {
        error: "Invalid or expired code",
        stage: "email" as const,
      });
    event.cookies.delete(resetCookie, { path: "/reset-password" });
    await login(event, username);
    redirect(303, "/");
  },
};
