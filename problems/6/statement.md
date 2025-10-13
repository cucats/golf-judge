# RPN Calculator

Given a string in Reverse Polish Notation (RPN), evaluate it and return the
result as an integer.

**Supported operations:**

- `+`: Addition
- `-`: Subtraction
- `*`: Multiplication

**RPN rules:**

- Numbers and operators are separated by spaces
- Operators pop two operands from the stack, perform the operation, and push
  the result
- The final result is the only value left on the stack

**Constraints:**

- Input is a valid RPN expression
- All intermediate and final results fit in a Python integer
- Return value must be an integer

**Examples:**

`f("3 10 5 + *")`returns`45`(3 \* (10 + 5))

`f("15 7 - 3 *")`returns`24`((15 - 7) \* 3)

`f("5 1 2 + 4 * + 3 -")`returns`14`(5 + ((1 + 2) \* 4)

- 3.
