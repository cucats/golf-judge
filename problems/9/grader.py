from submission import f


def __normalise(obj):
    if isinstance(obj, bool):
        return int(obj)
    else:
        return obj


__t = int(input())
for __i in range(__t):
    __s = input()
    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {repr(__s)}\n")
    __out = f(__s)
    __out = __normalise(__out)
    print(__out)
