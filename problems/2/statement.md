# Balanced Brackets

Given a string `s` containing only bracket characters `()`, `[]`, and `{}`, determine if the brackets are balanced.
Return `"BALANCED"` if balanced, and `"IMBALANCED"` if not balanced.

**Definition of balanced:**

- Every opening bracket has a matching closing bracket of the same type
- Brackets are properly nested (correctly ordered and paired)
- Different bracket types must match: `(` with `)`, `[` with `]`, `{` with `}`

**Constraints:**

- 0 ≤ len(s) ≤ 100
- String contains only `(`, `)`, `[`, `]`, `{`, `}` characters

**Examples:**

`f("()[]{}")` returns `"BALANCED"`

`f("([{}])")` returns `"BALANCED"`

`f("([)]")` returns `"IMBALANCED"` - brackets interleaved incorrectly

`f("()}")` returns `"IMBALANCED"` - missing opening bracket

`f("")` returns `"BALANCED"`
