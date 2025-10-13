from submission import f


def __normalise(obj):
    if isinstance(obj, bool):
        return int(obj)
    else:
        return obj


__t = int(input())
for __i in range(__t):
    __n = int(input())
    __a = [int(v) for v in input().split()]
    __k = int(input())
    __out = f(__a, __k)
    __out = __normalise(__out)
    print(__out)
