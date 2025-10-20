# Balanced Parentheses

Given a string `s` containing only the characters `(` and `)`, determine if the parentheses are balanced.
Return `"balanced"` if balanced, and `"imbalanced"` if not balanced.

**Definition of balanced:**

- Every opening parenthesis `(` has a matching closing parenthesis `)`
- Parentheses are properly nested (no closing before opening)

**Constraints:**

- 0 ≤ len(s) ≤ 100
- String contains only `(` and `)` characters

**Examples:**

`f("((()()))()()")` returns `"balanced"`

`f("((()())()()")` returns `"imbalanced"`

`f(")(")` returns `imbalanced`

`f("()()")` returns `balanced`

`f("")` returns `balanced`
