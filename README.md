# CUCaTS Code Golf

[![CI](https://github.com/intgrah/golf-judge/actions/workflows/ci.yml/badge.svg)](https://github.com/intgrah/golf-judge/actions/workflows/ci.yml)

A code golf judge built with SvelteKit 3, TypeScript, and Bun. Admins build a bank of problems in the
browser and assemble any number of contests from it; contestants log in with a
username and password (the first login claims the username) and submit Python
3.15 solutions that are judged in an [isolate](https://github.com/ioi/isolate)
sandbox.

## Running locally

```sh
docker compose -f compose.dev.yml up --build
```

Open <http://localhost:3000> and log in at `/login`.

For frontend development, install Bun 1.4.2 or newer, then run `bun install`,
`bun run migrate`, and `bun run dev` with `DATABASE_URL` set. Grading needs
Linux and the isolate/Python setup provided by the Docker image.

`bun run check` checks TypeScript and Svelte; `bun run build` builds the
production server. The Docker entrypoint applies pending SQL migrations
before starting the server. Existing databases keep their migration history.

Admins use the same account and password to participate in contests and
manage the site through `/admin`.

## Configuration

| Variable           | Default   | Purpose                                                          |
| ------------------ | --------- | ---------------------------------------------------------------- |
| `DATABASE_URL`     | required  | Postgres connection string                                       |
| `JUDGE_WORKERS`    | CPU count | Maximum submissions judged concurrently                         |
| `INSECURE_COOKIES` | unset     | Set to allow the session cookie over plain http (local dev only) |

## Problems

Each problem has a Markdown statement, a list of input/output pairs, a Python
grader, and time/memory limits. PostgreSQL derives the stored `test_count`
from that list. Grader and submission processes run in separate sandboxes
that are reused across the suite; submission state persists between cases.
The time limit covers the whole suite. The grader reads
that case's input on stdin, imports `f` from `submission`, calls it, and prints
the output for that case. Outputs may contain multiple lines or be empty.
Arguments and results cross
the sandbox boundary as built-in Python values; grader code and expected
answers stay outside the contestant's sandbox. For problems accepting any
truthy or falsy result, select that return value mode in the problem editor.

Each pair explicitly specifies whether it is public. Public failures show
input, expected output, and actual output; private failures hide those values
and exception messages. There is no count header or stderr marker protocol.
Put public examples in the statement too.

Submissions are queued in PostgreSQL before grading starts. Feedback updates
live, reconnects after a page reload, and unfinished jobs resume after a server
restart.

Problems are stored in PostgreSQL and managed through the admin problem bank.

## Tests

```sh
bun test
```
