import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade Manhattan distance solution"""
    matrix = test_input[0]

    # Find the two nonzero positions
    positions = []
    for y, row in enumerate(matrix):
        for x, val in enumerate(row):
            if val != 0:
                positions.append((y, x))

    if len(positions) != 2:
        return (False, "Error: Matrix should have exactly 2 nonzero values", positions)

    (y1, x1), (y2, x2) = positions
    expected = abs(y1 - y2) + abs(x1 - x2)

    try:
        actual = user_func(matrix)
        passed = golf_equal(expected, actual)
        return (passed, expected, actual)
    except Exception as e:
        return (False, expected, f"Error: {e}")
