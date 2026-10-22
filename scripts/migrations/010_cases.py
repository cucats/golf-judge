"""One-time conversion of the two historical batch-grader formats."""
import ast
import json
import sys


def marker(node):
    return any((isinstance(n, ast.Constant) and isinstance(n.value, str) and "TESTCASE " in n.value) or (isinstance(n, ast.Attribute) and n.attr == "stderr" and isinstance(n.value, ast.Name) and n.value.id == "sys") for n in ast.walk(node))


def calls_f(node):
    return any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "f" for n in ast.walk(node))


def convert(problem):
    tree = ast.parse(problem["grader"])
    loops = [node for node in tree.body if isinstance(node, ast.For) and calls_f(node)]
    if len(loops) != 1:
        if not problem["test_input"].strip() and not problem["test_output"].strip():
            return {"test_cases": [], "grader": problem["grader"]}
        raise ValueError(f"Problem {problem['id']}: expected one batch loop; convert this grader explicitly")
    loop = loops[0]
    helpers = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.ClassDef))]
    body = [node for node in loop.body if not marker(node)]
    outputs = problem["test_output"].strip().splitlines()
    inputs = []
    if isinstance(loop.iter, ast.Call) and isinstance(loop.iter.func, ast.Name) and loop.iter.func.id == "range":
        count_name = loop.iter.args[0].id if len(loop.iter.args) == 1 and isinstance(loop.iter.args[0], ast.Name) else None
        for node in tree.body:
            if node in helpers or node is loop:
                continue
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id == count_name:
                continue
            raise ValueError(f"Problem {problem['id']}: unsupported batch setup; convert this grader explicitly")
        loop_names = {node.id for node in ast.walk(loop.target) if isinstance(node, ast.Name)}
        if any(isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in loop_names for statement in body for node in ast.walk(statement)):
            raise ValueError("Per-case grader depends on the old test index")
        lines = problem["test_input"].splitlines(keepends=True)
        if not lines or int(lines[0]) != len(outputs):
            raise ValueError(f"Problem {problem['id']}: count/input/output mismatch")
        parser = []
        for node in body:
            if calls_f(node):
                break
            if not isinstance(node, ast.Assign):
                raise ValueError("Unsupported input parser")
            parser.append(node)
        # Only evaluate the old input parser, never the grader or submitted code.
        for node in ast.walk(ast.Module(body=parser, type_ignores=[])):
            if isinstance(node, ast.Call):
                fn = node.func
                if isinstance(fn, ast.Name) and fn.id in {"input", "int", "map", "range", "eval"}:
                    continue
                if isinstance(fn, ast.Attribute) and fn.attr == "split":
                    continue
                if isinstance(fn, ast.Attribute) and fn.attr == "loads" and isinstance(fn.value, ast.Name) and fn.value.id == "json":
                    continue
                raise ValueError("Unsupported input parser call")
            if isinstance(node, ast.Attribute) and node.attr not in {"split", "loads"}:
                raise ValueError("Unsupported input parser attribute")
            if isinstance(node, (ast.Lambda, ast.NamedExpr, ast.Await, ast.Yield, ast.YieldFrom)):
                raise ValueError("Unsupported input parser expression")
        parser_code = compile(ast.Module(body=parser, type_ignores=[]), "<case parser>", "exec")
        offset = 1
        def read():
            nonlocal offset
            if offset >= len(lines):
                raise ValueError("Missing test input")
            line = lines[offset]
            offset += 1
            return line.rstrip("\r\n")
        for _ in outputs:
            start = offset
            env = {"__builtins__": {}, "input": read, "int": int, "map": map, "range": range, "eval": ast.literal_eval, "json": json}
            exec(parser_code, env)
            if start == offset:
                raise ValueError("Grader does not read a case")
            inputs.append("".join(lines[start:offset]))
        if any(line.strip() for line in lines[offset:]):
            raise ValueError("Unconsumed test input")
    elif isinstance(loop.iter, ast.Call) and isinstance(loop.iter.func, ast.Name) and loop.iter.func.id == "enumerate":
        inputs = [line + "\n" for line in problem["test_input"].splitlines() if line.strip()]
        if len(inputs) != len(outputs):
            raise ValueError("Input/output pair count mismatch")
        argument = loop.target.elts[1].id
        for value in inputs:
            json.loads(value)
        transformed = []
        for node in body:
            if not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Attribute) and isinstance(node.value.func.value, ast.Name) and node.value.func.value.id == "__judged" and node.value.func.attr == "write"):
                raise ValueError("Unsupported JSON-lines grader")
            node.value.func = ast.parse("sys.stdout.write", mode="eval").body
            transformed.append(node)
        body = ast.parse(f"{argument} = json.loads(input())").body + transformed
    else:
        raise ValueError("Unsupported batch grader")
    grader = ast.unparse(ast.fix_missing_locations(ast.Module(body=helpers + body, type_ignores=[]))) + "\n"
    return {"test_cases": [{"input": value, "output": output, "public": i < problem["public_test_count"]} for i, (value, output) in enumerate(zip(inputs, outputs))], "grader": grader}


if __name__ == "__main__":
    print(json.dumps([convert(problem) for problem in json.load(sys.stdin)]))
