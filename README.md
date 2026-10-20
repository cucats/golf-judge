# CUCaTS Code Golf

[![CI](https://github.com/intgrah/golf-judge/actions/workflows/ci.yml/badge.svg)](https://github.com/intgrah/golf-judge/actions/workflows/ci.yml)
![Rust](https://img.shields.io/badge/rust-1.90-orange.svg)

A code golf judge built with Rust. Admins build a bank of problems in the
username and password (the first login claims the username) and submit Python 3.13
solutions that are judged in an
[isolate](https://github.com/ioi/isolate) sandbox.

## Running locally

```sh
docker compose -f compose.dev.yml up --build
```

Open <http://localhost:3000>. Admin login is at `/admin/login` with password
`admin`. The dev compose file runs the app container privileged, because
isolate needs namespaces to sandbox submissions.

## Configuration

| Variable           | Default          | Purpose                                                          |
| ------------------ | ---------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`     | required         | Postgres connection string                                       |
| `ADMIN_PASSWORD`   | random, printed  | Password for `/admin/login`                                      |
| `PROBLEMS_DIR`     | `problems`       | Folders imported into the problem bank on startup (once each)    |
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

Folders in `problems/` (`statement.md`, `input.txt`, `output.txt`,
`grader.py`) are imported on startup. Problems edited in the UI are never
overwritten by the import.

## Tests

```sh
cargo test
```
