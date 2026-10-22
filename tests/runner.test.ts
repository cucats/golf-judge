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
  grader: `from submission import f\nprint(f(int(input())))\n`,
  test_cases: [
    { input: "1", output: "2", public: true },
    { input: "948723", output: "1897446", public: false },
    { input: "3", output: "6", public: false },
  ],
  test_count: 3,
  time_limit_ms: 1000,
  memory_limit_kb: 131072,
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
        test_cases: [{ input: "", output: "True", public: false }],
        test_count: 1,
      },
      "f=lambda x:x",
    );
    expect(typed.verdict).toBe("AC");
  });
  test("reuses submission state between cases and resets it for the next submission", async () => {
    const stateful = {
      ...problem,
      test_cases: problem.test_cases.map((test, index) => ({
        ...test,
        output: String(index + 1),
      })),
    };
    const code =
      "n=0\ndef f(x,a=[]):\n global n\n n+=1\n a.append(x)\n return len(a) if n==len(a) else 0";
    expect((await judge(stateful, code)).verdict).toBe("AC");
    expect((await judge(stateful, code)).verdict).toBe("AC");
    const files = {
      ...problem,
      test_cases: problem.test_cases.map((test, index) => ({
        ...test,
        output: index === 0 ? "1" : "2",
      })),
    };
    const fileCode =
      "import os\ndef f(x):\n p='/tmp/previous'\n n=1+os.path.exists(p)\n open(p,'w').close()\n return n";
    expect((await judge(files, fileCode)).verdict).toBe("AC");
    expect((await judge(files, fileCode)).verdict).toBe("AC");
  }, 10000);
  test("per-case grader receives separate multiline and empty inputs and outputs", async () => {
    const result = await judge(
      {
        ...problem,
        grader:
          'import sys\nfrom submission import f\nprint(f(sys.stdin.read()), end="")',
        test_cases: [
          { input: "one\ntwo\n", output: "one\ntwo\n", public: true },
          { input: "", output: "", public: false },
          { input: "last", output: "last", public: true },
        ],
      },
      "f=lambda x:x",
    );
    expect(result.verdict).toBe("AC");
    expect(result.passed).toBe(3);
  });
  test("visibility belongs to each pair, independent of ordering", async () => {
    const result = await judge(
      {
        ...problem,
        test_cases: problem.test_cases.map((test, i) => ({
          ...test,
          public: i === 1,
        })),
      },
      "f=lambda x:2 if x==1 else 0",
    );
    expect(result.failure?.case).toBe(2);
    expect(result.failure?.public).toBe(true);
    expect(result.failure?.input).toBe("948723");
  });
  test("normalizes arbitrary truthy results before crossing the boundary", async () => {
    const result = await judge(
      {
        ...problem,
        result_mode: "truthy",
        test_cases: problem.test_cases.map((test) => ({
          ...test,
          output: "True",
        })),
      },
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
    expect(result.completed).toBe(3);
    expect(JSON.stringify(result)).not.toContain("948723");
    expect(result.failure?.line).toBe(3);
    const forged = await judge(
      {
        ...problem,
        test_cases: problem.test_cases.map((test) => ({
          ...test,
          public: false,
        })),
      },
      "import sys\nprint('TESTCASE 999: secret',file=sys.stderr)\nf=lambda x:0",
    );
    expect(forged.verdict).toBe("WA");
    expect(forged.failure?.case).toBe(1);
    expect(JSON.stringify(forged)).not.toContain("secret");
  });
  test("runtime errors in any case leave the remaining cases runnable", async () => {
    for (const [index, testCase] of problem.test_cases.entries()) {
      const progress: JudgeProgress[] = [];
      const result = await judge(
        problem,
        `def f(x):\n if x==${testCase.input}:raise ValueError('case failure')\n return 2*x`,
        (update) => {
          progress.push(update);
        },
      );
      expect(result.verdict).toBe("RE");
      expect(result.failure?.case).toBe(index + 1);
      expect(result.passed).toBe(2);
      expect(result.completed).toBe(3);
      expect(progress.at(-1)?.completed).toBe(3);
    }
  });
  test("runtime errors take precedence over wrong answers while later cases still pass", async () => {
    const result = await judge(
      {
        ...problem,
        test_cases: problem.test_cases.map((test, index) => ({
          ...test,
          public: index !== 1,
        })),
      },
      "def f(x):\n if x==948723:raise ValueError('private')\n return 6 if x==3 else 0",
    );
    expect(result.verdict).toBe("RE");
    expect(result.failure?.case).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.completed).toBe(3);
    expect(result.cases?.map((test) => test.verdict)).toEqual([
      "WA",
      "RE",
      "AC",
    ]);
    expect(result.cases?.[0]).toMatchObject({
      case: 1,
      input: "1",
      expected: "2",
      actual: "0\n",
    });
    expect(result.cases?.[1]).toEqual({
      case: 2,
      public: false,
      verdict: "RE",
      error: "ValueError",
      line: 2,
    });
    expect(result.cases?.[2]).toMatchObject({
      case: 3,
      input: "3",
      expected: "6",
      actual: "6\n",
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  test("submission import failures fail each case without stopping progress", async () => {
    const result = await judge(
      problem,
      "raise ValueError('cannot load')\nf=lambda x:2*x",
    );
    expect(result.verdict).toBe("RE");
    expect(result.failure?.case).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.completed).toBe(3);
    expect(result.cases?.map((test) => test.verdict)).toEqual([
      "RE",
      "RE",
      "RE",
    ]);
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
    expect(result.cases?.map((test) => test.verdict)).toEqual([
      "TLE",
      "NOT_RUN",
      "NOT_RUN",
    ]);
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
