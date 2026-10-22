# CUCaTS Code Golf

[![CI](https://github.com/intgrah/golf-judge/actions/workflows/ci.yml/badge.svg)](https://github.com/intgrah/golf-judge/actions/workflows/ci.yml)
![Rust](https://img.shields.io/badge/rust-1.90-orange.svg)

A code golf judge built with Rust. Admins build a bank of problems in the
browser and assemble any number of contests from it; contestants log in with a
username and password (the first login claims the username) and submit Python
3.15 solutions that are judged in an [isolate](https://github.com/ioi/isolate)
sandbox.

## Running locally

```sh
docker compose -f compose.dev.yml up --build
```

Open <http://localhost:3000> and log in at `/login`.

Admins use the same account and password to participate in contests and
manage the site through `/admin`.

## Configuration

| Variable           | Default          | Purpose                                                          |
| ------------------ | ---------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`     | required         | Postgres connection string                                       |
| `JUDGE_WORKERS`    | CPU count        | Maximum submissions judged concurrently                          |
| `INSECURE_COOKIES` | unset            | Set to allow the session cookie over plain http (local dev only) |

## Problems

Each problem has a Markdown statement, test input, expected output, a Python
grader, and time/memory limits. The contestant's code is saved as
`submission.py`; the grader runs as `main.py`, reads the test input on stdin,
calls `f` for each case and prints one line per case. Output is compared line
by line with the expected output. Before each case the grader should write
`TESTCASE n: <description>` to stderr so contestants can see which case
failed.

Problems are stored in PostgreSQL and managed through the admin problem bank.

## Tests

```sh
cargo test
```
