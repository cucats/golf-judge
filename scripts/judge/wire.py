"""A data-only protocol: never deserialize executable Python objects."""
import base64
import json

LIMIT = 1 << 20


def pack(value):
    kind = type(value)
    if value is None or kind in (bool, str):
        return value
    if kind is int:
        return ["int", str(value)]
    if kind is float:
        return ["float", repr(value)]
    if kind is bytes:
        return ["bytes", base64.b64encode(value).decode("ascii")]
    if kind in (list, tuple, set, frozenset):
        return [kind.__name__, [pack(item) for item in value]]
    if kind is dict:
        return ["dict", [[pack(key), pack(item)] for key, item in value.items()]]
    raise TypeError("Return values must use Python's built-in data types")


def unpack(value, depth=0):
    if depth > 100:
        raise ValueError("Value nesting is too deep")
    if value is None or type(value) in (bool, str):
        return value
    if type(value) is not list or len(value) != 2:
        raise ValueError("Invalid value")
    kind, data = value
    if kind == "int" and type(data) is str:
        return int(data)
    if kind == "float" and type(data) is str:
        return float(data)
    if kind == "bytes" and type(data) is str:
        return base64.b64decode(data, validate=True)
    if type(data) is not list:
        raise ValueError("Invalid collection")
    if kind == "dict":
        return {unpack(k, depth + 1): unpack(v, depth + 1) for k, v in data}
    constructors = {"list": list, "tuple": tuple, "set": set, "frozenset": frozenset}
    if kind not in constructors:
        raise ValueError("Invalid type")
    return constructors[kind](unpack(item, depth + 1) for item in data)


def send(stream, value):
    message = json.dumps(value, ensure_ascii=True, separators=(",", ":")) + "\n"
    if len(message) > LIMIT:
        raise ValueError("Function arguments or return value exceed 1 MiB")
    stream.write(message)
    stream.flush()


def receive(stream):
    message = stream.readline(LIMIT + 1)
    if not message or len(message) > LIMIT or not message.endswith("\n"):
        raise ValueError("Invalid or oversized function response")
    return json.loads(message)
