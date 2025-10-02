import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade matrix rotation solution"""
    matrix, n = test_input

    # Reference implementation
    def rotate_once(m):
        return [list(row) for row in zip(*m[::-1])]

    expected = matrix
    for _ in range(n % 4):  # Only need to rotate 0-3 times
        expected = rotate_once(expected)

    try:
        actual = user_func(matrix, n)
        passed = golf_equal(expected, actual)
        return (passed, expected, actual)
    except Exception as e:
        return (False, expected, f"Error: {e}")
