import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade two-sum solution"""
    arr, k = test_input

    # Check if any two different elements sum to k
    expected = False
    for i in range(len(arr)):
        for j in range(len(arr)):
            if i != j and arr[i] + arr[j] == k:
                expected = True
                break
        if expected:
            break

    try:
        actual = user_func(arr, k)
        passed = golf_equal(expected, actual)
        return (passed, int(expected), actual)
    except Exception as e:
        return (False, int(expected), f"Error: {e}")
