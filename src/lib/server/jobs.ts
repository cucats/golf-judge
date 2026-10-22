import { randomBytes } from "node:crypto";
import type { JudgeProgress, JudgeResult, Problem } from "#lib/types.js";
import { now } from "#lib/types.js";
import { pool, one, query } from "./db.js";
import { judge, workers } from "./runner.js";

interface Job {
  id: string;
  username: string;
  submission_id: string | null;
  code: string;
  problem_snapshot: Problem;
  lease_token: string;
}

export async function enqueue(
  username: string,
  problem: Problem,
  code: string,
  contestId?: number,
): Promise<Response> {
  const tx = await pool.connect();
  const jobId = randomBytes(16).toString("base64url");
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(1730162401)");
    const {
      rows: [counts],
    } = await tx.query<{
      active: number;
      recent: number;
      total: number;
    }>(
      `SELECT
      COUNT(*) FILTER (WHERE username=$1 AND state<>'finished')::int AS active,
      COUNT(*) FILTER (WHERE username=$1 AND created_at>$2-60)::int AS recent,
      COUNT(*) FILTER (WHERE state<>'finished')::int AS total
      FROM judge_jobs WHERE state<>'finished' OR (username=$1 AND created_at>$2-60)`,
      [username, now()],
    );
    const message =
      counts.active >= 2
        ? "You already have two submissions being graded"
        : counts.recent >= 10
          ? "Too many submissions. Please wait a minute."
          : counts.total >= workers * 4
            ? "The judge is busy. Please try again shortly."
            : null;
    if (message) {
      await tx.query("ROLLBACK");
      return Response.json({ error: message }, { status: 429 });
    }
    if (contestId !== undefined) {
      // Admission and recording share a transaction, including the contest deadline.
      const {
        rows: [contest],
      } = await tx.query(
        `SELECT id FROM contests
        WHERE id=$1 AND status='active' AND (duration=0 OR $2<start_time+duration)
        FOR SHARE`,
        [contestId, now()],
      );
      if (!contest) {
        await tx.query("ROLLBACK");
        return Response.json(
          { error: "Contest is not accepting submissions" },
          { status: 400 },
        );
      }
      await tx.query(
        "INSERT INTO contest_participants (contest_id,username,joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [contestId, username, now()],
      );
      await tx.query(
        "INSERT INTO submissions (id,username,contest_id,problem_id,verdict,code_length,time,code,created_at) VALUES ($1,$2,$3,$4,'QUEUED',$5,0,$6,$7)",
        [
          jobId,
          username,
          contestId,
          problem.id,
          Buffer.byteLength(code),
          code,
          now(),
        ],
      );
    }
    await tx.query(
      "INSERT INTO judge_jobs (id,username,problem_id,submission_id,code,problem_snapshot,total,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        jobId,
        username,
        problem.id,
        contestId === undefined ? null : jobId,
        code,
        JSON.stringify(problem),
        problem.test_count,
        now(),
      ],
    );
    await tx.query("COMMIT");
  } catch (err) {
    await tx.query("ROLLBACK");
    throw err;
  } finally {
    tx.release();
  }
  startJudgeWorkers();
  void drain();
  return Response.json(
    { id: jobId, events: `/api/judge/${jobId}/events` },
    { status: 202 },
  );
}

export async function jobProgress(
  jobId: string,
  username: string,
): Promise<JudgeProgress | undefined> {
  // Never select the private problem snapshot or another user's code for the feed.
  const row = await one<JudgeProgress & { result: JudgeResult | null }>(
    "SELECT state,passed,completed,total,result FROM judge_jobs WHERE id=$1 AND username=$2",
    [jobId, username],
  );
  if (!row) return;
  return {
    state: row.state,
    passed: row.passed,
    completed: row.completed,
    total: row.total,
    ...(row.result ? { result: row.result } : {}),
  };
}

const active = new Set<Promise<void>>();
let timer: ReturnType<typeof setInterval> | undefined;
let draining = false;
let drainCompletion = Promise.resolve();
let stopped = false;

