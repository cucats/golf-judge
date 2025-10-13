from submission import f


__t = int(input())
for __i in range(__t):
    __n = int(input())
    __a = [int(v) for v in input().split()]
    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {__a}\n")
    __out = f(__a)
    print(__out)
