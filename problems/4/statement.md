# Nested List Wrapping

Wrap every list in another list. Apply this transformation recursively to all nested lists.

- If the input is a list, wrap it: `[...]` → `[[...]]`
- If the input is not a list (e.g., an integer), return it unchanged
- Process all nested lists recursively before wrapping

**Constraints:**

- Nesting depth ≤ 20
- Elements are integers or lists

**Examples:**

`f([1, 2, 3])` → `[[1, 2, 3]]` (wrap the list)

`f([1, 2, [3, 4]])` → `[[1, 2, [[3, 4]]]]` (wrap `[3, 4]`, and wrap the whole list)

`f([1, 2, [3, 4, [5]], [6, 7]])` → `[[1, 2, [[3, 4, [[5]]]], [[6, 7]]]]` (wrap all nested lists recursively)

`f(5)` → `5` (integers remain unchanged)
