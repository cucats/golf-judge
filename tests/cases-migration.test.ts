import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";

function convert(problem: {
  grader: string;
  test_input: string;
  test_output: string;
  public_test_count: number;
}) {
  return JSON.parse(
    execFileSync("python3", ["scripts/migrations/010_cases.py"], {
      input: JSON.stringify([{ id: 1, ...problem }]),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }),
  )[0];
}

test("migration preserves variable-length and empty inputs as explicit pairs", () => {
  const converted = convert({
    grader: `from submission import f
count = int(input())
for i in range(count):
    n = int(input())
    rows = [input() for _ in range(n)]
    print(f"TESTCASE {i+1}: {rows!r}", file=__import__('sys').stderr)
    print(f(rows))
`,
    test_input: "2\n2\nfirst\nsecond\n1\n\n",
    test_output: "two\nempty\n",
    public_test_count: 1,
  });
  expect(converted.test_cases).toEqual([
    { input: "2\nfirst\nsecond\n", output: "two", public: true },
    { input: "1\n\n", output: "empty", public: false },
  ]);
  expect(converted.grader).not.toContain("range(count)");
  expect(converted.grader).not.toContain("TESTCASE");
  expect(converted.grader).toContain("range(n)");
});

test("migration refuses inconsistent case counts rather than dropping data", () => {
  expect(() =>
    convert({
      grader:
        "from submission import f\ncount=int(input())\nfor i in range(count):\n s=input()\n print(f(s))\n",
      test_input: "2\none\ntwo\n",
      test_output: "one\n",
      public_test_count: 0,
    }),
  ).toThrow();
});
