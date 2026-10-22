import { describe, expect, test } from "bun:test";
import { evaluate, validateCode } from "../src/lib/server/runner";
import { accepting, remaining, ended, type Contest } from "../src/lib/types";
import { compute } from "../src/lib/server/leaderboard";
import { defaultProblem } from "../src/lib/server/admin";
import { markdown } from "../src/lib/markdown";
import { safeNext, hashPassword, verifyPassword } from "../src/lib/server/auth";

describe("judge verdicts", () => {
  test("compares lines, accepting CRLF and trailing whitespace", () => {
    expect(evaluate("OK", 10, "1 \r\n2\r\n", "", "1\n2\n").verdict).toBe("AC");
  });
  test("reports the first mismatch with its test input", () => {
    const result = evaluate(
      "OK",
      10,
      "1\n3\n",
      "TESTCASE 1: a:b\nTESTCASE 2: c\n",
      "1\n2\n",
    );
    expect(result.verdict).toBe("WA");
    expect(result.output).toContain("Passed 1/2");
    expect(result.output).toContain("Input: c\n\nExpected: 2\nGot: 3");
    expect(evaluate("OK", 0, "1\n", "", "1\n2").output).toContain(
      "Got: (no output)",
    );
    expect(evaluate("OK", 0, "1\n2\n3", "", "1\n2").output).toContain(
      "Failed on test case 3",
    );
  });
  test("distinguishes runtime failures and timeouts", () => {
    expect(
      evaluate("RE", 3, "", "TESTCASE 1: {'k': 1}\nTraceback: boom\n", "1\n2")
        .output,
    ).toContain("Input: {'k': 1}");
    const timeout = evaluate("TO", 1000, "", "TESTCASE 2: x\n", "1\n2\n3");
    expect(timeout.verdict).toBe("TLE");
    expect(timeout.output).toContain("Passed 1/3");
  });
  test("bounds diagnostics and rejects oversized UTF-8 submissions", () => {
    expect(
      evaluate("WA", 0, "é".repeat(5000), "", "x").output.length,
    ).toBeLessThan(5000);
    expect(
      validateCode({ ...defaultProblem, test_output: "x" }, "é".repeat(5121)),
    ).toContain("10242 bytes");
    expect(
      validateCode({ ...defaultProblem, test_output: "x" }, "f=lambda x:x"),
    ).toBeNull();
  });
});

test("unlimited contests stay open until manually ended", () => {
  const c: Contest = {
    id: 1,
    name: "Contest",
    duration: 0,
    start_time: 1,
    status: "active",
    created_at: 0,
  };
  expect(remaining(c)).toBeNull();
  expect(accepting(c)).toBe(true);
  expect(accepting({ ...c, status: "ended" })).toBe(false);
  expect(ended({ ...c, duration: 60 })).toBe(true);
});

test("ranks ties, medals and unsolved participants", () => {
  const board = compute(
    [
      { id: 10, title: "A", problem_order: 0 },
      { id: 20, title: "B", problem_order: 1 },
    ],
    ["dave"],
    [
      { username: "alice", problem_id: 10, code_length: 50 },
      { username: "alice", problem_id: 20, code_length: 80 },
      { username: "bob", problem_id: 10, code_length: 40 },
      { username: "carol", problem_id: 10, code_length: 50 },
      { username: "carol", problem_id: 20, code_length: 80 },
      { username: "mallory", problem_id: 99, code_length: 1 },
    ],
  );
  expect(board.entries.map((e) => [e.username, e.rank])).toEqual([
    ["alice", 1],
    ["carol", 1],
    ["bob", 3],
    ["dave", 4],
  ]);
  expect(board.entries[2].problem_results[0]?.medal).toBe("diamond");
  expect(board.entries[0].problem_results[1]?.medal).toBe("gold");
});

test("Markdown keeps inline and fenced highlighting and sanitizes HTML", () => {
  const html = markdown(
    '`f=lambda x:x`\n\n```python\nreturn "<script>"\n```\n\n<script>alert(1)</script><img src=x onerror="alert(1)">\n\n[bad](javascript:alert)',
  );
  expect(html).toContain("hljs-keyword");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("onerror");
  expect(html).not.toContain("javascript:");
  expect(markdown("```text\nreturn x\n```")).not.toContain("hljs-keyword");
  expect(markdown("`x<2`")).toContain("&lt;");
});

test("password hashes and redirect targets", async () => {
  const hash = await hashPassword("secret");
  expect(await verifyPassword(hash, "secret")).toBe(true);
  expect(await verifyPassword(hash, "wrong")).toBe(false);
  expect(await verifyPassword("not a hash", "secret")).toBe(false);
  for (const path of [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "/\n/evil",
  ])
    expect(safeNext(path)).toBe("/");
  expect(safeNext("/admin")).toBe("/admin");
});
