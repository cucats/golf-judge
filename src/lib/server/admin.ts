import type { RequestEvent } from "@sveltejs/kit";
import { fail, redirect } from "@sveltejs/kit";
import { requireAdmin } from "./auth.js";
import { pool, problem, query, one } from "./db.js";
import type { Contest, Problem } from "#lib/types.js";
import { normalize, now } from "#lib/types.js";
export const defaultProblem: Problem = {
  id: 0,
  title: "",
  statement: "",
  test_input: "",
  test_output: "",
  grader: `from submission import f\n\n__t = int(input())\nfor __i in range(__t):\n    __s = input()\n    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {__s!r}\\n")\n    print(f(__s))\n`,
  time_limit_ms: 1000,
  memory_limit_kb: 262144,
  public_test_count: 0,
  result_mode: "value",
};
export const usage = (pid: number) =>
  query<Contest>(
    "SELECT c.* FROM contests c JOIN contest_problems cp ON cp.contest_id=c.id WHERE cp.problem_id=$1 ORDER BY c.created_at DESC",
    [pid],
  );
export async function saveProblem(event: RequestEvent, pid = 0) {
  requireAdmin(event);
  if (pid) await problem(pid);
  const f = await event.request.formData();
  const text = (key: string) => normalize(String(f.get(key) ?? ""));
  const p: Problem = {
    id: pid,
    title: text("title").trim(),
    statement: text("statement"),
    test_input: text("test_input"),
    test_output: text("test_output"),
    grader: text("grader"),
    time_limit_ms: Number(text("time_limit_ms")),
    memory_limit_kb: Number(text("memory_limit_mb")) * 1024,
    public_test_count: Number(text("public_test_count")),
    result_mode: text("result_mode") as Problem["result_mode"],
  };
  let message = "";
  if (!p.title) message = "Title is required";
  else if (
    !Number.isInteger(p.public_test_count) ||
    p.public_test_count < 0 ||
    p.public_test_count >
      (p.test_output.trim() ? p.test_output.trim().split(/\r?\n/).length : 0)
  )
    message =
      "Public test count must be between 0 and the number of expected output lines";
  else if (p.result_mode !== "value" && p.result_mode !== "truthy")
    message = "Choose a return value mode";
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
    p.test_input,
    p.test_output,
    p.grader,
    p.time_limit_ms,
    p.memory_limit_kb,
    now(),
    p.public_test_count,
    p.result_mode,
  ];
  if (pid)
    await query(
      "UPDATE problems SET title=$1,statement=$2,test_input=$3,test_output=$4,grader=$5,time_limit_ms=$6,memory_limit_kb=$7,updated_at=$8,public_test_count=$9,result_mode=$10 WHERE id=$11",
      [...values, pid],
    );
  else
    pid = (await one<{ id: number }>(
      "INSERT INTO problems (title,statement,test_input,test_output,grader,time_limit_ms,memory_limit_kb,created_at,updated_at,public_test_count,result_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) RETURNING id",
      values,
    ))!.id;
  redirect(303, `/admin/problems/${pid}?saved=1`);
}
export async function saveContest(event: RequestEvent, cid = 0) {
  requireAdmin(event);
  const f = await event.request.formData(),
    name = String(f.get("name") ?? "").trim(),
    duration = String(f.get("duration") ?? "").trim();
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
  if (message) return fail(400, { error: message, name, duration, problemIds });
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    let pending = true;
    if (cid) {
      const c = (
        await tx.query<Contest>(
          "SELECT * FROM contests WHERE id=$1 FOR UPDATE",
          [cid],
        )
      ).rows[0];
      if (!c) throw new Error("Contest not found");
      pending = c.status === "pending";
      await tx.query("UPDATE contests SET name=$1,duration=$2 WHERE id=$3", [
        name,
        Number(duration) * 60,
        cid,
      ]);
    } else
      cid = (
        await tx.query<{ id: number }>(
          "INSERT INTO contests (name,duration,status,created_at) VALUES ($1,$2,'pending',$3) RETURNING id",
          [name, Number(duration) * 60, now()],
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
