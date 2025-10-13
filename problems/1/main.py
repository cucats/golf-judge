from submission import f

__t = int(input())
for __i in range(__t):
    __h, __w = map(int, input().split())
    __m = [[int(v) for v in input().split()] for _ in range(__h)]
    __out = f(__m)
    print(repr(__out))
