import sys
sys.path.insert(0, '/home/intgrah/git/cucats/golf-judge')
from grader_utils import golf_equal

def grade(user_func, test_input):
    """Grade list generation solution"""
    n, u, s = test_input

    try:
        result = user_func(n, u, s)

        # Check if result is a list
        if not isinstance(result, (list, tuple)):
            return (False, f"list with len={n}, unique={u}, sum={s}", f"Not a list: {type(result)}")

        # Check length
        if len(result) != n:
            return (False, f"list with len={n}, unique={u}, sum={s}", f"Wrong length: {len(result)} (expected {n})")

        # Check unique count
        unique_count = len(set(result))
        if unique_count != u:
            return (False, f"list with len={n}, unique={u}, sum={s}", f"Wrong unique count: {unique_count} (expected {u})")

        # Check sum
        total = sum(result)
        if total != s:
            return (False, f"list with len={n}, unique={u}, sum={s}", f"Wrong sum: {total} (expected {s})")

        return (True, f"Valid: len={n}, unique={u}, sum={s}", result)
    except Exception as e:
        return (False, f"list with len={n}, unique={u}, sum={s}", f"Error: {e}")
