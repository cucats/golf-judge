"""Installed as submission.py only in the trusted grader's sandbox."""
import os
from wire import pack, unpack, send, receive

_requests = os.fdopen(3, "w", buffering=1)
_responses = os.fdopen(4, "r")


class SubmissionFailure(BaseException):
    def __init__(self, recoverable=False):
        self.recoverable = recoverable


def __getattr__(name):
    if name.startswith("__"):
        raise AttributeError(name)

    def call(*args, **kwargs):
        send(_requests, {"name": name, "args": pack(args), "kwargs": pack(kwargs)})
        try:
            response = receive(_responses)
            if type(response) is dict and "error" in response:
                raise SubmissionFailure(recoverable=True)
            if type(response) is not dict or "result" not in response:
                raise ValueError("Submission failed")
            return unpack(response["result"])
        except (ValueError, TypeError, KeyError, RecursionError, OverflowError, MemoryError):
            raise SubmissionFailure() from None

    return call
