from submission import f


__t = int(input())
for __i in range(__t):
    __line = input()
    __in = eval(__line)
    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {__in}\n")
    # Handle both single args and multiple args
    if isinstance(__in, list) and len(__in) > 1:
        __out = f(*__in)
    elif isinstance(__in, list) and len(__in) == 1:
        __out = f(__in[0])
    else:
        __out = f(__in)
    print(repr(__out))
