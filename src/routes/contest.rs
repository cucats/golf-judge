use askama::Template;
use axum::{
    Form, Json,
    extract::{Path, State},
    response::{IntoResponse, Redirect, Response},
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use tower_sessions::Session;

use super::{AppResult, Viewer, login_redirect, not_found, render};
use crate::{
    leaderboard::{self, Leaderboard},
    markdown,
    models::{Contest, order_label},
    problems,
    runner::{self, Limits},
    session::{self, SessionUser},
    state::AppState,
};

const MAX_CODE_BYTES: usize = 10240;

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    viewer: Viewer,
    active: Vec<Contest>,
    upcoming: Vec<Contest>,
    past: Vec<Contest>,
}

pub async fn index(State(state): State<AppState>, session: Session) -> AppResult {
    let contests = sqlx::query_as::<_, Contest>(
        "SELECT * FROM contests ORDER BY COALESCE(start_time, created_at) DESC",
    )
    .fetch_all(&state.db)
    .await?;
    let user = session::get_user(&session).await;

    let (mut active, mut upcoming, mut past) = (Vec::new(), Vec::new(), Vec::new());
    for contest in contests {
        if contest.is_pending() {
            upcoming.push(contest);
        } else if contest.is_ended() {
            past.push(contest);
        } else {
            active.push(contest);
        }
    }
    render(IndexTemplate {
        viewer: Viewer::from(user.as_ref()),
        active,
        upcoming,
        past,
    })
}

async fn record_participant(state: &AppState, contest_id: i32, user: &SessionUser) {
    if user.is_admin {
        return;
    }
    let _ = sqlx::query(
        "INSERT INTO contest_participants (contest_id, username, joined_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(contest_id)
    .bind(&user.username)
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.db)
    .await;
}

pub async fn contest_join(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    if contest.is_ended() {
        return Ok(Redirect::to(&format!("/contest/{contest_id}/leaderboard")).into_response());
    }
    let Some(user) = session::get_user(&session).await else {
        return Ok(login_redirect(&format!("/contest/{contest_id}/join")));
    };
    record_participant(&state, contest_id, &user).await;

    let next = if contest.is_pending() {
        "waiting"
    } else {
        "problems"
    };
    Ok(Redirect::to(&format!("/contest/{contest_id}/{next}")).into_response())
}

#[derive(Template)]
#[template(path = "contest/waiting.html")]
struct WaitingTemplate {
    viewer: Viewer,
    contest: Contest,
    problem_count: usize,
}

pub async fn contest_waiting(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    if !contest.is_pending() {
        return Ok(Redirect::to(&format!("/contest/{contest_id}/problems")).into_response());
    }
    let Some(user) = session::get_user(&session).await else {
        return Ok(login_redirect(&format!("/contest/{contest_id}/waiting")));
    };
    let problem_count = problems::for_contest(&state.db, contest_id).await?.len();
    render(WaitingTemplate {
        viewer: Viewer::from(Some(&user)),
        contest,
        problem_count,
    })
}

/// Who may see a contest's problems right now: anyone once it has ended,
/// logged-in users while it runs, and admins (as a preview) before it starts.
async fn check_problem_access(
    contest: &Contest,
    session: &Session,
    path: &str,
) -> Result<Option<SessionUser>, Response> {
    let user = session::get_user(session).await;
    if contest.is_ended() {
        return Ok(user);
    }
    let Some(user) = user else {
        return Err(login_redirect(path));
    };
    if contest.is_pending() && !user.is_admin {
        return Err(Redirect::to(&format!("/contest/{}/waiting", contest.id)).into_response());
    }
    Ok(Some(user))
}

#[derive(Serialize)]
struct ProblemListItem {
    id: i32,
    label: String,
    title: String,
    solved: bool,
    best_bytes: Option<i32>,
    attempts: i64,
}

#[derive(Template)]
#[template(path = "contest/problems.html")]
struct ProblemsTemplate {
    viewer: Viewer,
    contest: Contest,
    problems: Vec<ProblemListItem>,
    time_remaining: Option<i64>,
    accepting: bool,
}

pub async fn contest_problems(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    let user = match check_problem_access(
        &contest,
        &session,
        &format!("/contest/{contest_id}/problems"),
    )
    .await
    {
        Ok(user) => user,
        Err(response) => return Ok(response),
    };

    let mut progress: HashMap<i32, (bool, Option<i32>, i64)> = HashMap::new();
    if let Some(user) = &user {
        let rows: Vec<(i32, bool, Option<i32>, i64)> = sqlx::query_as(
            "SELECT problem_id, BOOL_OR(verdict = 'AC'), MIN(code_length) FILTER (WHERE verdict = 'AC'), COUNT(*) FILTER (WHERE verdict <> 'SE')
             FROM submissions WHERE contest_id = $1 AND username = $2
             GROUP BY problem_id",
        )
        .bind(contest_id)
        .bind(&user.username)
        .fetch_all(&state.db)
        .await?;
        progress = rows
            .into_iter()
            .map(|(pid, solved, best, attempts)| (pid, (solved, best, attempts)))
            .collect();
    }

    let problems = problems::for_contest(&state.db, contest_id)
        .await?
        .into_iter()
        .map(|p| {
            let (solved, best_bytes, attempts) = progress.get(&p.id).copied().unwrap_or_default();
            ProblemListItem {
                label: p.label(),
                id: p.id,
                title: p.title,
                solved,
                best_bytes,
                attempts,
            }
        })
        .collect();

    render(ProblemsTemplate {
        viewer: Viewer::from(user.as_ref()),
        time_remaining: contest.time_remaining().filter(|_| !contest.is_ended()),
        accepting: contest.is_accepting_submissions(),
        contest,
        problems,
    })
}

