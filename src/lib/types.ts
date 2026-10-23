export interface User {
  username: string;
  is_admin: boolean;
}
export interface Contest {
  id: number;
  name: string;
  duration: number;
  start_time: number | null;
  status: string;
  created_at: number;
  is_private: boolean;
}
export interface TestCase {
  input: string;
  output: string;
  public: boolean;
}
export interface Problem {
  id: number;
  title: string;
  statement: string;
  test_cases: TestCase[];
  test_count: number;
  grader: string;
  solution: string;
  time_limit_ms: number;
  memory_limit_kb: number;
}
export type JudgeProblem = Pick<
  Problem,
  | "id"
  | "grader"
  | "test_cases"
  | "test_count"
  | "time_limit_ms"
  | "memory_limit_kb"
>;
export interface ProblemSummary {
  id: number;
  title: string;
  contest_count: number;
  submission_count: number;
}
export interface ContestProblem {
  id: number;
  title: string;
  problem_order: number;
}
export interface Submission {
  id: string;
  username: string;
  contest_id: number;
  problem_id: number;
  verdict: string;
  code_length: number;
  time: number;
  code: string;
  created_at: number;
}
export interface SubmissionView extends Submission {
  problem_order: number | null;
  problem_title: string;
}
export interface TestCaseResult {
  case: number;
  public: boolean;
  verdict: string;
  input?: string;
  expected?: string;
  actual?: string;
  error?: string;
  line?: number;
  column?: number;
}
export interface JudgeResult {
  verdict: string;
  time: number;
  output: string;
  code_length: number;
  passed?: number;
  completed?: number;
  total?: number;
  cases?: TestCaseResult[];
  failure?: {
    case: number;
    public: boolean;
    input?: string;
    expected?: string;
    actual?: string;
    error?: string;
    line?: number;
    column?: number;
  };
  improvement?: number | null;
}
export interface JudgeProgress {
  state: "queued" | "running" | "finished";
  passed: number;
  completed: number;
  total: number;
  result?: JudgeResult;
}
export interface ProblemResult {
  code_length: number;
  medal: string;
}
export interface Entry {
  username: string;
  rank: number;
  problems_solved: number;
  total_bytes: number;
  problem_results: (ProblemResult | null)[];
}
export interface Board {
  problems: ContestProblem[];
  entries: Entry[];
}
export const now = () => Math.floor(Date.now() / 1000);
export function remaining(c: Contest, at = now()): number | null {
  return c.duration === 0 || c.start_time === null
    ? null
    : Math.max(0, c.start_time + c.duration - at);
}
export const ended = (c: Contest) => c.status === "ended" || remaining(c) === 0;
export const accepting = (c: Contest) => c.status === "active" && !ended(c);
export const durationLabel = (c: Contest) =>
  c.duration === 0 ? "No time limit" : `${c.duration / 60} minutes`;
export function label(order: number): string {
  let result = "";
  let n = Math.max(0, order);
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}
export const normalize = (s: string) => s.replaceAll("\r\n", "\n");
export function elapsed(c: Contest, at: number): string {
  if (c.start_time === null) return "";
  const s = Math.max(0, at - c.start_time);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
