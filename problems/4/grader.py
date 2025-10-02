import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade nested list wrapping solution"""
    m = test_input[0]

    def wrap(obj):
        """Recursively wrap lists"""
        if isinstance(obj, list):
            return [[wrap(item) for item in obj]]
        else:
            return obj

    expected = wrap(m)

    try:
        actual = user_func(m)
        passed = golf_equal(expected, actual)
        return (passed, expected, actual)
    except Exception as e:
        return (False, expected, f"Error: {e}")
