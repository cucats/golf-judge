from submission import f


def __normalise(obj):
    if isinstance(obj, bool):
        return int(obj)
    else:
        return obj


__t = int(input())
for __i in range(__t):
    __s = input()
    __out = f(__s)
    __out = __normalise(__out)
    print(__out)
