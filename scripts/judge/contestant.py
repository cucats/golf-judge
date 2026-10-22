"""Public function runner; no tests, expected answers, or grader live here."""
import os
import sys
from wire import pack, unpack, send, receive

_requests = os.fdopen(3, "r")
_responses = os.fdopen(4, "w", buffering=1)


def failure(error):
    line = None
    column = None
    if isinstance(error, SyntaxError) and error.filename == "/box/submission.py":
        line, column = error.lineno, error.offset
    trace = error.__traceback__
    while trace is not None:
        if trace.tb_frame.f_code.co_filename == "/box/submission.py":
            line = trace.tb_lineno
        trace = trace.tb_next
    # The host sanitizes all of this; contestant code can tamper with this runner.
    return {"error": {"kind": type(error).__name__, "message": str(error)[:4096], "line": line, "column": column}}


load_error = None
try:
    import submission
except BaseException as error:
    load_error = failure(error)

while True:
    try:
        request = receive(_requests)
    except ValueError:
        break
    try:
        if load_error is not None:
            send(_responses, load_error)
            continue
        result = getattr(submission, request["name"])(*unpack(request["args"]), **unpack(request["kwargs"]))
        send(_responses, {"result": pack(bool(result) if sys.argv[1:] == ["truthy"] else result)})
    except BaseException as error:
        send(_responses, failure(error))
