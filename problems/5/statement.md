# Balanced Parentheses

Given a string `s` containing only the characters `(` and `)`, determine if the parentheses are balanced.
Return `True` or `1` if balanced, and `False` or `0` if not balanced.

**Definition of balanced:**

- Every opening parenthesis `(` has a matching closing parenthesis `)`
- Parentheses are properly nested (no closing before opening)

**Constraints:**

- 0 ≤ len(s) ≤ 100
- String contains only `(` and `)` characters

**Examples:**

`f("((()()))()()")` → `1` (balanced)

`f("((()())()()")` → `0` (not balanced - missing closing)

`f(")(")` → `0` (not balanced - closes before opens)

`f("()()")` → `1` (balanced)

`f("")` → `1` (empty string is balanced)
