import { availableParallelism } from "node:os";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { JudgeResult, Problem } from "#lib/types.js";
const exec = promisify(execFile);
const configured = Number(process.env.JUDGE_WORKERS);
export const workers =
  Number.isInteger(configured) && configured > 0
    ? configured
    : availableParallelism();
const free = Array.from({ length: workers }, (_, i) => i);
const waiting: ((box: number) => void)[] = [];
async function acquire(): Promise<number> {
  const box = free.pop();
  if (box !== undefined) return box;
  return new Promise((resolve) => waiting.push(resolve));
}
function release(box: number) {
  const next = waiting.shift();
  if (next) next(box);
  else free.push(box);
}
const cap = 1 << 20;
const isolate = (box: number, action: string) =>
  exec("isolate", ["--box-id", String(box), action], { maxBuffer: cap });
const lines = (s: string) =>
  s.trim()
    ? s
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
    : [];
function truncate(s: string, limit = 4096): string {
  if (Buffer.byteLength(s) <= limit) return s;
  let result = "";
  let bytes = 0;
  for (const c of s) {
    bytes += Buffer.byteLength(c);
    if (bytes > limit) break;
    result += c;
  }
  return result + "\n... (truncated)";
}
export function evaluate(
  status: string,
  time: number,
  stdout: string,
  stderr: string,
  expectedOutput: string,
): Omit<JudgeResult, "code_length"> {
  const expected = lines(expectedOutput);
  const actual = lines(stdout);
  const markers = [...stderr.matchAll(/^TESTCASE (\d+):\s*(.*)$/gm)].map(
    (m) => ({
      n: Number(m[1]),
      desc: m[2].trim(),
    }),
  );
  const last = markers.at(-1);
  const before = Math.max(0, (last?.n ?? 0) - 1);
  if (status === "RE" || status === "SG") {
    const trace = truncate(
      stderr
        .split("\n")
        .filter((l) => !l.startsWith("TESTCASE "))
        .join("\n")
        .trim(),
    );
    return {
      verdict: "RE",
      time,
      output: `Passed ${before}/${expected.length} test cases\n\n${last ? `Failed on test case ${last.n}\n\nInput: ${truncate(last.desc)}\n\n` : ""}Error:\n${trace}`,
    };
  }
  if (status === "TO")
    return {
      verdict: "TLE",
      time,
      output: `Passed ${before}/${expected.length} test cases\n\nTime limit exceeded${last ? ` on test case ${last.n}` : ""}`,
    };
  let passed = 0;
  let diff = -1;
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (expected[i] === actual[i]) passed++;
    else if (diff < 0) diff = i;
  }
  if (diff < 0)
    return {
      verdict: "AC",
      time,
      output: `Passed ${expected.length}/${expected.length} test cases`,
    };
  const input = markers.find((m) => m.n === diff + 1);
  return {
    verdict: "WA",
    time,
    output: `Passed ${passed}/${expected.length} test cases\n\nFailed on test case ${diff + 1}\n\n${input ? `Input: ${truncate(input.desc)}\n\n` : ""}Expected: ${truncate(expected[diff] ?? "(no more output expected)")}\nGot: ${truncate(actual[diff] ?? "(no output)")}`,
  };
}
async function run(
  box: number,
  problem: Problem,
  code: string,
): Promise<Omit<JudgeResult, "code_length">> {
  await isolate(box, "--cleanup").catch(() => {});
  const { stdout: boxPath } = await isolate(box, "--init");
  const dir = join(boxPath.trim(), "box");
  const meta = `/tmp/isolate-meta-${box}.txt`;
  try {
    await Promise.all([
      writeFile(join(dir, "submission.py"), code),
      writeFile(join(dir, "main.py"), problem.grader),
    ]);
    const seconds = problem.time_limit_ms / 1000;
    const child = spawn(
      "isolate",
      [
        "--box-id",
        String(box),
        "--time",
        seconds.toFixed(3),
        "--wall-time",
        (seconds * 2 + 1).toFixed(3),
        "--mem",
        String(problem.memory_limit_kb),
        "--fsize",
        "4096",
        "--meta",
        meta,
        "--dir=/usr",
        "--dir=/lib",
        "--dir=/lib64",
        "--dir=/bin",
        "--run",
        "--",
        "/usr/local/bin/python3",
        "main.py",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const out: Buffer[] = [],
      err: Buffer[] = [];
    let outBytes = 0,
      errBytes = 0;
    child.stdout.on("data", (b: Buffer) => {
      const keep = b.subarray(0, Math.max(0, cap - outBytes));
      if (keep.length) out.push(keep);
      outBytes += keep.length;
    });
    child.stderr.on("data", (b: Buffer) => {
      const keep = b.subarray(0, Math.max(0, cap - errBytes));
      if (keep.length) err.push(keep);
      errBytes += keep.length;
    });
    child.stdin.on("error", () => {}); // A submission may exit before consuming stdin.
    const done = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", () => resolve());
    });
    const watchdog = setTimeout(
      () => child.kill("SIGKILL"),
      (seconds * 2 + 6) * 1000,
    );
    try {
      child.stdin.end(problem.test_input);
      await done;
    } finally {
      clearTimeout(watchdog);
    }
    const metadata = Object.fromEntries(
      (await readFile(meta, "utf8"))
        .split("\n")
        .filter((l) => l.includes(":"))
        .map((l) => {
          const colon = l.indexOf(":");
          return [l.slice(0, colon), l.slice(colon + 1).trim()];
        }),
    );
    const status = metadata.status || "OK";
    if (status === "XX")
      throw new Error(
        "Sandbox internal error: " + Buffer.concat(err).toString(),
      );
    return evaluate(
      status,
      Math.floor(Number(metadata.time || 0) * 1000),
      Buffer.concat(out).toString(),
      Buffer.concat(err).toString(),
      problem.test_output,
    );
  } finally {
    await rm(meta, { force: true });
    await isolate(box, "--cleanup");
  }
}
export function validateCode(problem: Problem, code: string): string | null {
  if (Buffer.byteLength(code) > 10240)
    return `Code too long: ${Buffer.byteLength(code)} bytes (max 10240 bytes)`;
  if (!code.trim()) return "Code is empty";
  if (code.includes("\0")) return "Code can't contain NUL bytes";
  if (!problem.test_output.trim() || !problem.grader.trim())
    return "This problem has no tests or grader yet";
  return null;
}
export async function judge(
  problem: Problem,
  code: string,
): Promise<JudgeResult> {
  const box = await acquire();
  try {
    return {
      ...(await run(box, problem, code)),
      code_length: Buffer.byteLength(code),
    };
  } catch (err) {
    console.error(`Judge failure on problem ${problem.id}:`, err);
    return {
      verdict: "SE",
      time: 0,
      code_length: Buffer.byteLength(code),
      output:
        "System error: the judge failed to run your code. This is not your fault; please resubmit.",
    };
  } finally {
    release(box);
  }
}
const inFlight = new Map<string, number>();
const recent = new Map<string, number[]>();
let total = 0;
export function admit(username: string): (() => void) | string {
  const now = Date.now();
  for (const [u, times] of recent) {
    const active = times.filter((t) => now - t < 60000);
    if (active.length) recent.set(u, active);
    else recent.delete(u);
  }
  if (total >= workers * 4)
    return "The judge is busy; please try again in a few seconds";
  if ((inFlight.get(username) ?? 0) >= 2)
    return "You already have 2 submissions being judged";
  const times = recent.get(username) ?? [];
  if (times.length >= 10)
    return "Too many submissions; you can submit 10 per minute";
  recent.set(username, [...times, now]);
  inFlight.set(username, (inFlight.get(username) ?? 0) + 1);
  total++;
  return () => {
    total--;
    const count = (inFlight.get(username) ?? 1) - 1;
    if (count) inFlight.set(username, count);
    else inFlight.delete(username);
  };
}
