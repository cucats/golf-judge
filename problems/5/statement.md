# List Generation

Given three integers `n`, `u`, and `s`,
return any list of integers `a` such that:

- `len(a) == n` (the list has exactly n elements)
- `len(set(a)) == u` (the list has exactly u unique elements)
- `sum(a) == s` (the sum of all elements equals s)

Your output must be a list of integers. Negative integers are allowed in your output.

**Constraints:**

- 1 ≤ u ≤ n ≤ 20
- -1000 ≤ s ≤ 1000

- A valid solution is guaranteed to exist for all test cases. For example, you will never be asked to solve an impossible case like `n=3, u=1, s=10` (which would require three copies of the same number to sum to `10`, meaning each would be `10/3`, which is not an integer).

**Examples:**

(These are not the only possible valid outputs)

- `f(5, 3, 10)` returns `[1, 1, 2, 3, 3]`
- `f(3, 1, 9)` returns `[3, 3, 3]`
- `f(4, 2, 0)` returns `[-1, -1, 1, 1]`
- `f(6, 3, -12)` returns `[-4, -4, -1, -1, -1, -1]`