#[derive(Template)]
#[template(path = "contest/problem.html")]
struct ProblemPageTemplate {
    viewer: Viewer,
    contest: Contest,
    problem_id: i32,
    label: String,
    title: String,
    statement_html: String,
    time_limit_ms: i32,
    memory_limit_mb: i32,
    time_remaining: Option<i64>,
    best_bytes: Option<i32>,
    /// None when the viewer may submit, otherwise why not
    submit_blocked: Option<String>,
}

pub async fn contest_problem(
    Path((contest_id, problem_id)): Path<(i32, i32)>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    let path = format!("/contest/{contest_id}/problems/{problem_id}");
    let user = match check_problem_access(&contest, &session, &path).await {
        Ok(user) => user,
        Err(response) => return Ok(response),
    };
    let Some((problem, order)) =
        problems::get_in_contest(&state.db, contest_id, problem_id).await?
    else {
        return Ok(not_found());
    };

    let best_bytes: Option<i32> = match &user {
        Some(user) => {
            sqlx::query_scalar(
                "SELECT MIN(code_length) FROM submissions
                 WHERE contest_id = $1 AND problem_id = $2 AND username = $3 AND verdict = 'AC'",
            )
            .bind(contest_id)
            .bind(problem_id)
            .bind(&user.username)
            .fetch_one(&state.db)
            .await?
        }
        None => None,
    };

    let submit_blocked = submit_blocked_reason(&contest, user.as_ref());
    render(ProblemPageTemplate {
        viewer: Viewer::from(user.as_ref()),
        problem_id,
        label: order_label(order),
        title: problem.title.clone(),
        statement_html: markdown::render_markdown(&problem.statement),
        time_limit_ms: problem.time_limit_ms,
        memory_limit_mb: problem.memory_limit_mb(),
        time_remaining: contest.time_remaining().filter(|_| !contest.is_ended()),
        best_bytes,
        submit_blocked,
        contest,
    })
}

fn submit_blocked_reason(contest: &Contest, user: Option<&SessionUser>) -> Option<String> {
    if contest.is_pending() {
        Some("Contest has not started".into())
    } else if !contest.is_accepting_submissions() {
        Some("Contest has ended".into())
    } else if user.is_none() {
        Some("Log in to submit".into())
    } else if user.is_some_and(|u| u.is_admin) {
        Some("Admins can test solutions from the problem editor".into())
    } else {
        None
    }
}

#[derive(Deserialize)]
pub struct SubmitForm {
    code: String,
}

impl SubmitForm {
    /// Windows line endings count as one byte, the same as on every other platform
    pub fn code(&self) -> String {
        self.code.replace("\r\n", "\n")
    }
}

#[derive(Serialize)]
pub struct SubmitResponse {
    pub verdict: String,
    pub code_length: i32,
    pub time: i32,
    pub output: String,
}

impl SubmitResponse {
    pub fn error(message: impl Into<String>) -> Response {
        Json(Self {
            verdict: "ERROR".into(),
            code_length: 0,
            time: 0,
            output: message.into(),
        })
        .into_response()
    }
}

const MAX_IN_FLIGHT_PER_USER: usize = 2;
const MAX_SUBMISSIONS_PER_WINDOW: usize = 10;
const SUBMISSION_WINDOW: Duration = Duration::from_secs(60);
/// Submissions allowed to wait for a box, per box, before new ones are refused
const QUEUE_PER_WORKER: usize = 4;

/// Per-user and global limits on submissions being judged, so one account (or
/// many) can't queue unbounded work
#[derive(Default)]
struct Admission {
    in_flight: HashMap<String, usize>,
    recent: HashMap<String, VecDeque<Instant>>,
    total_in_flight: usize,
}

static ADMISSION: LazyLock<Mutex<Admission>> = LazyLock::new(Default::default);

struct JudgingGuard(String);

impl JudgingGuard {
    fn try_acquire(username: &str) -> Result<Self, &'static str> {
        let mut admission = ADMISSION.lock().unwrap();
        let now = Instant::now();
        admission
            .recent
            .retain(|_, times| times.back().is_some_and(|&t| now - t < SUBMISSION_WINDOW));

