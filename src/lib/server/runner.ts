import { availableParallelism } from "node:os";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  rm,
  copyFile,
  mkdir,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import type {
  JudgeResult,
  JudgeProgress,
  Problem,
  TestCase,
  TestCaseResult,
} from "#lib/types.js";
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
const normalizedOutput = (value: string) =>
  value
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
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
type RemoteError = {
  kind: string;
  message?: string;
  line?: number;
  column?: number;
};
const exceptionKinds = new Set([
  "AssertionError",
  "AttributeError",
  "EOFError",
  "ImportError",
  "IndexError",
  "KeyError",
  "MemoryError",
  "NameError",
  "NotImplementedError",
  "OSError",
  "OverflowError",
  "RecursionError",
  "RuntimeError",
  "StopIteration",
  "SyntaxError",
  "IndentationError",
  "TabError",
  "TypeError",
  "UnboundLocalError",
  "ValueError",
  "ZeroDivisionError",
  "FileNotFoundError",
  "PermissionError",
  "SystemExit",
]);
function remoteError(value: unknown): RemoteError {
  const e =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const position = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 10240
      ? v
      : undefined;
  return {
    kind:
      typeof e.kind === "string" && exceptionKinds.has(e.kind)
        ? e.kind
        : "RuntimeError",
    message: typeof e.message === "string" ? truncate(e.message) : undefined,
    line: position(e.line),
    column: position(e.column),
  };
}
export function evaluate(
  status: string,
  time: number,
  stdout: string,
  test: TestCase,
  caseNumber = 1,
  error?: RemoteError,
): Omit<JudgeResult, "code_length"> {
  const verdict =
    status === "TO"
      ? "TLE"
      : status === "RE" || status === "SG"
        ? "RE"
        : normalizedOutput(stdout) === normalizedOutput(test.output)
          ? "AC"
          : "WA";
  if (verdict === "AC")
    return { verdict, time, output: "", passed: 1, completed: 1, total: 1 };
  const failure: NonNullable<JudgeResult["failure"]> = {
    case: caseNumber,
    public: test.public,
    ...(error?.line ? { line: error.line } : {}),
    ...(error?.column ? { column: error.column } : {}),
  };
  if (test.public) {
    failure.input = truncate(test.input);
    if (verdict === "WA") {
      failure.expected = truncate(test.output);
      failure.actual = truncate(stdout);
    }
  }
  if (verdict === "RE")
    failure.error = error
      ? `${error.kind}${test.public && error.message ? `: ${error.message}` : ""}`
      : "Runtime error";
  return {
    verdict,
    time,
    output: "",
    passed: 0,
    completed: 1,
    total: 1,
    failure,
  };
}

