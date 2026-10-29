import type { PageServerLoad } from "./$types";
import { requireAdmin } from "#lib/server/auth.js";
import { query } from "#lib/server/db.js";
import { now } from "#lib/types.js";

export const load = async (event: Parameters<PageServerLoad>[0]) => {
  requireAdmin(event);
  const jobs = await query<{
    id: string;
    username: string;
    problem_id: number;
    problem_title: string;
    contest_id: number | null;
    contest_name: string | null;
    state: "queued" | "running";
    completed: number;
    total: number;
    created_at: number;
    lease_until: number | null;
  }>(`SELECT j.id,j.username,j.problem_id,p.title AS problem_title,
      s.contest_id,c.name AS contest_name,j.state,j.completed,j.total,
      j.created_at,j.lease_until
    FROM judge_jobs j
    JOIN problems p ON p.id=j.problem_id
    LEFT JOIN submissions s ON s.id=j.submission_id
    LEFT JOIN contests c ON c.id=s.contest_id
    WHERE j.state<>'finished'
    ORDER BY j.created_at,j.id`);
  return { jobs, now: now() };
};
