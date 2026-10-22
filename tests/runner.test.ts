import { describe, expect, test } from "bun:test";
import { judge } from "../src/lib/server/runner";
import type { Problem, JudgeProgress } from "../src/lib/types";

// Run inside the production image with isolate's normal capabilities.
// RUN_SANDBOX_TESTS=1 bun test tests/runner.test.ts
const problem: Problem = {
  id: 1,
  title: "Sandbox check",
  statement: "",
  result_mode: "value",
  grader: `import sys
from submission import f
for i, value in enumerate(sys.stdin.read().splitlines(), 1):
 print(f'TESTCASE {i}: {value}', file=sys.stderr)
 print(f(int(value)))
`,
  test_input: "1\n948723\n3\n",
  test_output: "2\n1897446\n6\n",
  time_limit_ms: 1000,
  memory_limit_kb: 131072,
  public_test_count: 1,
};

describe.skipIf(process.env.RUN_SANDBOX_TESTS !== "1")("isolated judge", () => {
  test("streams verified progress and preserves value types", async () => {
    const progress: JudgeProgress[] = [];
    const result = await judge(problem, "f=lambda x:x*2", (p) => {
      progress.push(p);
    });
    expect(result.verdict).toBe("AC");
    expect(progress.at(-1)?.passed).toBe(3);
    const typed = await judge(
      {
        ...problem,
        grader:
          "from submission import f\na=(2**200, {'x': {1, 2}}, b'abc', [True, None], frozenset([3]))\nprint(f(a)==a)",
        test_input: "",
        test_output: "True",
      },
      "f=lambda x:x",
    );
    expect(typed.verdict).toBe("AC");
  });
  test("normalizes arbitrary truthy results before crossing the boundary", async () => {
    const result = await judge(
      { ...problem, result_mode: "truthy", test_output: "True\nTrue\nTrue" },
      "import re\nf=lambda x:re.match('.',str(x))",
    );
    expect(result.verdict).toBe("AC");
  });
  test("does not expose private inputs in failures or forged stderr markers", async () => {
    const result = await judge(
      problem,
      "def f(x):\n if x==1:return 2\n raise ValueError(str(x))",
    );
    expect(result.verdict).toBe("RE");
    expect(result.passed).toBe(1);
    expect(JSON.stringify(result)).not.toContain("948723");
    expect(result.failure?.line).toBe(3);
    const forged = await judge(
      { ...problem, public_test_count: 0 },
      "import sys\nprint('TESTCASE 999: secret',file=sys.stderr)\nf=lambda x:0",
    );
    expect(forged.verdict).toBe("WA");
    expect(forged.failure?.case).toBe(1);
    expect(JSON.stringify(forged)).not.toContain("secret");
  });
  test("contestants cannot read grader files or produce judge output directly", async () => {
    const result = await judge(problem, "f=lambda x:open('main.py').read()");
    expect(result.verdict).toBe("RE");
    expect(result.failure?.error).toContain("FileNotFoundError");
    const forged = await judge(
      problem,
      "print('2\\n1897446\\n6')\nf=lambda x:0",
    );
    expect(forged.verdict).toBe("WA");
    expect(forged.passed).toBe(0);
  });
  test("forged RPC values cannot execute code in the private grader", async () => {
    const result = await judge(
      problem,
      `import os,json
os.write(4,(json.dumps({"result":["object","__import__('os').system('cat main.py')"]})+"\\n").encode())
f=lambda x:0`,
    );
    expect(result.verdict).toBe("RE");
    expect(result.output).not.toContain("import sys");
  });
  test("trusted grader exceptions stay out of contestant feedback", async () => {
    const result = await judge(
      { ...problem, grader: "raise RuntimeError('private-grader-secret')" },
      "f=lambda x:x",
    );
    expect(result.verdict).toBe("SE");
    expect(JSON.stringify(result)).not.toContain("private-grader-secret");
  });
  test("driver resource failures are not blamed on the submission", async () => {
    for (const grader of [
      "import os,signal; os.kill(os.getpid(),signal.SIGKILL)",
      "while True:pass",
    ]) {
      const result = await judge({ ...problem, grader }, "f=lambda x:x");
      expect(result.verdict).toBe("SE");
    }
  }, 10000);
  test("rejects malformed or oversized protocol responses and reuses boxes", async () => {
    const malformed = await judge(
      problem,
      "import os\nos.write(4,b'{bad json}\\n')\nf=lambda x:x*2",
    );
    expect(malformed.verdict).toBe("RE");
    const large = await judge(problem, "f=lambda x:'x'*2000000");
    expect(large.verdict).toBe("RE");
    const next = await judge(problem, "f=lambda x:x*2");
    expect(next.verdict).toBe("AC");
  });
  test("times out a stalled contestant without counting unverified passes", async () => {
    const result = await judge(problem, "def f(x):\n while True:pass");
    expect(result.verdict).toBe("TLE");
    expect(result.passed).toBe(0);
  }, 10000);
  test("parallel submissions use independent paired boxes", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        judge(problem, i % 2 ? "f=lambda x:x*2" : "f=lambda x:0"),
      ),
    );
    expect(results.map((r) => r.verdict)).toEqual(["WA", "AC", "WA", "AC"]);
  }, 10000);
});
