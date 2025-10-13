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
    __h, __w, __n = map(int, input().split())
    __m = [[int(v) for v in input().split()] for _ in range(__h)]
    __out = f(__m, __n)
    __out = __normalise(__out)
    print(repr(__out))