async function finish(job: Job, result: JudgeResult) {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    // Serialize completions for a user so simultaneous accepted results have correct best deltas.
    await tx.query("SELECT username FROM users WHERE username=$1 FOR UPDATE", [
      job.username,
    ]);
    const {
      rows: [owned],
    } = await tx.query(
      "SELECT id FROM judge_jobs WHERE id=$1 AND lease_token=$2 AND state='running' FOR UPDATE",
      [job.id, job.lease_token],
    );
    if (!owned) {
      await tx.query("ROLLBACK");
      return;
    }
    if (job.submission_id) {
      const {
        rows: [best],
      } = await tx.query<{ bytes: number | null }>(
        `SELECT MIN(code_length) AS bytes FROM submissions WHERE verdict='AC'
         AND username=$1 AND problem_id=$2 AND contest_id=(SELECT contest_id FROM submissions WHERE id=$3)`,
        [job.username, job.problem_snapshot.id, job.submission_id],
      );
      if (result.verdict === "AC")
        result.improvement =
          best.bytes === null
            ? null
            : Math.max(0, best.bytes - result.code_length);
      await tx.query("UPDATE submissions SET verdict=$1,time=$2 WHERE id=$3", [
        result.verdict,
        result.time,
        job.submission_id,
      ]);
    }
    await tx.query(
      "UPDATE judge_jobs SET state='finished',result=$1,passed=$2,completed=$3,total=$4,finished_at=$5,lease_until=NULL,lease_token=NULL WHERE id=$6",
      [
        JSON.stringify(result),
        result.passed ?? 0,
        result.completed ?? 0,
        result.total ?? 0,
        now(),
        job.id,
      ],
    );
    await tx.query("COMMIT");
  } catch (err) {
    await tx.query("ROLLBACK");
    throw err;
  } finally {
    tx.release();
  }
}

async function run(job: Job) {
  const heartbeat = setInterval(() => {
    void query(
      "UPDATE judge_jobs SET lease_until=$1 WHERE id=$2 AND lease_token=$3 AND state='running'",
      [now() + 15, job.id, job.lease_token],
    ).catch((err) => console.error("Judge heartbeat failed", err));
  }, 5000);
  try {
    if (job.submission_id)
      await query(
        "UPDATE submissions SET verdict='RUNNING' WHERE id=$1 AND verdict IN ('QUEUED','RUNNING')",
        [job.submission_id],
      );
    const result = await judge(
      job.problem_snapshot,
      job.code,
      async (progress) => {
        await query(
          "UPDATE judge_jobs SET passed=$1,completed=$2,total=$3 WHERE id=$4 AND lease_token=$5 AND state='running'",
          [
            progress.passed,
            progress.completed,
            progress.total,
            job.id,
            job.lease_token,
          ],
        ).catch((err) => console.error("Judge progress unavailable", err));
      },
    );
    await finish(job, result);
  } finally {
    clearInterval(heartbeat);
    // A failed database operation leaves a recoverable lease, never an unrecorded submission.
  }
}

async function drain() {
  if (draining || stopped) return;
  draining = true;
  let drained!: () => void;
  drainCompletion = new Promise<void>((resolve) => {
    drained = resolve;
  });
  try {
    while (!stopped && active.size < workers) {
      const token = randomBytes(16).toString("base64url");
      const job = await one<Job>(
        `WITH next AS (
        SELECT id FROM judge_jobs WHERE state='queued' OR (state='running' AND lease_until<$1)
        ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE judge_jobs j SET state='running',passed=0,completed=0,lease_token=$2,lease_until=$1+15
        FROM next WHERE j.id=next.id RETURNING j.*`,
        [now(), token],
      );
      if (!job) break;
      const task = run(job)
        .catch((err) => console.error("Judge job failed; will retry", err))
        .finally(() => {
          active.delete(task);
        });
      active.add(task);
    }
  } catch (err) {
    console.error("Judge queue unavailable", err);
  } finally {
    draining = false;
    drained();
  }
}

export function startJudgeWorkers() {
  if (timer || stopped) return;
  timer = setInterval(() => {
    void drain();
  }, 250);
  timer.unref();
  void drain();
}

export async function stopJudgeWorkers() {
  stopped = true;
  clearInterval(timer);
  await drainCompletion;
  await Promise.allSettled([...active]);
}
