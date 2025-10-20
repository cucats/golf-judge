# Alphabet Soup

A chef is evaluating alphabet soup orders. A bowl of soup is acceptable only if the letter arrangement follows proper "alphabetical soup protocol": the letters must have been added to the bowl in alphabetical order (`'a'`, then `'b'`, then `'c'`, etc.), with each letter placed either at the left or right end of the current arrangement.

Given a string `s` representing the letters in a bowl, determine if it follows alphabetical soup protocol. Return `"slurp"` if it's acceptable, or `"yuck"` if it violates the protocol.

**Constraints:**

- 1 ≤ len(s) ≤ 26
- String consists of lowercase letters only, from `'a'` to `'z'`

**Examples:**

`f("bac")` returns `"slurp"` - built as: "" → "a" → "ba" → "bac"

`f("ihfcbadeg")` returns `"slurp"`

`f("ca")` returns `"yuck"` - 'c' appears before 'b' was added

`f("aa")` returns `"yuck"` - duplicate letters not allowed
