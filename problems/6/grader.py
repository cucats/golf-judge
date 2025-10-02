import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade RPN calculator solution"""
    expr = test_input[0]

    # Evaluate RPN expression
    stack = []
    for token in expr.split():
        if token in ['+', '-', '*']:
            b = stack.pop()
            a = stack.pop()
            if token == '+':
                stack.append(a + b)
            elif token == '-':
                stack.append(a - b)
            elif token == '*':
                stack.append(a * b)
        else:
            stack.append(int(token))

    expected = int(stack[0])

    try:
        actual = user_func(expr)
        passed = golf_equal(expected, actual)
        return (passed, expected, actual)
    except Exception as e:
        return (False, expected, f"Error: {e}")
