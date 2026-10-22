"""Run the per-case grader in one private process for the whole submission."""
import io
import json
import sys
from submission import SubmissionFailure

with open("main.py") as source:
    code = compile(source.read(), "/box/main.py", "exec")

requests, responses = sys.stdin, sys.stdout
try:
    for message in requests:
        output = io.StringIO()
        sys.stdin = io.StringIO(json.loads(message))
        sys.stdout = output
        failed = False
        try:
            exec(code, {"__name__": "__main__", "__file__": "/box/main.py"})
        except SubmissionFailure as error:
            if not error.recoverable:
                raise
            failed = True
        finally:
            sys.stdin, sys.stdout = requests, responses
        responses.write(json.dumps({"output": output.getvalue(), "failed": failed}, ensure_ascii=True) + "\n")
        responses.flush()
except SubmissionFailure:
    sys.exit(86)
