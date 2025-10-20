from submission import f


def normalize(obj):
    if isinstance(obj, tuple):
        return list(obj)
    else:
        return obj


__t = int(input())
for __i in range(__t):
    __n, __u, __s = map(int, input().split())
    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {__n} {__u} {__s}\n")
    __out = f(__n, __u, __s)
    __out = normalize(__out)
    print(len(__out), len(set(__out)), sum(__out))
