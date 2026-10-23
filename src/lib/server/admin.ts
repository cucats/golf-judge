import type { RequestEvent } from "@sveltejs/kit";
import { fail, redirect } from "@sveltejs/kit";
import { hashPassword, requireAdmin } from "./auth.js";
import { contestFields, pool, problem, query, one } from "./db.js";
import type { Contest, Problem } from "#lib/types.js";
import { normalize, now } from "#lib/types.js";
export const defaultProblem: Problem = {
  id: 0,
  title: "",
  statement: "",
  test_cases: [],
  test_count: 0,
  grader: `from submission import f\n\nprint(f(input()))\n`,
  solution: "",
  time_limit_ms: 1000,
  memory_limit_kb: 262144,
};
export const usage = (pid: number) =>
  query<Contest>(
    `SELECT ${contestFields} FROM contests c JOIN contest_problems cp ON cp.contest_id=c.id WHERE cp.problem_id=$1 ORDER BY c.created_at DESC`,
    [pid],
  );
export async function saveProblem(event: RequestEvent, pid = 0) {
  requireAdmin(event);
  if (pid) await problem(pid);
  const f = await event.request.formData();
  const text = (key: string) => normalize(String(f.get(key) ?? ""));
  let tests: unknown;
  try {
    tests = JSON.parse(text("test_cases"));
  } catch {
    tests = null;
  }
  const validTests =
    Array.isArray(tests) &&
    tests.every(
      (test) =>
        test &&
        typeof test === "object" &&
        typeof test.input === "string" &&
        typeof test.output === "string" &&
        typeof test.public === "boolean",
    );
  const p: Problem = {
    id: pid,
    title: text("title").trim(),
    statement: text("statement"),
    test_cases: validTests
      ? (tests as Problem["test_cases"]).map((test) => ({
          input: normalize(test.input),
          output: normalize(test.output),
          public: test.public,
        }))
      : [],
    test_count: validTests ? (tests as unknown[]).length : 0,
    grader: text("grader"),
    solution: text("solution"),
    time_limit_ms: Number(text("time_limit_ms")),
    memory_limit_kb: Number(text("memory_limit_mb")) * 1024,
  };
  let message = "";
  if (!p.title) message = "Title is required";
  else if (!validTests)
    message = "Tests must be input/output pairs with an explicit visibility";
  else if (Buffer.byteLength(p.solution) > 10240)
    message = "Solution must be at most 10240 bytes";
  else if ([...p.title].length > 200)
    message = "Title must be at most 200 characters";
  else if (
    !Number.isInteger(p.time_limit_ms) ||
    p.time_limit_ms < 100 ||
    p.time_limit_ms > 10000
  )
    message = "Time limit must be between 100 and 10000 ms";
  else if (
    !Number.isInteger(p.memory_limit_kb / 1024) ||
    p.memory_limit_kb < 16384 ||
    p.memory_limit_kb > 1048576
  )
    message = "Memory limit must be between 16 and 1024 MB";
  if (message) return fail(400, { error: message, problem: p });
  const values = [
    p.title,
    p.statement,
    JSON.stringify(p.test_cases),
    p.grader,
    p.time_limit_ms,
    p.memory_limit_kb,
    now(),
    p.solution,
  ];
  if (pid)
    await query(
      "UPDATE problems SET title=$1,statement=$2,test_cases=$3,grader=$4,time_limit_ms=$5,memory_limit_kb=$6,updated_at=$7,solution=$8 WHERE id=$9",
      [...values, pid],
    );
  else
    pid = (await one<{ id: number }>(
      "INSERT INTO problems (title,statement,test_cases,grader,time_limit_ms,memory_limit_kb,created_at,updated_at,solution) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING id",
      values,
    ))!.id;
  redirect(303, `/admin/problems/${pid}?saved=1`);
}
export async function saveContest(event: RequestEvent, cid = 0) {
  requireAdmin(event);
  const f = await event.request.formData(),
    name = String(f.get("name") ?? "").trim(),
    duration = String(f.get("duration") ?? "").trim(),
    visibility = String(f.get("visibility") ?? ""),
    password = String(f.get("contest_password") ?? "");
  const values = f.getAll("problem_ids");
  const problemIds = values.map(Number);
  let message = "";
  if (
    values.some(
      (v, i) =>
        typeof v !== "string" ||
        !/^\d+$/.test(v) ||
        problemIds[i] < 1 ||
        problemIds[i] > 2147483647,
    )
  )
    message = "Invalid problem selection";
  else if (new Set(problemIds).size !== problemIds.length)
    message = "A problem can only be added once";
  if (!name) message = "Contest name is required";
  else if ([...name].length > 100)
    message = "Contest name must be at most 100 characters";
  else if (!/^\d+$/.test(duration))
    message = "Duration must be a whole number of minutes, 0 or more";
  else if (Number(duration) * 60 > 2147483647)
    message = "Duration is too large";
  else if (visibility !== "public" && visibility !== "private")
    message = "Invalid visibility";
  if (message)
    return fail(400, {
      error: message,
      name,
      duration,
      problemIds,
      visibility,
    });
  const passwordHash =
    visibility === "private" && password ? await hashPassword(password) : null;
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    let pending = true;
    if (cid) {
      const c = (
        await tx.query<Contest & { password_hash: string | null }>(
          "SELECT * FROM contests WHERE id=$1 FOR UPDATE",
          [cid],
        )
      ).rows[0];
      if (!c) throw new Error("Contest not found");
      pending = c.status === "pending";
      const savedHash =
        visibility === "private" ? (passwordHash ?? c.password_hash) : null;
      if (visibility === "private" && !savedHash) {
        await tx.query("ROLLBACK");
        return fail(400, {
          error: "A password is required for a private contest",
          name,
          duration,
          problemIds,
          visibility,
        });
      }
      await tx.query(
        "UPDATE contests SET name=$1,duration=$2,password_hash=$4 WHERE id=$3",
        [name, Number(duration) * 60, cid, savedHash],
      );
    } else if (visibility === "private" && !passwordHash) {
      await tx.query("ROLLBACK");
      return fail(400, {
        error: "A password is required for a private contest",
        name,
        duration,
        problemIds,
        visibility,
      });
    } else
      cid = (
        await tx.query<{ id: number }>(
          "INSERT INTO contests (name,duration,status,created_at,password_hash) VALUES ($1,$2,'pending',$3,$4) RETURNING id",
          [name, Number(duration) * 60, now(), passwordHash],
        )
      ).rows[0].id;
    if (pending) {
      const existing = await tx.query<{ id: number }>(
        "SELECT id FROM problems WHERE id=ANY($1::int[]) FOR KEY SHARE",
        [problemIds],
      );
      if (existing.rows.length !== problemIds.length) {
        await tx.query("ROLLBACK");
        return fail(400, {
          error: "A selected problem no longer exists",
          name,
          duration,
          problemIds,
          visibility,
        });
      }
      await tx.query("DELETE FROM contest_problems WHERE contest_id=$1", [cid]);
      for (const [i, pid] of problemIds.entries())
        await tx.query(
          "INSERT INTO contest_problems (contest_id,problem_id,problem_order) VALUES ($1,$2,$3)",
          [cid, pid, i],
        );
    }
    await tx.query("COMMIT");
  } catch (err) {
    await tx.query("ROLLBACK");
    throw err;
  } finally {
    tx.release();
  }
  redirect(303, `/admin/contests/${cid}`);
}
