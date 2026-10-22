| Before                                        | After                                                        |
| --------------------------------------------- | ------------------------------------------------------------ |
| `def f(x):return x`                           | `f=lambda x:x`                                               |
| `return [x]`, `else [x]`, `) for`             | `return[x]`, `else[x]`, `)for`                               |
| `list(a)`                                     | `[*a]`                                                       |
| `set(a)`                                      | `{*a}`                                                       |
| `tuple(a)`                                    | `(*a,)`                                                      |
| `True`, `False`                               | `1`, `0`                                                     |
| `a if c else b`                               | `c and a or b` (assuming `bool(a)==True`)                    |
| `a if c else b`                               | `[b,a][c]` (assuming `a`, `b` pure, `c in {0,1,False,True}`) |
| `a if a else b`                               | `a or b`                                                     |
| `b if a else a`                               | `a and b`                                                    |
| `a if c else 0`                               | `a*c` (assuming `c in {0,1,False,True}`)                     |
| `"a" if c else ""`                            | `"a"*c` (assuming `c in {0,1,False,True}`)                   |
| `[0 for _ in range(n)]`                       | `[0]*n`                                                      |
| `a[len(a)-1]`                                 | `a[-1]`                                                      |
| `a[0:3]`                                      | `a[:3]`                                                      |
| `a[2:len(a)]`                                 | `a[2:]`                                                      |
| `a!=[]and x==a[0]`                            | `a[:1]==[x]`                                                 |
| `a<b and b<c`                                 | `a<b<c`                                                      |
| `a==b and c==d`                               | `a==b!=c==d` (assuming `b!=c`)                               |
| `1 for`, `2 if`, `3 and`                      | `1for`, `2if`, `3and`                                        |
| `list(reversed(a))`                           | `a[::-1]`                                                    |
| `x==0`                                        | `x<1` (assuming `x>=0`)                                      |
| `s!=""`                                       | `s>""`                                                       |
| `6+int(True)`                                 | `6+True`                                                     |
| `[f(x)for x in a]`                            | `[*map(f,a)]`                                                |
| `[y for x in a for y in x]`                   | `[*x for x in a]`                                            |
| `a[-1-i]`                                     | `a[~i]`                                                      |
| `for _ in range(len(a))`                      | `for _ in a`                                                 |
| `(sum(a)+s)%n`                                | `sum(a,s)%n`                                                 |
| `[[r[i]for r in a]for i in range(len(a[0]))]` | `[*zip(*a)]`                                                 |
| `sum(x==v for x in a)`                        | `a.count(v)`                                                 |
| `a=0;b=0`                                     | `a=b=0`                                                      |
| `a.append(x)`                                 | `a+=x,`                                                      |
| `a=(x,y)`                                     | `a=x,y`                                                      |
| `sum([e for x in a])`                         | `sum(e for x in a)`                                          |
