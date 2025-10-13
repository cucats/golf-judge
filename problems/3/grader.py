from submission import f


__t = int(input())
for __i in range(__t):
    __n = int(input())
    __a = [int(v) for v in input().split()]
    __k = int(input())
    __out = f(__a, __k)
    print(__out)