        if admission.total_in_flight >= runner::workers() * QUEUE_PER_WORKER {
            return Err("The judge is busy; please try again in a few seconds");
        }
        if admission.in_flight.get(username).copied().unwrap_or(0) >= MAX_IN_FLIGHT_PER_USER {
            return Err("You already have 2 submissions being judged");
        }
        let times = admission.recent.entry(username.to_string()).or_default();
        while times.front().is_some_and(|&t| now - t >= SUBMISSION_WINDOW) {
            times.pop_front();
        }
        if times.len() >= MAX_SUBMISSIONS_PER_WINDOW {
            return Err("Too many submissions; you can submit 10 per minute");
        }
        times.push_back(now);
        *admission.in_flight.entry(username.to_string()).or_default() += 1;
        admission.total_in_flight += 1;
        Ok(Self(username.to_string()))
    }
}

impl Drop for JudgingGuard {
    fn drop(&mut self) {
        let mut admission = ADMISSION.lock().unwrap();
        admission.total_in_flight -= 1;
        if let Some(count) = admission.in_flight.get_mut(&self.0) {
            *count -= 1;
            if *count == 0 {
                admission.in_flight.remove(&self.0);
            }
        }
    }
}

/// Run code against a problem, returning the judge result or a user-facing error
pub async fn run_judge(
    problem: &crate::models::Problem,
    code: &str,
) -> Result<runner::RunResult, String> {
    if code.len() > MAX_CODE_BYTES {
        return Err(format!(
            "Code too long: {} bytes (max {MAX_CODE_BYTES} bytes)",
            code.len()
        ));
    }
    if code.trim().is_empty() {
        return Err("Code is empty".into());
    }
    if problem.test_output.trim().is_empty() || problem.grader.trim().is_empty() {
        return Err("This problem has no tests or grader yet".into());
    }
    let limits = Limits {
        time_limit_ms: problem.time_limit_ms,
        memory_limit_kb: problem.memory_limit_kb,
    };
    Ok(runner::judge(
        code,
        &problem.grader,
        &problem.test_input,
        &problem.test_output,
        &limits,
    )
    .await
    .unwrap_or_else(|e| {
        eprintln!("judge failure on problem {}: {e}", problem.id);
        runner::RunResult {
            verdict: runner::Verdict::SE,
            time_ms: 0,
            output: "System error: the judge failed to run your code. This is not your fault; please resubmit.".into(),
        }
    }))
}

pub async fn contest_submit(
    Path((contest_id, problem_id)): Path<(i32, i32)>,
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<SubmitForm>,
) -> AppResult {
    let Some(user) = session::get_user(&session).await else {
        return Ok(SubmitResponse::error("Not logged in"));
    };
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(SubmitResponse::error("Contest not found"));
    };
    if let Some(reason) = submit_blocked_reason(&contest, Some(&user)) {
        return Ok(SubmitResponse::error(reason));
    }
    let Some((problem, _)) = problems::get_in_contest(&state.db, contest_id, problem_id).await?
    else {
        return Ok(SubmitResponse::error("Problem not found in this contest"));
    };
    let _guard = match JudgingGuard::try_acquire(&user.username) {
        Ok(guard) => guard,
        Err(reason) => return Ok(SubmitResponse::error(reason)),
    };

    let code = &form.code();
    let result = match run_judge(&problem, code).await {
        Ok(result) => result,
        Err(message) => return Ok(SubmitResponse::error(message)),
    };

    record_participant(&state, contest_id, &user).await;
    sqlx::query(
        "INSERT INTO submissions (id, username, contest_id, problem_id, verdict, code_length, time, code, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(generate_submission_id())
    .bind(&user.username)
    .bind(contest_id)
    .bind(problem_id)
    .bind(result.verdict.as_str())
    .bind(code.len() as i32)
    .bind(result.time_ms)
    .bind(code)
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.db)
    .await?;

    Ok(Json(SubmitResponse {
        verdict: result.verdict.as_str().to_string(),
        code_length: code.len() as i32,
        time: result.time_ms,
        output: result.output,
    })
    .into_response())
}

fn generate_submission_id() -> String {
    use base64::Engine;
    use rand::Rng;
    let bytes: [u8; 16] = rand::rng().random();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Template)]
#[template(path = "contest/leaderboard.html")]
struct LeaderboardTemplate {
    viewer: Viewer,
    contest: Contest,
    board: Leaderboard,
    live: bool,
    /// Whether usernames and scores link to the player's code
    inspect: bool,
}

pub async fn contest_leaderboard(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    let user = session::get_user(&session).await;
    if contest.is_pending() && !user.as_ref().is_some_and(|u| u.is_admin) {
        return Ok(Redirect::to(&format!("/contest/{contest_id}/join")).into_response());
    }
    render(LeaderboardTemplate {
        viewer: Viewer::from(user.as_ref()),
        board: leaderboard::load(&state.db, contest_id).await?,
        live: contest.is_accepting_submissions(),
        inspect: super::player::can_inspect(&contest, user.as_ref().is_some_and(|u| u.is_admin)),
        contest,
    })
}

pub async fn api_contest_leaderboard(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    let is_admin = session::get_user(&session)
        .await
        .is_some_and(|u| u.is_admin);
    if contest.is_pending() && !is_admin {
        return Ok(not_found());
    }
    Ok(Json(leaderboard::load(&state.db, contest_id).await?).into_response())
}
