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

| Variable           | Default              | Purpose                                                         |
| ------------------ | -------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`     | required             | Postgres connection string                                      |
| `JUDGE_WORKERS`    | CPU count            | Maximum submissions judged concurrently                         |
| `INSECURE_COOKIES` | unset                | Set to allow the session cookie over plain http (local dev only) |
| `SMTP_HOST`       | required for reset   | SMTP server hostname                                            |
| `SMTP_PORT`       | `587`                | SMTP port; 465 uses implicit TLS, other ports require STARTTLS    |
| `SMTP_USER`       | `noreply@cucats.org`  | SMTP account username                                           |
| `SMTP_PASSWORD`   | required for reset   | SMTP account password                                           |
| `SMTP_FROM`       | `noreply@cucats.org`  | Sender address                                                  |

Copy `.env.example` to `.env` and fill in the SMTP credentials. Docker Compose
passes these variables to the app; Bun also reads `.env` for local development.

Email is optional when creating an account and can be added, changed or removed
in Settings. Existing logins do not change the stored email. Each email belongs
to one account. On the login page, **Forgot** sends a six-character code to the
account's email address. Codes expire after ten minutes and allow five attempts;
requests are limited per email and IP address. A successful reset revokes old
sessions and logs the user in with the new password.

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
answers stay outside the contestant's sandbox. The grader defines how to
interpret the return value, including ordinary Python truthiness checks.

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

Database authentication tests run with `RUN_AUTH_TESTS=1 DATABASE_URL=... bun test
tests/password-reset.test.ts`. They create and remove a separate schema. CI runs
these tests against PostgreSQL.
