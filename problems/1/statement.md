# Nested List Wrapping

You are given a nested list structure. At all depths, wrap every list in an additional outer list.

- If the input is a list, wrap it: `[...]` → `[[...]]`
- If the input is not a list (e.g., an integer), return it unchanged

**Constraints:**

- Maximum nesting depth ≤ 20
- Total number of integers ≤ 100
- Elements are integers or lists

**Examples:**

`f([1, 2, 3])` returns `[[1, 2, 3]]`

`f([1, 2, [3, 4]])` returns `[[1, 2, [[3, 4]]]]`

`f([1, 2, [3, 4, [5]], [6, 7]])` returns `[[1, 2, [[3, 4, [[5]]]], [[6, 7]]]]`

`f(5)` returns `5`
