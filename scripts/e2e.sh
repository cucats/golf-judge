#!/usr/bin/env bash
# Smoke test against a FRESH dev stack (problem ids assume the default import):
#   docker compose -f compose.dev.yml down -v && docker compose -f compose.dev.yml up --build -d
#   ./scripts/e2e.sh
B=http://localhost:3000; A=$(mktemp); U=$(mktemp); V=$(mktemp)
code() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$@"; echo; }
echo "== admin login (wrong, right)"
curl -s -c $A -b $A -d 'username=admin&password=nope' $B/admin/login | rg -o 'Incorrect password'
code -c $A -b $A -d 'username=admin&password=admin' $B/admin/login
echo "== create 2 contests from the bank (Sum of Digits=8 first, Two Sum=4 second)"
code -c $A -b $A -d 'name=Round 1&duration=30&pos_8=1&pos_4=2' $B/admin/contests
code -c $A -b $A -d 'name=Round 2&duration=60&pos_1=1' $B/admin/contests
curl -s -b $A -d 'name=&duration=0' $B/admin/contests | rg -o 'Contest name is required'
echo "== contestant before start: waiting room; leaderboard hidden"
code -c $U -b $U -d 'username=alice&password=alicepw&next=/contest/1/join' $B/login
code -b $U $B/contest/1/join
code -b $U $B/contest/1/problems
code -b $U $B/contest/1/leaderboard
echo "== passwords: wrong one refused, too-short first password refused"
curl -s -d 'username=alice&password=wrong' $B/login | rg -o 'Incorrect password for this username'
curl -s -d 'username=carol&password=abc' $B/login | rg -o 'at least 4 characters'
echo "== open redirect blocked"
code -c $V -b $V -d 'username=bob&password=bobpw&next=https://evil.example' $B/login
echo "== start contest 1 (twice: second is a no-op)"
code -b $A -X POST $B/admin/contests/1/start
code -b $A -X POST $B/admin/contests/1/start
echo "== problem outside contest / nonexistent -> 404"
code -b $U $B/contest/1/problems/1
code -b $U $B/contest/1/problems/..%2F..%2Fetc
curl -s -b $U --data-urlencode 'code=f=lambda n:0' $B/contest/1/problems/1/submit; echo
echo "== submissions (real isolate judging)"
curl -s -b $U --data-urlencode 'code=f=lambda n:sum(sum(map(int,str(i)))for i in range(n+1))' $B/contest/1/problems/8/submit; echo
curl -s -b $V --data-urlencode 'code=f=lambda n:sum(map(int,"".join(map(str,range(n+1)))))' $B/contest/1/problems/8/submit; echo
curl -s -b $V --data-urlencode 'code=f=lambda n:n' $B/contest/1/problems/8/submit | head -c 300; echo
curl -s -b $V --data-urlencode 'code=f=lambda n:1/0' $B/contest/1/problems/8/submit | head -c 300; echo
curl -s -b $V --data-urlencode $'code=def f(n):\n while 1:pass' $B/contest/1/problems/8/submit | head -c 300; echo
curl -s -b $V --data-urlencode $'code=import os\nos.fork()\nf=lambda n:0' $B/contest/1/problems/8/submit | head -c 300; echo
echo "== CRLF counts as one byte (expect 56, not 57)"
curl -s -b $V --data-urlencode $'code=f=lambda n:sum(sum(map(int,str(i)))for i in range(n+1))\r\n' $B/contest/1/problems/8/submit | rg -o '"code_length":[0-9]+'
echo "== file size limit"
curl -s -b $V --data-urlencode $'code=open("x","w").write("a"*9**8)\nf=0' $B/contest/1/problems/8/submit | rg -o '"verdict":"[A-Z]+"'
echo "== 2 in flight per account (third refused), then 10 per minute"
D=$(mktemp); code -c $D -b $D -d 'username=dave&password=davepw' $B/login
slow=$'code=import time\ntime.sleep(1)\nf=lambda n:0'
for _ in 1 2 3; do curl -s -b $D --data-urlencode "$slow" $B/contest/1/problems/8/submit | rg -o '"verdict":"[A-Z]+"|2 submissions being judged' & done; wait
for _ in $(seq 9); do curl -s -b $D --data-urlencode 'code=f=lambda n:0' $B/contest/1/problems/8/submit | rg -o '"verdict":"[A-Z]+"|10 per minute'; done | sort | uniq -c
echo "== admin cannot submit"
curl -s -b $A --data-urlencode 'code=f=1' $B/contest/1/problems/8/submit; echo
echo "== leaderboard"
curl -s $B/api/contest/1/leaderboard; echo
echo "== admin test-run on problem editor, problem crud"
curl -s -b $A --data-urlencode 'code=f=lambda n:sum(sum(map(int,str(i)))for i in range(n+1))' $B/admin/problems/8/test; echo
code -b $A -X POST $B/admin/problems/8/duplicate
curl -s -b $A -X POST $B/admin/problems/8/delete | rg -o "can't be deleted"
code -b $A -X POST $B/admin/problems/9/delete
echo "== problem set locked after start; delete of active contest refused"
code -b $A -d 'name=Round 1 renamed&duration=45&pos_1=1' $B/admin/contests/1
curl -s -b $A $B/admin/contests/1 | rg -o 'Round 1 renamed|locked once' | sort -u
code -b $A -X POST $B/admin/contests/1/delete
curl -s -b $A $B/admin | rg -c 'Round 1 renamed'
echo "== end contest -> public read-only problems"
code -b $A -X POST $B/admin/contests/1/end
code $B/contest/1/problems
curl -s $B/contest/1/problems/8 | rg -o 'Contest has ended' | head -1
curl -s -b $U --data-urlencode 'code=f=1' $B/contest/1/problems/8/submit; echo
echo "== pages render (status codes)"
for p in / /login /admin /admin/problems /admin/problems/new /admin/problems/8 /admin/contests/new /admin/contests/1 /admin/contests/1/submissions /contest/1/leaderboard; do printf '%s ' $p; code -b $A $B$p; done
