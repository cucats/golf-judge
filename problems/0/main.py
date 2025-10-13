from submission import f

__t = int(input())
for __i in range(__t):
    __in = eval(input())
    if isinstance(__in, list):
        __out = f(*__in)
    else:
        __out = f(__in)
    print(repr(__out))
