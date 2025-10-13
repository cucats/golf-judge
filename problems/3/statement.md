# Two Sum

Given a list `a` and a target value `k`, return `1` if there exist two different indices `i` and `j` such that `a[i] + a[j] == k`. Otherwise, return `0`.

**Constraints:**

- 2 ≤ len(a) ≤ 100
- -1000 ≤ a[i] ≤ 1000
- -2000 ≤ k ≤ 2000
- i ≠ j (must use different indices)

**Examples:**

`f([0, 1, 2, 3, 4, 5, 7, 8, 9], 17)` returns `1` (because 8 + 9 = 17)

`f([0, 1, 2, 3, 4, 5, 7, 8, 9], 18)` returns `0` (no two
elements sum to 18)
