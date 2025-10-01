# judex

A simple and insecure Linux judging server for code golf competitions, made in Python (Flask), supporting Python submissions only.

Features:
- **Code Golf Scoring**: Lower byte count is better
- **Custom Grading Functions**: Each problem has a custom grader for flexible validation
- **Function-Based Submissions**: Submit Python functions, not stdin/stdout programs
- **Non-Sequential**: Solve problems in any order
- **Live Leaderboard**: Track problems solved and total code length

The server is intended to be run as a Docker container.

## Problem Format

Each problem in `problems/{i}/` requires:
- `problem.txt`: Title (first line) and description (supports ``` code blocks)
- `tests.json`: Array of test case inputs
- `grader.py`: Must export a `grade(user_func, test_input)` function that returns `(passed, expected, actual)`