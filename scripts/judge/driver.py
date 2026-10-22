"""Run private grader code without importing contestant code."""
import runpy
import sys
from submission import SubmissionFailure

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)
try:
    runpy.run_path("main.py", run_name="__main__")
except SubmissionFailure:
    sys.exit(86)
