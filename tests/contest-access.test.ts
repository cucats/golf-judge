import { expect, test } from "bun:test";
import type { RequestEvent } from "@sveltejs/kit";
import {
  contestNext,
  grantContestAccess,
  hasContestAccess,
} from "../src/lib/server/contest-access";

function browser() {
  const cookies = new Map<string, string>();
  const event = {
    locals: { user: null },
    cookies: {
      get: (key: string) => cookies.get(key),
      set: (key: string, value: string) => cookies.set(key, value),
    },
  } as unknown as RequestEvent;
  return { cookies, event };
}

test("contest access requires a grant and rejects modified cookies", () => {
  const { cookies, event } = browser();
  expect(hasContestAccess(event, 1, "password-hash")).toBe(false);
  grantContestAccess(event, 1, "password-hash");
  expect(hasContestAccess(event, 1, "password-hash")).toBe(true);
  const token = cookies.get("golf_contest_1")!;
  cookies.set(
    "golf_contest_1",
    `${token[0] === "x" ? "y" : "x"}${token.slice(1)}`,
  );
  expect(hasContestAccess(event, 1, "password-hash")).toBe(false);
  cookies.set("golf_contest_1", "invalid");
  expect(hasContestAccess(event, 1, "password-hash")).toBe(false);
});

test("grants do not transfer between contests or survive a password change", () => {
  const { cookies, event } = browser();
  grantContestAccess(event, 1, "password-hash");
  cookies.set("golf_contest_2", cookies.get("golf_contest_1")!);
  expect(hasContestAccess(event, 2, "password-hash")).toBe(false);
  expect(hasContestAccess(event, 1, "new-password-hash")).toBe(false);
});

test("admins can access private contests without a grant", () => {
  const { event } = browser();
  event.locals.user = { username: "admin", is_admin: true };
  expect(hasContestAccess(event, 1, "password-hash")).toBe(true);
  event.locals.user.is_admin = false;
  expect(hasContestAccess(event, 1, "password-hash")).toBe(false);
});

test("unlock redirects stay within the same contest and avoid unlock loops", () => {
  const fallback = "/contest/1/join";
  for (const next of [
    null,
    "https://example.com",
    "//example.com",
    "/admin",
    "/contest/10/problems",
    "/contest/2/problems",
    "/contest/1/../2/problems",
    "/contest/1/%2e%2e/2/problems",
    "/contest/1/unlock?next=/contest/1/problems",
    "/contest/1/unlock/",
  ])
    expect(contestNext(1, next)).toBe(fallback);
  const next = "/contest/1/submissions?user=player&problem=2";
  expect(contestNext(1, next)).toBe(next);
});
