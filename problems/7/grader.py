from submission import f


__t = int(input())
for __i in range(__t):
    __n = int(input())
    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {__n}\n")
    __out = f(__n)
    print(__out)
