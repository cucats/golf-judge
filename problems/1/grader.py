from submission import f


def __normalise(obj):
    if isinstance(obj, tuple):
        return [__normalise(item) for item in obj]
    elif isinstance(obj, list):
        return [__normalise(item) for item in obj]
    else:
        return obj


__t = int(input())
for __i in range(__t):
    __line = input()
    __in = eval(__line)
    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {__in}\n")
    __out = f(__in)
    __out = __normalise(__out)
    print(repr(__out))
