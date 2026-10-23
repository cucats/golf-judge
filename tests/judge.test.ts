import { describe, expect, test } from "bun:test";
import { evaluate, validateCode } from "../src/lib/server/runner";
import { accepting, remaining, ended, type Contest } from "../src/lib/types";
import { compute } from "../src/lib/server/leaderboard";
import { defaultProblem } from "../src/lib/server/admin";
import { markdown } from "../src/lib/markdown";
import { safeNext, hashPassword, verifyPassword } from "../src/lib/server/auth";

describe("judge verdicts", () => {
  const testCase = { input: "input", output: "1\n2", public: true };
  test("compares one complete output, including multiline and empty cases", () => {
    expect(evaluate("OK", 10, "1 \r\n2\r\n", testCase).verdict).toBe("AC");
    expect(evaluate("OK", 10, "", { ...testCase, output: "" }).verdict).toBe(
      "AC",
    );
    expect(evaluate("OK", 10, " 1\n2", testCase).verdict).toBe("WA");
  });
  test("public failure values come directly from the case", () => {
    const result = evaluate("OK", 10, "wrong\n", testCase, 4);
    expect(result.failure).toEqual({
      case: 4,
      public: true,
      input: "input",
      expected: "1\n2",
      actual: "wrong\n",
    });
  });
  test("runtime failures and timeouts never count partial output as a pass", () => {
    expect(evaluate("RE", 10, "1\n2", testCase).passed).toBe(0);
    expect(evaluate("TO", 1000, "", testCase).verdict).toBe("TLE");
  });
  test("private failures hide values and arbitrary exception messages", () => {
    const hidden = {
      input: "secret input",
      output: "secret answer",
      public: false,
    };
    const wrong = evaluate("OK", 0, "leaked input", hidden);
    expect(wrong.failure).toEqual({ case: 1, public: false });
    const error = evaluate("RE", 0, "", hidden, 1, {
      kind: "ValueError",
      message: "secret input",
      line: 2,
    });
    expect(error.failure?.error).toBe("ValueError");
    expect(error.failure?.line).toBe(2);
    expect(JSON.stringify([wrong, error])).not.toContain("secret");
    expect(JSON.stringify([wrong, error])).not.toContain("leaked");
  });
  test("bounds diagnostics and rejects oversized UTF-8 submissions", () => {
    expect(
      evaluate("OK", 0, "é".repeat(5000), testCase).failure!.actual!.length,
    ).toBeLessThan(5000);
    const problem = {
      ...defaultProblem,
      test_cases: [testCase],
      test_count: 1,
    };
    expect(validateCode(problem, "é".repeat(5121))).toContain("10242 bytes");
    expect(validateCode(problem, "f=lambda x:x")).toBeNull();
  });
});

test("unlimited contests stay open until manually ended", () => {
  const c: Contest = {
    is_private: false,
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
