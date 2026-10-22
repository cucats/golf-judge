"""Installed as submission.py only in the trusted grader's sandbox."""
import os
from wire import pack, unpack, send, receive

_requests = os.fdopen(3, "w", buffering=1)
_responses = os.fdopen(4, "r")
_case = 0
_values = []


class SubmissionFailure(BaseException):
    def __init__(self, recoverable=False):
        self.recoverable = recoverable


def _begin_case():
    global _case
    _case += 1
    _values.clear()


def _validate_results():
    if any(not value.checked for value in _values):
        raise SubmissionFailure(recoverable=True)


def _request(message):
    send(_requests, {**message, "case": _case})
    try:
        response = receive(_responses)
        if type(response) is dict and "error" in response:
            raise SubmissionFailure(recoverable=True)
        if type(response) is not dict or "result" not in response:
            raise ValueError("Submission failed")
        result = response["result"]
        if type(result) is list and len(result) == 2 and result[0] == "reference":
            if type(result[1]) is not int or result[1] < 1:
                raise ValueError("Invalid return value reference")
            value = _RemoteValue(result[1])
            _values.append(value)
            return value
        return unpack(result)
    except (ValueError, TypeError, KeyError, RecursionError, OverflowError, MemoryError):
        raise SubmissionFailure() from None


class _RemoteValue:
    """An opaque return value; its Python object stays in the contestant process."""
    def __init__(self, reference):
        self.reference = reference
        self.checked = False

    def __bool__(self):
        result = _request({"operation": "bool", "reference": self.reference})
        if type(result) is not bool:
            raise SubmissionFailure() from None
        self.checked = True
        return result


def __getattr__(name):
    if name.startswith("__"):
        raise AttributeError(name)

    def call(*args, **kwargs):
        return _request({"operation": "call", "name": name, "args": pack(args), "kwargs": pack(kwargs)})

    return call
