def golf_equal(expected, actual):
    """
    Compare expected and actual values with flexible type handling.

    Rules:
    - Booleans, integers, and floats are compared numerically
    - Tuples and lists are interchangeable (compared recursively)
    - Other iterables are not allowed
    """
    # Normalize tuples to lists recursively
    def normalize(obj):
        if isinstance(obj, tuple):
            return [normalize(item) for item in obj]
        elif isinstance(obj, list):
            return [normalize(item) for item in obj]
        elif isinstance(obj, (bool, int, float)):
            return float(obj)
        else:
            return obj

    return normalize(expected) == normalize(actual)
