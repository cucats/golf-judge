import { availableParallelism } from "node:os";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import type { JudgeResult, JudgeProgress, Problem } from "#lib/types.js";
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
  stderr: string,
  expectedOutput: string,
  publicCount = 0,
  error?: RemoteError,
): Omit<JudgeResult, "code_length"> {
  const expected = lines(expectedOutput),
    actual = lines(stdout);
  const markers = [...stderr.matchAll(/^TESTCASE (\d+):\s*(.*)$/gm)].map(
    (m) => ({ n: Number(m[1]), desc: m[2].trim() }),
  );
  let passed = 0;
  let diff = -1;
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (i < expected.length && expected[i] === actual[i]) passed++;
    else if (diff < 0) diff = i;
  }
  const interrupted = status === "TO" || status === "RE" || status === "SG";
  const verdict =
    status === "TO" ? "TLE" : interrupted ? "RE" : diff < 0 ? "AC" : "WA";
  const completed = Math.min(
    expected.length,
    actual.length + (interrupted ? 1 : 0),
  );
  let output = `Passed ${passed}/${expected.length} test cases`;
  if (verdict === "AC")
    return { verdict, time, output, passed, completed, total: expected.length };
  const caseNumber = interrupted
    ? Math.min(expected.length, markers.at(-1)?.n ?? actual.length + 1)
    : diff + 1;
  const isPublic = caseNumber > 0 && caseNumber <= publicCount;
  const marker = markers.find((m) => m.n === caseNumber);
  const failure: NonNullable<JudgeResult["failure"]> = {
    case: caseNumber,
    public: isPublic,
    ...(error?.line ? { line: error.line } : {}),
    ...(error?.column ? { column: error.column } : {}),
  };
  output += `\n\n${verdict === "TLE" ? "Time limit exceeded on" : "Failed on"} ${isPublic ? "public" : "private"} test case ${caseNumber}`;
  if (isPublic) {
    if (marker) failure.input = truncate(marker.desc);
    if (verdict === "WA") {
      failure.expected = truncate(
        expected[diff] ?? "(no more output expected)",
      );
      failure.actual = truncate(actual[diff] ?? "(no output)");
    }
  }
  if (verdict === "RE")
    failure.error = error
      ? `${error.kind}${isPublic && error.message ? `: ${error.message}` : ""}`
      : "Runtime error";
  if (failure.input !== undefined) output += `\n\nInput: ${failure.input}`;
  if (failure.expected !== undefined)
    output += `\n\nExpected: ${failure.expected}\nGot: ${failure.actual}`;
  if (failure.error)
    output += `\n\n${failure.error}${failure.line ? ` on submission line ${failure.line}` : ""}`;
  return {
    verdict,
    time,
    output,
    passed,
    completed,
    total: expected.length,
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
  const paths: string[] = [];
  const metadataPaths = boxes.map((box) => `/tmp/isolate-meta-${box}.txt`);
  const children: ReturnType<typeof spawn>[] = [];
  const seconds = problem.time_limit_ms / 1000;
  const runtime = join(process.cwd(), "scripts/judge");
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let progressWork = Promise.resolve();
  try {
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
          "--dir=/usr",
          "--dir=/lib",
          "--dir=/lib64",
          "--dir=/bin",
          "--run",
          "--",
          "/usr/local/bin/python3",
          "-u",
          "runner.py",
          ...(index === 0 ? [problem.result_mode ?? "value"] : []),
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
      for (const child of children) child.kill("SIGKILL");
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
    const out: Buffer[] = [],
      err: Buffer[] = [];
    let outBytes = 0,
      errBytes = 0,
      stderrBytes = 0;
    let error: RemoteError | undefined;
    const expected = lines(problem.test_output);
    let outputPending = "",
      completed = 0,
      passed = 0,
      lastProgress = 0;
    const progress = (force = false) => {
      if (!onProgress || (!force && Date.now() - lastProgress < 100)) return;
      lastProgress = Date.now();
      const update: JudgeProgress = {
        state: "running",
        passed,
        completed: Math.min(completed, expected.length),
        total: expected.length,
      };
      progressWork = progressWork.then(() => onProgress(update));
      // Keep a rejection handled while subprocesses are still running.
      void progressWork.catch(() => {});
    };
    progress(true);
    contestant.stdout!.resume();
    contestant.stderr!.on("data", (chunk: Buffer) => {
      // Never interpret contestant diagnostics as test markers or expose them.
      stderrBytes += chunk.length;
      if (stderrBytes > cap) {
        protocolFailure = true;
        stop();
      }
    });
    driver.stdout!.on("data", (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > cap) {
        protocolFailure = true;
        stop();
        return;
      }
      out.push(chunk);
      outputPending += chunk.toString();
      let newline: number;
      while ((newline = outputPending.indexOf("\n")) >= 0) {
        const value = outputPending.slice(0, newline).trimEnd();
        outputPending = outputPending.slice(newline + 1);
        if (completed < expected.length && expected[completed] === value)
          passed++;
        completed++;
      }
      progress();
    });
    driver.stderr!.on("data", (chunk: Buffer) => {
      const keep = chunk.subarray(0, Math.max(0, cap - errBytes));
      err.push(keep);
      errBytes += keep.length;
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
    driver.stdin!.end(problem.test_input);
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
    if (!timedOut && !contestantFailed && metas[1].status) {
      throw new Error("Problem grader failed");
    }
    const status = timedOut ? "TO" : contestantFailed ? "RE" : "OK";
    const result = evaluate(
      status,
      Math.floor(Number(metas[0].time || 0) * 1000),
      Buffer.concat(out).toString(),
      Buffer.concat(err).toString(),
      problem.test_output,
      problem.public_test_count,
      error,
    );
    passed = result.passed ?? passed;
    completed = result.completed ?? completed;
    progress(true);
    await progressWork;
    return result;
  } finally {
    clearTimeout(watchdog);
    for (const child of children) child.kill("SIGKILL");
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
  if (!problem.test_output.trim() || !problem.grader.trim())
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