type Progress = (progress: JudgeProgress) => void | Promise<void>;
async function run(
  slot: number,
  problem: Problem,
  code: string,
  onProgress?: Progress,
): Promise<Omit<JudgeResult, "code_length">> {
  const boxes = [slot * 2, slot * 2 + 1];
  const metadataPaths = boxes.map((box) => `/tmp/isolate-meta-${box}.txt`);
  const children: ReturnType<typeof spawn>[] = [];
  const seconds = problem.time_limit_ms / 1000;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const paths: string[] = [];
  let passed = 0,
    completed = 0;
  let failed: Omit<JudgeResult, "code_length"> | undefined;
  const cases: TestCaseResult[] = problem.test_cases.map((test, index) => ({
    case: index + 1,
    public: test.public,
    verdict: "NOT_RUN",
    ...(test.public
      ? { input: truncate(test.input), expected: truncate(test.output) }
      : {}),
  }));
  let progressWork = Promise.resolve();
  let lastProgress = 0;
  const progress = (force = false) => {
    if (!onProgress || (!force && Date.now() - lastProgress < 100)) return;
    lastProgress = Date.now();
    const snapshot: JudgeProgress = {
      state: "running",
      passed,
      completed,
      total: problem.test_count,
    };
    progressWork = progressWork.then(() => onProgress(snapshot));
    void progressWork.catch(() => {});
  };
  try {
    const runtime = join(process.cwd(), "scripts/judge");
    for (const box of boxes) {
      await isolate(box, "--cleanup").catch(() => {});
      const initialized = await isolate(box, "--init");
      paths.push(join(initialized.stdout.trim(), "box"));
    }
    await Promise.all([
      writeFile(join(paths[0], "submission.py"), code),
      copyFile(join(runtime, "contestant.py"), join(paths[0], "runner.py")),
      copyFile(join(runtime, "wire.py"), join(paths[0], "wire.py")),
      writeFile(join(paths[1], "main.py"), problem.grader),
      copyFile(join(runtime, "proxy.py"), join(paths[1], "submission.py")),
      copyFile(join(runtime, "driver.py"), join(paths[1], "runner.py")),
      copyFile(join(runtime, "wire.py"), join(paths[1], "wire.py")),
    ]);
    for (const path of paths) {
      const scratch = join(path, "tmp");
      await rm(scratch, { recursive: true, force: true });
      await mkdir(scratch);
      await chmod(scratch, 0o777);
    }
    const start = (index: number) => {
      const child = spawn(
        "isolate",
        [
          "--box-id",
          String(boxes[index]),
          "--time",
          seconds.toFixed(3),
          "--wall-time",
          (seconds * 2 + 1).toFixed(3),
          "--mem",
          String(problem.memory_limit_kb),
          "--fsize",
          "4096",
          "--meta",
          metadataPaths[index],
          "--inherit-fds",
          `--dir=/box=${paths[index]}`,
          `--dir=/tmp=${join(paths[index], "tmp")}:rw`,
          "--dir=/usr",
          "--dir=/lib",
          "--dir=/lib64",
          "--dir=/bin",
          "--run",
          "--",
          "/usr/local/bin/python3",
          "-S",
          "-u",
          "runner.py",
        ],
        { stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"] },
      );
      children.push(child);
      for (const stream of child.stdio) stream?.on("error", () => {});
      return child;
    };
    const contestant = start(0),
      driver = start(1);
    const stop = () => {
      // Let isolate's keeper terminate the sandboxed processes and close their pipes.
      for (const child of children) child.kill("SIGTERM");
    };
    let timeout = false,
      protocolFailure = false;
    watchdog = setTimeout(
      () => {
        timeout = true;
        stop();
      },
      (seconds * 2 + 2) * 1000,
    );
    let stderrBytes = 0;
    let error: RemoteError | undefined;
    let driverFailure = false;
    let pendingOutput = Buffer.alloc(0);
    const sendCase = () => {
      if (completed === problem.test_count) driver.stdin!.end();
      else
        driver.stdin!.write(
          JSON.stringify(problem.test_cases[completed].input) + "\n",
        );
    };
    contestant.stdout!.resume();
    contestant.stderr!.on("data", (chunk: Buffer) => {
      // Contestant diagnostics never determine case boundaries or feedback.
      stderrBytes += chunk.length;
      if (stderrBytes > cap) {
        protocolFailure = true;
        stop();
      }
    });
    driver.stderr!.resume();
    driver.stdout!.on("data", (chunk: Buffer) => {
      pendingOutput = Buffer.concat([pendingOutput, chunk]);
      let newline: number;
      while ((newline = pendingOutput.indexOf(10)) >= 0) {
        const frame = pendingOutput.subarray(0, newline);
        pendingOutput = pendingOutput.subarray(newline + 1);
        try {
          if (frame.length > cap || completed >= problem.test_count)
            throw new Error("Invalid grader output");
          const message = JSON.parse(frame.toString());
          if (
            !message ||
            typeof message.output !== "string" ||
            typeof message.failed !== "boolean"
          )
            throw new Error("Invalid grader output");
          const result = evaluate(
            message.failed || error ? "RE" : "OK",
            0,
            message.output,
            problem.test_cases[completed],
            completed + 1,
            error,
          );
          cases[completed] = {
            ...cases[completed],
            ...result.failure,
            verdict: result.verdict,
            ...(problem.test_cases[completed].public
              ? { actual: truncate(message.output) }
              : {}),
          };
          completed++;
          if (result.verdict === "AC") passed++;
          else if (
            !failed ||
            (result.verdict === "RE" && failed.verdict === "WA")
          )
            failed = result;
          error = undefined;
          progress();
          sendCase();
        } catch {
          driverFailure = true;
          stop();
          return;
        }
      }
      if (pendingOutput.length > cap) {
        driverFailure = true;
        stop();
      }
    });
    // Bound every frame before forwarding. No untrusted Python deserialization
    // runs in the driver; its decoder constructs only inert built-in values.
    const bridge = (source: Duplex, destination: Duplex, response: boolean) => {
      let pending = Buffer.alloc(0);
      source.on("data", (chunk: Buffer) => {
        pending = Buffer.concat([pending, chunk]);
        let newline: number;
        while ((newline = pending.indexOf(10)) >= 0) {
          if (newline >= cap) {
            protocolFailure = true;
            stop();
            return;
          }
          const frame = pending.subarray(0, newline + 1);
          pending = pending.subarray(newline + 1);
          try {
            const message = JSON.parse(frame.toString());
            if (
              !message ||
              typeof message !== "object" ||
              Array.isArray(message)
            )
              throw new Error("Invalid frame");
            if (response && message.error !== undefined)
              error = remoteError(message.error);
          } catch {
            protocolFailure = true;
            stop();
            return;
          }
          if (!destination.write(frame)) {
            source.pause();
            destination.once("drain", () => source.resume());
          }
        }
        if (pending.length > cap) {
          protocolFailure = true;
          stop();
        }
      });
      source.on("end", () => destination.end());
    };
    bridge(driver.stdio[3] as Duplex, contestant.stdio[3] as Duplex, false);
    bridge(contestant.stdio[4] as Duplex, driver.stdio[4] as Duplex, true);
    const done = (child: ReturnType<typeof spawn>) =>
      new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
    const contestantDone = done(contestant),
      driverDone = done(driver);
    contestant.stdin!.end();
    progress(true);
    sendCase();
    await Promise.all([
      contestantDone,
      driverDone.then(() => {
        // Closing the request pipe lets the persistent function server exit cleanly.
        (contestant.stdio[3] as Duplex).end();
      }),
    ]);
    clearTimeout(watchdog);
    const metas = await Promise.all(
      metadataPaths.map(async (path) =>
        Object.fromEntries(
          (await readFile(path, "utf8").catch(() => ""))
            .split("\n")
            .filter((l) => l.includes(":"))
            .map((l) => {
              const colon = l.indexOf(":");
              return [l.slice(0, colon), l.slice(colon + 1).trim()];
            }),
        ),
      ),
    );
    if (metas.some((meta) => meta.status === "XX"))
      throw new Error("Sandbox initialization failed");
    const contestantFailed =
      protocolFailure ||
      error ||
      metas[0].status === "RE" ||
      metas[0].status === "SG" ||
      metas[1].exitcode === "86";
    const timedOut = timeout || metas[0].status === "TO";
    if (
      driverFailure ||
      (!timedOut &&
        !contestantFailed &&
        (metas[1].status ||
          completed !== problem.test_count ||
          pendingOutput.length))
    ) {
      throw new Error("Problem grader failed");
    }
    if (timedOut || contestantFailed) {
      const index = Math.min(completed, problem.test_count - 1);
      failed = evaluate(
        timedOut ? "TO" : "RE",
        0,
        "",
        problem.test_cases[index],
        index + 1,
        error,
      );
      if (cases[index].verdict === "AC") passed--;
      cases[index] = {
        ...cases[index],
        ...failed.failure,
        verdict: failed.verdict,
      };
      if (completed < problem.test_count) completed++;
    }
    progress(true);
    await progressWork;
    return {
      ...failed,
      verdict: failed?.verdict ?? "AC",
      time: Math.floor(Number(metas[0].time || 0) * 1000),
      output: `Passed ${passed}/${problem.test_count} test cases`,
      passed,
      completed,
      total: problem.test_count,
      cases,
    };
  } finally {
    clearTimeout(watchdog);
    for (const child of children) child.kill("SIGTERM");
    await Promise.all(metadataPaths.map((path) => rm(path, { force: true })));
    await Promise.all(
      boxes.map((box) => isolate(box, "--cleanup").catch(() => {})),
    );
  }
}

export function validateCode(problem: Problem, code: string): string | null {
  if (Buffer.byteLength(code) > 10240)
    return `Code too long: ${Buffer.byteLength(code)} bytes (max 10240 bytes)`;
  if (!code.trim()) return "Code is empty";
  if (code.includes("\0")) return "Code can't contain NUL bytes";
  if (!problem.test_cases.length || !problem.grader.trim())
    return "This problem has no tests or grader yet";
  return null;
}
export async function judge(
  problem: Problem,
  code: string,
  onProgress?: Progress,
): Promise<JudgeResult> {
  const box = await acquire();
  try {
    return {
      ...(await run(box, problem, code, onProgress)),
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
