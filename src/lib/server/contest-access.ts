import { createHmac, timingSafeEqual } from "node:crypto";
import { redirect, type RequestEvent } from "@sveltejs/kit";
import { id, one } from "./db.js";
import { safeNext } from "./auth.js";

const cookieName = (cid: number) => `golf_contest_${cid}`;
const accessToken = (cid: number, hash: string) =>
  createHmac("sha256", hash)
    .update(`contest-access:${cid}`)
    .digest("base64url");

export function hasContestAccess(
  event: RequestEvent,
  cid: number,
  hash: string,
) {
  if (event.locals.user?.is_admin) return true;
  const actual = Buffer.from(event.cookies.get(cookieName(cid)) ?? "");
  const expected = Buffer.from(accessToken(cid, hash));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function grantContestAccess(
  event: RequestEvent,
  cid: number,
  hash: string,
) {
  event.cookies.set(cookieName(cid), accessToken(cid, hash), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.INSECURE_COOKIES === undefined,
    maxAge: 30 * 86400,
  });
}

export const contestPassword = (cid: number) =>
  one<{ password_hash: string | null }>(
    "SELECT password_hash FROM contests WHERE id=$1",
    [cid],
  );

export function contestNext(cid: number, value: string | null) {
  const next = new URL(safeNext(value), "https://contest.invalid");
  const path = next.pathname;
  return (path === `/contest/${cid}` || path.startsWith(`/contest/${cid}/`)) &&
    path.replace(/\/$/, "") !== `/contest/${cid}/unlock`
    ? path + next.search
    : `/contest/${cid}/join`;
}

export async function gateContest(event: RequestEvent) {
  const route = event.route.id ?? "";
  if (event.locals.user?.is_admin) return;
  let cid: number;
  let hash: string | null | undefined;
  if (route === "/api/judge/[id]/events" && event.locals.user) {
    const c = await one<{ id: number; password_hash: string | null }>(
      "SELECT c.id,c.password_hash FROM judge_jobs j JOIN submissions s ON s.id=j.submission_id JOIN contests c ON c.id=s.contest_id WHERE j.id=$1 AND j.username=$2",
      [event.params.id, event.locals.user.username],
    );
    if (!c) return;
    cid = c.id;
    hash = c.password_hash;
  } else if (
    route.startsWith("/contest/[id]") ||
    route.startsWith("/api/contest/[id]")
  ) {
    cid = id(event.params.id);
    hash = (await contestPassword(cid))?.password_hash;
  } else return;
  if (!hash) return;
  event.setHeaders({ "cache-control": "private, no-store" });
  if (route === "/contest/[id]/unlock" || hasContestAccess(event, cid, hash))
    return;
  if (route.startsWith("/api/") || event.request.method !== "GET")
    return Response.json(
      { error: "Contest password required" },
      { status: 403 },
    );
  const next = contestNext(cid, event.url.pathname + event.url.search);
  redirect(303, `/contest/${cid}/unlock?next=${encodeURIComponent(next)}`);
}
