import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade find missing number solution"""
    lst = test_input[0]

    # Find the missing number using XOR
    # XOR all numbers in the list and all numbers in the expected range
    min_val = min(lst)
    max_val = max(lst)

    # The range should have (max_val - min_val + 1) elements
    # But the list has one fewer
    expected_xor = 0
    for i in range(min_val, max_val + 2):
        expected_xor ^= i

    actual_xor = 0
    for num in lst:
        actual_xor ^= num

    # The missing number
    expected = expected_xor ^ actual_xor

    try:
        actual = user_func(lst)
        passed = golf_equal(expected, actual)
        return (passed, expected, actual)
    except Exception as e:
        return (False, expected, f"Error: {e}")
