import json
import time
import importlib.util

from secrets import token_urlsafe
from pathlib import Path
from flask import Flask, render_template, request, jsonify, redirect, url_for, session

from grade import grade

app = Flask(__name__, static_url_path="/static")

app.secret_key = token_urlsafe(16)
authtoken = token_urlsafe(16)
print(authtoken)

PROBLEM_TITLES = []
PROBLEM_TEXTS = []
PROBLEM_TEST_CASES = []
PROBLEM_GRADERS = []

DURATION = 1800
START_TIME = float("inf")

root = Path(__file__).parent

# Load problems
i = 0
while True:
    problem = root / "problems" / str(i)

    try:
        with open(problem / "problem.txt", "r") as f:
            txt = f.readlines()
            PROBLEM_TITLES.append(txt.pop(0)[:-1])
            PROBLEM_TEXTS.append("")

            inner = False
            j = 0
            while j < len(txt := "".join(txt).strip()):
                try:
                    if txt[j : j + 4] == "```\n" and not inner:
                        PROBLEM_TEXTS[-1] += '<pre class="code"><code>'
                        inner = True
                        j += 4
                    elif txt[j : j + 4] == "\n```" and inner:
                        PROBLEM_TEXTS[-1] += "</code></pre>"
                        inner = False
                        j += 4
                    else:
                        raise IndexError()
                except IndexError:
                    PROBLEM_TEXTS[-1] += txt[j]
                    j += 1

        # Load test cases from tests.json
        with open(problem / "tests.json", "r") as f:
            test_data = json.load(f)
            PROBLEM_TEST_CASES.append(test_data)

        # Load grader function from grader.py
        grader_path = problem / "grader.py"
        spec = importlib.util.spec_from_file_location(f"grader_{i}", grader_path)
        grader_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(grader_module)
        PROBLEM_GRADERS.append(grader_module.grade)

        i += 1

    except FileNotFoundError:
        break

NUM_PROBLEMS = i
scores = {}  # {username: {problem_id: (code_length, verdict)}}


@app.route("/")
def home():
    if session.get("admin"):
        return redirect(url_for("admin"))
    else:
        return redirect(url_for("problems"))


@app.route("/problems")
def problems():
    if "username" not in session:
        return redirect(url_for("login"))
    elif START_TIME > float("inf"):
        return redirect(url_for("waiting_room"))

    # Show list of all problems with their status
    user_scores = scores.get(session["username"], {})
    problem_list = []
    for i in range(NUM_PROBLEMS):
        status = "unsolved"
        code_length = None
        if i in user_scores:
            code_length, verdict = user_scores[i]
            if verdict == "AC":
                status = "solved"
        problem_list.append({
            "id": i,
            "title": PROBLEM_TITLES[i],
            "status": status,
            "code_length": code_length
        })

    return render_template("problems.html", problems=problem_list)


@app.route("/problem/<int:problem_id>", methods=["GET", "POST"])
def problem(problem_id):
    if "username" not in session:
        return redirect(url_for("login"))
    elif START_TIME > float("inf"):
        return redirect(url_for("waiting_room"))

    if problem_id >= NUM_PROBLEMS or problem_id < 0:
        return redirect(url_for("problems"))

    user_input = ""
    output = "Output shows up here!"

    match request.method:
        case "POST":
            user_input = request.form["user_input"]

            with open("submissions.json", "r") as f:
                submissions = json.load(f)
                while (id := token_urlsafe(16)) in submissions:
                    pass

            code_dir = root / "submissions"
            if not code_dir.exists():
                code_dir.mkdir()
            code_path = code_dir / (id + ".py")
            with open(code_path, "w+") as f:
                f.write(user_input)

            verdict, output, code_length = grade(
                code_path,
                PROBLEM_TEST_CASES[problem_id],
                PROBLEM_GRADERS[problem_id]
            )

            # Update score if AC or if this is a better (shorter) solution
            if verdict == "AC":
                if problem_id not in scores[session["username"]]:
                    scores[session["username"]][problem_id] = (code_length, verdict)
                else:
                    old_length, _ = scores[session["username"]][problem_id]
                    if code_length < old_length:
                        scores[session["username"]][problem_id] = (code_length, verdict)

            submissions[id] = {
                "username": session["username"],
                "problem": problem_id,
                "verdict": verdict,
                "code_length": code_length,
                "time": time.time() - START_TIME,
            }

            with open("submissions.json", "w") as f:
                json.dump(submissions, f, indent=4)

    return render_template(
        "problem.html",
        problem_id=problem_id,
        title=PROBLEM_TITLES[problem_id],
        statement=PROBLEM_TEXTS[problem_id],
        content=user_input,
        output=output,
    )


@app.route("/get_scores")
def get_scores():
    # Return {username: [problems_solved, total_code_length]}
    result = {}
    for user, user_scores in scores.items():
        solved = sum(1 for _, verdict in user_scores.values() if verdict == "AC")
        total_length = sum(length for length, verdict in user_scores.values() if verdict == "AC")
        result[user] = [solved, total_length]
    return jsonify(result)


@app.route("/get_submissions")
def get_submissions():
    if session.get("admin"):
        with open("submissions.json", "r") as f:
            submissions = json.load(f)
            for id, s in submissions.items():
                with open(root / "submissions" / (id + ".py"), "r") as f:
                    s["code"] = f.read()
        return jsonify(submissions)
    else:
        return "", 403


@app.route("/leaderboard", methods=["GET", "POST"])
def leaderboard():
    match request.method:
        case "POST":
            if admin:
                del scores[list(request.form.keys())[0]]

    return render_template(
        "leaderboard.html",
        extra_content=request.args.get("extra_content") or "",
        admin=admin,
    )


@app.route("/admin", methods=["POST", "GET"])
def admin():
    if session.get("admin"):
        global START_TIME
        match request.method:
            case "POST":
                START_TIME = time.time()
                return redirect(url_for("leaderboard"))

            case "GET":
                if START_TIME < float("inf"):
                    return render_template("submissions.html")
                else:
                    return render_template("start.html")

    else:
        return "", 403


@app.route("/auth")
def auth():
    if session.get("admin"):
        return "1"
    else:
        return "0"


@app.route("/login", methods=["POST", "GET"])
def login():
    match request.method:
        case "POST":
            username = request.form["user_input"]
            if username not in scores:
                session["username"] = username
                scores[username] = {}
                return redirect(url_for("waiting_room"))
            else:
                return render_template(
                    "login.html",
                    extra_content="That username is already taken, try again!",
                )
        case "GET":
            return render_template(
                "login.html", extra_content=request.args.get("extra_content") or ""
            )


@app.route("/waiting_room")
def waiting_room():
    if "username" not in session:
        return redirect(url_for("login"))

    return render_template("waiting_room.html", username=session["username"])


@app.route("/get_begun")
def get_begun():
    return str(int(START_TIME < float("inf")))


@app.route("/get_time")
def get_time():
    return str(int(DURATION + START_TIME - time.time()))


@app.route("/get_valid_username")
def get_valid_username():
    if session.get("username") in scores and time.time() < START_TIME + DURATION:
        return "0"
    elif session.get("username") not in scores:
        return "1"
    else:
        return "2"


@app.route(f"/{authtoken}")
def authtoken():
    session["admin"] = True
    return redirect(url_for("home"))


if __name__ == "__main__":
    app.run(host="0.0.0.0")
