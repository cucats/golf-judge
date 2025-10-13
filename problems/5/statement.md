# Balanced Parentheses

Given a string`s`containing only the characters`(`and`)`, determine if the parentheses are balanced.
Return a truthy value if balanced, falsy otherwise.

**Definition of balanced:**

- Every opening parenthesis`(`has a matching closing parenthesis`)`
- Parentheses are properly nested (no closing before opening)

**Constraints:**

- 0 ≤ len(s) ≤ 100
- String contains only`(`and`)`characters

**Examples:**

`f("((()()))()())")`returns truthy (balanced)

`f("((()())()()")`returns falsy (not balanced - missing closing)

`f(")(")`returns falsy (not balanced - closes before opens)

`f("()()")`returns truthy (balanced)

`f("")`returns truthy (empty string is balanced)
