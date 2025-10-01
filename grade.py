import sys
import io
import resource
import traceback
from contextlib import redirect_stdout, redirect_stderr


def limit(time=1, mem=64, proc=10):
    resource.setrlimit(resource.RLIMIT_CPU, (time + 1, resource.RLIM_INFINITY))
    resource.setrlimit(resource.RLIMIT_AS, (mem * 1024 * 1024, resource.RLIM_INFINITY))
    resource.setrlimit(resource.RLIMIT_NPROC, (proc, resource.RLIM_INFINITY))


def grade(code_path, test_cases, grader_func, limits=(1, 64, 10)):
    """
    Grade a Python function submission for code golf.

    Args:
        code_path: Path to the submitted Python file
        test_cases: List of test case inputs
        grader_func: Function that takes (user_func, test_input) and returns (passed, expected, actual)
        limits: Resource limits (time, mem, proc)

    Returns:
        (verdict, output, code_length) tuple
    """
    verdict = None
    output = ""

    # Read the code and get its length
    with open(code_path, "r") as f:
        user_code = f.read()
    code_length = len(user_code)

    # Try to import the user's function
    try:
        # Create a namespace for the user's code
        user_namespace = {}
        exec(user_code, user_namespace)

        # Find the first function defined in the user's code
        user_func = None
        for name, obj in user_namespace.items():
            if callable(obj) and not name.startswith("_"):
                user_func = obj
                break

        if user_func is None:
            verdict = "CE"
            output = "No function found in your submission. Please define a function."
            return verdict, output, code_length

    except Exception as e:
        verdict = "CE"
        output = f"Syntax/Import Error:\n{traceback.format_exc()}"
        return verdict, output, code_length

    # Test the function against all test cases
    for i, test_input in enumerate(test_cases):
        try:
            # Capture stdout/stderr
            stdout_capture = io.StringIO()
            stderr_capture = io.StringIO()

            with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                # Run the grading function
                passed, expected, actual = grader_func(user_func, test_input)

            if not passed:
                verdict = f"WA{i}"
                output = f"Wrong answer on testcase {i + 1}:\n"
                output += f"Input: {test_input}\n"
                output += f"Expected: {expected}\n"
                output += f"Got: {actual}\n"

                # Include any stdout/stderr if present
                if stdout_capture.getvalue():
                    output += f"\nStdout: {stdout_capture.getvalue()}\n"
                if stderr_capture.getvalue():
                    output += f"\nStderr: {stderr_capture.getvalue()}\n"
                break

        except TimeoutError:
            verdict = f"TLE{i}"
            output = f"Time limit exceeded on testcase {i + 1}"
            break

        except Exception as e:
            verdict = f"RE{i}"
            output = f"Runtime error on testcase {i + 1}:\n"
            output += f"Input: {test_input}\n"
            output += f"{traceback.format_exc()}"
            break

    else:
        verdict = "AC"
        output = f"Congratulations! All tests passed.\nCode length: {code_length} bytes"

    if len(output) > 2000:
        output = output[:2000]
        output += "...\nOutput was truncated for exceeding 2000 characters."

    return verdict, output, code_length
