import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade sum of digits solution"""
    n = test_input[0]

    # Calculate sum of all digits from 0 to n
    expected = sum(int(digit) for i in range(n + 1) for digit in str(i))

    try:
        actual = user_func(n)
        passed = golf_equal(expected, actual)
        return (passed, expected, actual)
    except Exception as e:
        return (False, expected, f"Error: {e}")
