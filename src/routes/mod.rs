use askama::Template;
use axum::{
    Form,
    body::Bytes,
    extract::{Path, Query, State},
    response::{Html, IntoResponse, Redirect},
};
use serde::Deserialize;
use tower_sessions::Session;

use crate::{
    markdown,
    models::{Contest, Problem},
    problems,
    runner::{CodeRunner, get_free_box_id},
    session,
    state::AppState,
};

// Type aliases for complex types
type SubmissionRawTuple = (String, String, String, String, i32, i32, String, i64);
type UserDataMap = std::collections::HashMap<
    String,
    (
        i32,
        i64,
        i64,
        i32,
        i32,
        std::collections::HashMap<String, UserProblemResult>,
    ),
>;

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    contests: Vec<Contest>,
    username: Option<String>,
    is_admin: bool,
}

pub async fn index(State(state): State<AppState>, session: Session) -> impl IntoResponse {
    let contests = sqlx::query_as::<_, Contest>("SELECT * FROM contests ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    let user = session::get_user(&session).await;
    let username = user.as_ref().map(|u| u.username.clone());
    let is_admin = user.as_ref().map(|u| u.is_admin).unwrap_or(false);

    let template = IndexTemplate {
        contests,
        username,
        is_admin,
    };
    Html(template.render().unwrap())
}

#[derive(Template)]
#[template(path = "login.html")]
struct LoginTemplate {
    error: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginQuery {
    next: Option<String>,
}

pub async fn login_page(Query(query): Query<LoginQuery>, session: Session) -> impl IntoResponse {
    // If already logged in, redirect to home
    if session::get_user(&session).await.is_some() {
        return Redirect::to("/").into_response();
    }

    // Store redirect destination in session
    if let Some(next) = query.next {
        let _ = session.insert("login_redirect", next).await;
    }

    let template = LoginTemplate { error: None };
    Html(template.render().unwrap()).into_response()
}

#[derive(Deserialize)]
pub struct LoginForm {
    username: String,
}

pub async fn login_post(
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<LoginForm>,
) -> impl IntoResponse {
    let username = form.username.trim();

    if username.is_empty() {
        let template = LoginTemplate {
            error: Some("Username is required".to_string()),
        };
        return Html(template.render().unwrap()).into_response();
    }

    let now = chrono::Utc::now().timestamp();

    // Insert or get existing user
    let _ = sqlx::query(
        "INSERT INTO users (username, is_admin, created_at) VALUES ($1, FALSE, $2) ON CONFLICT (username) DO NOTHING"
    )
    .bind(username)
    .bind(now)
    .execute(&state.db)
    .await;

    // Set session
    let _ = session::set_user(&session, username.to_string(), false).await;

    // Redirect to saved destination or home
    let redirect = session
        .get::<String>("login_redirect")
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "/".to_string());

    let _ = session.remove::<String>("login_redirect").await;

    Redirect::to(&redirect).into_response()
}

// Admin routes

pub async fn admin_auth(
    Path(token): Path<String>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    if token == state.admin_token {
        let _ = session::set_user(&session, "admin".to_string(), true).await;
        Redirect::to("/admin")
    } else {
        Redirect::to("/")
    }
}

#[derive(serde::Serialize, sqlx::FromRow)]
struct ContestWithCount {
    id: i32,
    name: String,
    duration: i32,
    start_time: Option<i64>,
    status: String,
    created_at: i64,
    problem_count: i64,
}

#[derive(Template)]
#[template(path = "admin/dashboard.html")]
struct AdminDashboardTemplate {
    contests: Vec<ContestWithCount>,
}

pub async fn admin_dashboard(State(state): State<AppState>, session: Session) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/").into_response();
        }
    } else {
        return Redirect::to("/login").into_response();
    }

    // Get all contests with problem counts
    let contests = sqlx::query_as::<_, ContestWithCount>(
        r#"
        SELECT c.id, c.name, c.duration, c.start_time, c.status, c.created_at,
               COALESCE(COUNT(cp.problem_id), 0) as problem_count
        FROM contests c
        LEFT JOIN contest_problems cp ON c.id = cp.contest_id
        GROUP BY c.id
        ORDER BY c.created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let template = AdminDashboardTemplate { contests };
    Html(template.render().unwrap()).into_response()
}

#[derive(Template)]
#[template(path = "admin/create_contest.html")]
struct CreateContestTemplate {
    problems: Vec<Problem>,
    error: Option<String>,
}

pub async fn admin_create_contest_page(
    State(_state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/").into_response();
        }
    } else {
        return Redirect::to("/login").into_response();
    }

    // Load problems from filesystem
    let problem_ids = problems::list_problems().unwrap_or_default();
    let mut problems = Vec::new();
    for id in problem_ids {
        if let Ok(problem) = problems::load_problem(&id) {
            problems.push(problem);
        }
    }

    let template = CreateContestTemplate {
        problems,
        error: None,
    };
    Html(template.render().unwrap()).into_response()
}

pub async fn admin_create_contest(
    State(state): State<AppState>,
    session: Session,
    body: Bytes,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/").into_response();
        }
    } else {
        return Redirect::to("/login").into_response();
    }

    // Parse form data manually to handle array fields
    let form_str = String::from_utf8_lossy(&body);
    let mut name = String::new();
    let mut duration = 0i32;
    let mut problems = Vec::new();

    for pair in form_str.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            // Replace + with space before decoding (application/x-www-form-urlencoded standard)
            let key_replaced = key.replace('+', " ");
            let value_replaced = value.replace('+', " ");
            let key = urlencoding::decode(&key_replaced).unwrap_or_default();
            let value = urlencoding::decode(&value_replaced).unwrap_or_default();

            match key.as_ref() {
                "name" => name = value.to_string(),
                "duration" => duration = value.parse().unwrap_or(60),
                "problems" => problems.push(value.to_string()),
                _ => {}
            }
        }
    }

    let now = chrono::Utc::now().timestamp();
    let duration_seconds = duration * 60;

    // Insert contest
    let contest_id: i32 = sqlx::query_scalar(
        "INSERT INTO contests (name, duration, status, created_at) VALUES ($1, $2, 'pending', $3) RETURNING id"
    )
    .bind(&name)
    .bind(duration_seconds)
    .bind(now)
    .fetch_one(&state.db)
    .await
    .unwrap();

    // Insert contest problems
    for (order, problem_id) in problems.iter().enumerate() {
        let _ = sqlx::query(
            "INSERT INTO contest_problems (contest_id, problem_id, problem_order) VALUES ($1, $2, $3)"
        )
        .bind(contest_id)
        .bind(problem_id)
        .bind(order as i32)
        .execute(&state.db)
        .await;
    }

    Redirect::to("/admin").into_response()
}

pub async fn admin_start_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/");
        }
    } else {
        return Redirect::to("/login");
    }

    let _ = state.start_contest(contest_id).await;
    Redirect::to("/admin")
}

pub async fn admin_end_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/");
        }
    } else {
        return Redirect::to("/login");
    }

    let _ = state.end_contest(contest_id).await;
    Redirect::to("/admin")
}

pub async fn admin_delete_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/");
        }
    } else {
        return Redirect::to("/login");
    }

    // Only allow deleting ended contests
    if let Ok(Some(contest)) = state.get_contest(contest_id).await
        && contest.status == "ended"
    {
        // Delete contest (CASCADE will delete submissions and contest_problems)
        let _ = sqlx::query("DELETE FROM contests WHERE id = $1")
            .bind(contest_id)
            .execute(&state.db)
            .await;
    }

    Redirect::to("/admin")
}

#[derive(serde::Serialize)]
struct ProblemWithOrder {
    id: String,
    title: String,
    order: i32,
}

#[derive(Template)]
#[template(path = "admin/manage_contest.html")]
struct ManageContestTemplate {
    contest: Contest,
    problems: Vec<ProblemWithOrder>,
}

pub async fn admin_manage_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/").into_response();
        }
    } else {
        return Redirect::to("/login").into_response();
    }

    let contest = state.get_contest(contest_id).await.ok().flatten();
    if contest.is_none() {
        return Redirect::to("/admin").into_response();
    }
    let contest = contest.unwrap();

    // Get problem IDs and orders from contest_problems
    let contest_problems: Vec<(String, i32)> = sqlx::query_as(
        "SELECT problem_id, problem_order FROM contest_problems WHERE contest_id = $1 ORDER BY problem_order"
    )
    .bind(contest_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Load problem data from filesystem and join with contest_problems
    let mut problems = Vec::new();
    for (problem_id, order) in contest_problems {
        if let Ok(problem) = problems::load_problem(&problem_id) {
            problems.push(ProblemWithOrder {
                id: problem.id,
                title: problem.title,
                order,
            });
        }
    }

    let template = ManageContestTemplate { contest, problems };
    Html(template.render().unwrap()).into_response()
}

#[derive(serde::Serialize, sqlx::FromRow)]
struct SubmissionView {
    id: String,
    username: String,
    problem_id: String,
    problem_title: String,
    verdict: String,
    code_length: i32,
    time: i32,
    code: String,
    created_at: i64,
}

#[derive(Template)]
#[template(path = "admin/submissions.html")]
struct SubmissionsTemplate {
    contest: Contest,
    submissions: Vec<SubmissionView>,
    filter_username: String,
    filter_verdict: String,
}

#[derive(Deserialize)]
pub struct SubmissionsQuery {
    username: Option<String>,
    verdict: Option<String>,
}

pub async fn admin_submissions(
    Path(contest_id): Path<i32>,
    Query(query): Query<SubmissionsQuery>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return Redirect::to("/").into_response();
        }
    } else {
        return Redirect::to("/login").into_response();
    }

    let contest = state.get_contest(contest_id).await.ok().flatten();
    if contest.is_none() {
        return Redirect::to("/admin").into_response();
    }
    let contest = contest.unwrap();

    let filter_username = query.username.clone().unwrap_or_default();
    let filter_verdict = query.verdict.clone().unwrap_or_default();

    // Build query with optional filters
    let mut query_str = String::from(
        "SELECT s.id, s.username, s.problem_id, s.verdict, s.code_length, s.time, s.code, s.created_at FROM submissions s WHERE s.contest_id = $1",
    );

    if !filter_username.is_empty() {
        query_str.push_str(" AND s.username = $2");
    }
    if !filter_verdict.is_empty() {
        if filter_username.is_empty() {
            query_str.push_str(" AND s.verdict = $2");
        } else {
            query_str.push_str(" AND s.verdict = $3");
        }
    }

    query_str.push_str(" ORDER BY s.created_at DESC");

    // Execute query with appropriate bindings
    let submissions_raw: Vec<SubmissionRawTuple> =
        if !filter_username.is_empty() && !filter_verdict.is_empty() {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .bind(&filter_username)
                .bind(&filter_verdict)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        } else if !filter_username.is_empty() {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .bind(&filter_username)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        } else if !filter_verdict.is_empty() {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .bind(&filter_verdict)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        } else {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        };

    // Load problem titles from filesystem
    let mut submissions = Vec::new();
    for (id, username, problem_id, verdict, code_length, time, code, created_at) in submissions_raw
    {
        let problem_title = problems::load_problem(&problem_id)
            .ok()
            .map(|p| p.title)
            .unwrap_or_else(|| problem_id.clone());

        submissions.push(SubmissionView {
            id,
            username,
            problem_id,
            problem_title,
            verdict,
            code_length,
            time,
            code,
            created_at,
        });
    }

    let template = SubmissionsTemplate {
        contest,
        submissions,
        filter_username: filter_username.clone(),
        filter_verdict: filter_verdict.clone(),
    };
    Html(template.render().unwrap()).into_response()
}

// Contest routes

pub async fn contest_join(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Get contest first to check status
    let contest = match state.get_contest(contest_id).await {
        Ok(Some(c)) => c,
        _ => return Redirect::to("/").into_response(),
    };

    // If contest has ended, anyone can view leaderboard without login
    if contest.status == "ended" {
        return Redirect::to(&format!("/contest/{contest_id}/leaderboard")).into_response();
    }

    // For pending or active contests, require login
    let user = match session::get_user(&session).await {
        Some(u) => u,
        None => {
            return Redirect::to(&format!("/login?next=/contest/{contest_id}/join"))
                .into_response();
        }
    };

    // Record participation (idempotent)
    let now = chrono::Utc::now().timestamp();
    let _ = sqlx::query(
        "INSERT INTO contest_participants (contest_id, username, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING"
    )
    .bind(contest_id)
    .bind(&user.username)
    .bind(now)
    .execute(&state.db)
    .await;

    // Redirect based on contest status
    if contest.status == "pending" {
        Redirect::to(&format!("/contest/{contest_id}/waiting")).into_response()
    } else {
        Redirect::to(&format!("/contest/{contest_id}/problems")).into_response()
    }
}

#[derive(Template)]
#[template(path = "contest/waiting.html")]
struct WaitingRoomTemplate {
    contest: Contest,
    username: String,
    problem_count: i64,
}

pub async fn contest_waiting(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check login
    let user = match session::get_user(&session).await {
        Some(u) => u,
        None => {
            return Redirect::to(&format!("/login?next=/contest/{contest_id}/waiting"))
                .into_response();
        }
    };

    // Get contest
    let contest = match state.get_contest(contest_id).await {
        Ok(Some(c)) => c,
        _ => return Redirect::to("/").into_response(),
    };

    // If contest is active, redirect to problems
    if contest.status == "active" {
        return Redirect::to(&format!("/contest/{contest_id}/problems")).into_response();
    }

    // Get problem count
    let problem_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM contest_problems WHERE contest_id = $1")
            .bind(contest_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

    let template = WaitingRoomTemplate {
        contest,
        username: user.username,
        problem_count,
    };
    Html(template.render().unwrap()).into_response()
}

#[derive(serde::Serialize)]
struct ProblemListItem {
    id: String,
    title: String,
    order: i32,
    verdict: Option<String>,
}

#[derive(Template)]
#[template(path = "contest/problems.html")]
struct ProblemsTemplate {
    contest: Contest,
    username: String,
    problems: Vec<ProblemListItem>,
    time_remaining: Option<i64>,
}

pub async fn contest_problems(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check login
    let user = match session::get_user(&session).await {
        Some(u) => u,
        None => {
            return Redirect::to(&format!("/login?next=/contest/{contest_id}/problems"))
                .into_response();
        }
    };

    // Get contest
    let contest = match state.get_contest(contest_id).await {
        Ok(Some(c)) => c,
        _ => return Redirect::to("/").into_response(),
    };

    // If contest is not active, redirect appropriately
    if contest.status == "pending" {
        return Redirect::to(&format!("/contest/{contest_id}/waiting")).into_response();
    } else if contest.status == "ended" {
        return Redirect::to(&format!("/contest/{contest_id}/leaderboard")).into_response();
    }

    // Get problem IDs and orders from contest_problems
    let contest_problems: Vec<(String, i32)> = sqlx::query_as(
        "SELECT problem_id, problem_order FROM contest_problems WHERE contest_id = $1 ORDER BY problem_order"
    )
    .bind(contest_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Load problem data from filesystem and join with user submissions
    let mut problems = Vec::new();
    for (problem_id, order) in contest_problems {
        if let Ok(problem) = problems::load_problem(&problem_id) {
            // Get user's best submission verdict for this problem
            let verdict: Option<String> = sqlx::query_scalar(
                r#"
                SELECT verdict FROM submissions
                WHERE username = $1 AND contest_id = $2 AND problem_id = $3
                ORDER BY
                    CASE WHEN verdict = 'AC' THEN 0 ELSE 1 END,
                    code_length ASC,
                    created_at ASC
                LIMIT 1
                "#,
            )
            .bind(&user.username)
            .bind(contest_id)
            .bind(&problem_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

            problems.push(ProblemListItem {
                id: problem.id,
                title: problem.title,
                order,
                verdict,
            });
        }
    }

    let time_remaining = state.get_time_remaining(&contest);

    let template = ProblemsTemplate {
        contest,
        username: user.username,
        problems,
        time_remaining,
    };
    Html(template.render().unwrap()).into_response()
}

#[derive(Template)]
#[template(path = "contest/problem.html")]
struct ProblemPageTemplate {
    contest: Contest,
    problem: Problem,
    username: String,
    statement: String,
    time_remaining: Option<i64>,
    contest_ended: bool,
}

pub async fn contest_problem(
    Path((contest_id, problem_id)): Path<(i32, String)>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check login
    let user = match session::get_user(&session).await {
        Some(u) => u,
        None => {
            return Redirect::to(&format!(
                "/login?next=/contest/{contest_id}/problems/{problem_id}"
            ))
            .into_response();
        }
    };

    // Get contest
    let contest = match state.get_contest(contest_id).await {
        Ok(Some(c)) => c,
        _ => return Redirect::to("/").into_response(),
    };

    // If contest not active, redirect
    if contest.status != "active" {
        return Redirect::to(&format!("/contest/{contest_id}/problems")).into_response();
    }

    // Load problem from filesystem
    let problem = match problems::load_problem(&problem_id) {
        Ok(p) => p,
        Err(_) => return Redirect::to(&format!("/contest/{contest_id}/problems")).into_response(),
    };

    // Render markdown statement with sanitization
    let statement_html = markdown::render_markdown(&problem.statement);

    let time_remaining = state.get_time_remaining(&contest);
    let contest_ended = state.is_contest_ended(&contest);

    let template = ProblemPageTemplate {
        contest,
        problem,
        username: user.username,
        statement: statement_html,
        time_remaining,
        contest_ended,
    };
    Html(template.render().unwrap()).into_response()
}

#[derive(Deserialize)]
pub struct SubmitForm {
    code: String,
}

#[derive(serde::Serialize)]
pub struct SubmitResponse {
    verdict: String,
    code_length: i32,
    time: i32,
    output: String,
}

pub async fn contest_submit(
    Path((contest_id, problem_id)): Path<(i32, String)>,
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<SubmitForm>,
) -> impl IntoResponse {
    // Check login
    let user = match session::get_user(&session).await {
        Some(u) => u,
        None => {
            return axum::Json(SubmitResponse {
                verdict: "ERROR".to_string(),
                code_length: 0,
                time: 0,
                output: "Not logged in".to_string(),
            })
            .into_response();
        }
    };

    // Get contest
    let contest = match state.get_contest(contest_id).await {
        Ok(Some(c)) => c,
        _ => {
            return axum::Json(SubmitResponse {
                verdict: "ERROR".to_string(),
                code_length: 0,
                time: 0,
                output: "Contest not found".to_string(),
            })
            .into_response();
        }
    };

    // Check contest is active
    if contest.status != "active" || state.is_contest_ended(&contest) {
        return axum::Json(SubmitResponse {
            verdict: "ERROR".to_string(),
            code_length: 0,
            time: 0,
            output: "Contest is not active".to_string(),
        })
        .into_response();
    }

    let code = &form.code;

    // Check code length limit (10KB max)
    const MAX_CODE_LENGTH: usize = 10240; // 10KB
    if code.len() > MAX_CODE_LENGTH {
        return axum::Json(SubmitResponse {
            verdict: "ERROR".to_string(),
            code_length: 0,
            time: 0,
            output: format!(
                "Code too long: {} bytes (max {} bytes)",
                code.len(),
                MAX_CODE_LENGTH
            ),
        })
        .into_response();
    }

    let code_length = code.len() as i32;

    // Load problem from filesystem
    let problem = match problems::load_problem(&problem_id) {
        Ok(p) => p,
        Err(_) => {
            return axum::Json(SubmitResponse {
                verdict: "ERROR".to_string(),
                code_length,
                time: 0,
                output: "Problem not found".to_string(),
            })
            .into_response();
        }
    };

    // Check that test data exists
    if problem.test_input.is_empty() || problem.test_output.is_empty() {
        return axum::Json(SubmitResponse {
            verdict: "ERROR".to_string(),
            code_length,
            time: 0,
            output: "No test cases found for this problem".to_string(),
        })
        .into_response();
    }

    // Run the code through isolate with problem-specific limits
    let box_id = get_free_box_id().await;
    let runner = CodeRunner::new(box_id);

    // For this contest, only Python 3.11 is allowed
    let language_id = "python3.11_function_f";

    // Get time and memory limits
    let time_limit = problems::get_time_limit();
    let memory_limit = problems::get_memory_limit();

    // Load custom grader for this problem
    let custom_grader = match problems::load_custom_grader(&problem_id) {
        Ok(grader) => grader,
        Err(_) => {
            return axum::Json(SubmitResponse {
                verdict: "ERROR".to_string(),
                code_length,
                time: 0,
                output: "Grader not found for this problem".to_string(),
            })
            .into_response();
        }
    };

    let result = match runner
        .judge(
            code,
            language_id,
            &problem.test_input,
            &problem.test_output,
            time_limit,
            memory_limit,
            &custom_grader,
        )
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return axum::Json(SubmitResponse {
                verdict: "ERROR".to_string(),
                code_length,
                time: 0,
                output: format!("Judge error: {e}"),
            })
            .into_response();
        }
    };

    let verdict = result.verdict;
    let time_ms = result.time_ms;
    let output = result.output;

    // Save submission
    let now = chrono::Utc::now().timestamp();
    let submission_id = generate_submission_id();

    let _ = sqlx::query(
        "INSERT INTO submissions (id, username, contest_id, problem_id, verdict, code_length, time, code, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    )
    .bind(&submission_id)
    .bind(&user.username)
    .bind(contest_id)
    .bind(&problem_id)
    .bind(verdict.as_str())
    .bind(code_length)
    .bind(time_ms)
    .bind(code)
    .bind(now)
    .execute(&state.db)
    .await;

    axum::Json(SubmitResponse {
        verdict: verdict.to_string(),
        code_length,
        time: time_ms,
        output,
    })
    .into_response()
}

fn generate_submission_id() -> String {
    use base64::Engine;
    use rand::Rng;
    let bytes: [u8; 16] = rand::rng().random();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

// Leaderboard

#[derive(serde::Serialize, Clone)]
struct UserProblemResult {
    code_length: i32,
    medal: String, // "diamond", "gold", or "none"
}

#[derive(serde::Serialize, Clone)]
struct LeaderboardEntry {
    username: String,
    total_score: i32,
    problems_solved: i64,
    total_bytes: i64,
    diamonds: i32,
    golds: i32,
    problem_results: Vec<Option<UserProblemResult>>, // One per problem in order
}

#[derive(serde::Serialize, sqlx::FromRow)]
struct ProblemScore {
    problem_id: String,
    username: String,
    code_length: i32,
}

#[derive(Template)]
#[template(path = "contest/leaderboard.html")]
struct LeaderboardTemplate {
    contest: Contest,
    username: Option<String>,
    entries: Vec<LeaderboardEntry>,
    problem_ids: Vec<String>,
    problem_titles: Vec<String>,
}

pub async fn contest_leaderboard(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    let user = session::get_user(&session).await;

    // Get contest
    let contest = match state.get_contest(contest_id).await {
        Ok(Some(c)) => c,
        _ => return Redirect::to("/").into_response(),
    };

    // Get problem IDs for this contest
    let problem_ids: Vec<String> = sqlx::query_scalar(
        "SELECT problem_id FROM contest_problems WHERE contest_id = $1 ORDER BY problem_order",
    )
    .bind(contest_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Load problem titles
    let problem_titles: Vec<String> = problem_ids
        .iter()
        .map(|pid| {
            problems::load_problem(pid)
                .map(|p| p.title)
                .unwrap_or_else(|_| format!("Problem {}", pid))
        })
        .collect();

    // For each problem, find the best (shortest) accepted solution and count how many have it
    let mut best_solutions: std::collections::HashMap<String, i32> =
        std::collections::HashMap::new();
    let mut best_solution_counts: std::collections::HashMap<String, i32> =
        std::collections::HashMap::new();

    for pid in &problem_ids {
        let best: Option<i32> = sqlx::query_scalar(
            "SELECT MIN(code_length) FROM submissions
             WHERE contest_id = $1 AND problem_id = $2 AND verdict = 'AC'",
        )
        .bind(contest_id)
        .bind(pid)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some(best_len) = best {
            best_solutions.insert(pid.clone(), best_len);

            // Count how many users have this best solution
            let count: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(DISTINCT username) FROM (
                    SELECT DISTINCT ON (username) username, code_length
                    FROM submissions
                    WHERE contest_id = $1 AND problem_id = $2 AND verdict = 'AC'
                    ORDER BY username, code_length ASC, created_at ASC
                ) AS best_per_user WHERE code_length = $3"#,
            )
            .bind(contest_id)
            .bind(pid)
            .bind(best_len)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

            best_solution_counts.insert(pid.clone(), count as i32);
        }
    }

    // Get all participants for this contest
    let participants: Vec<String> =
        sqlx::query_scalar("SELECT username FROM contest_participants WHERE contest_id = $1")
            .bind(contest_id)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    // Get all users' best submissions for each problem
    let user_scores: Vec<ProblemScore> = sqlx::query_as::<_, ProblemScore>(
        r#"
        SELECT DISTINCT ON (problem_id, username)
               problem_id, username, code_length
        FROM submissions
        WHERE contest_id = $1 AND verdict = 'AC'
        ORDER BY problem_id, username, code_length ASC, created_at ASC
        "#,
    )
    .bind(contest_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Build user data with medals
    let mut user_data: UserDataMap = std::collections::HashMap::new();

    // Initialize all participants with zero scores
    for username in participants {
        user_data
            .entry(username)
            .or_insert((0, 0, 0, 0, 0, std::collections::HashMap::new()));
    }

    for score in user_scores {
        let entry = user_data.entry(score.username.clone()).or_insert((
            0,
            0,
            0,
            0,
            0,
            std::collections::HashMap::new(),
        ));

        // Determine medal type
        let (points, medal) = if let Some(&best_len) = best_solutions.get(&score.problem_id) {
            if score.code_length == best_len {
                let count = best_solution_counts
                    .get(&score.problem_id)
                    .copied()
                    .unwrap_or(0);
                if count == 1 {
                    // Diamond: unique best solution
                    entry.3 += 1; // diamonds count
                    (10000, "diamond".to_string())
                } else {
                    // Gold: shared best solution
                    entry.4 += 1; // golds count
                    (10000, "gold".to_string())
                }
            } else {
                // Bronze: solved but not best
                (
                    (10000 * best_len / score.code_length).max(1),
                    "none".to_string(),
                )
            }
        } else {
            (0, "none".to_string())
        };

        entry.0 += points;
        entry.1 += 1;
        entry.2 += score.code_length as i64;
        entry.5.insert(
            score.problem_id.clone(),
            UserProblemResult {
                code_length: score.code_length,
                medal,
            },
        );
    }

    // Convert to sorted entries with problem results in order
    let mut entries: Vec<LeaderboardEntry> = user_data
        .into_iter()
        .map(
            |(username, (score, solved, bytes, diamonds, golds, results_map))| {
                let problem_results: Vec<Option<UserProblemResult>> = problem_ids
                    .iter()
                    .map(|pid| results_map.get(pid).cloned())
                    .collect();

                LeaderboardEntry {
                    username,
                    total_score: score,
                    problems_solved: solved,
                    total_bytes: bytes,
                    diamonds,
                    golds,
                    problem_results,
                }
            },
        )
        .collect();

    // Sort by problems solved (descending), then by total bytes (ascending), then by username (ascending)
    entries.sort_by(|a, b| {
        b.problems_solved
            .cmp(&a.problems_solved)
            .then(a.total_bytes.cmp(&b.total_bytes))
            .then(a.username.cmp(&b.username))
    });

    let template = LeaderboardTemplate {
        contest,
        username: user.map(|u| u.username),
        entries,
        problem_ids,
        problem_titles,
    };
    Html(template.render().unwrap()).into_response()
}

// API endpoints for JSON data

#[derive(serde::Serialize)]
struct LeaderboardApiResponse {
    entries: Vec<LeaderboardEntry>,
    problem_ids: Vec<String>,
    problem_titles: Vec<String>,
}

pub async fn api_contest_leaderboard(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    // Get problem IDs for this contest
    let problem_ids: Vec<String> = sqlx::query_scalar(
        "SELECT problem_id FROM contest_problems WHERE contest_id = $1 ORDER BY problem_order",
    )
    .bind(contest_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Load problem titles
    let problem_titles: Vec<String> = problem_ids
        .iter()
        .map(|pid| {
            problems::load_problem(pid)
                .map(|p| p.title)
                .unwrap_or_else(|_| format!("Problem {}", pid))
        })
        .collect();

    // For each problem, find the best (shortest) accepted solution and count how many have it
    let mut best_solutions: std::collections::HashMap<String, i32> =
        std::collections::HashMap::new();
    let mut best_solution_counts: std::collections::HashMap<String, i32> =
        std::collections::HashMap::new();

    for pid in &problem_ids {
        let best: Option<i32> = sqlx::query_scalar(
            "SELECT MIN(code_length) FROM submissions
             WHERE contest_id = $1 AND problem_id = $2 AND verdict = 'AC'",
        )
        .bind(contest_id)
        .bind(pid)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some(best_len) = best {
            best_solutions.insert(pid.clone(), best_len);

            let count: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(DISTINCT username) FROM (
                    SELECT DISTINCT ON (username) username, code_length
                    FROM submissions
                    WHERE contest_id = $1 AND problem_id = $2 AND verdict = 'AC'
                    ORDER BY username, code_length ASC, created_at ASC
                ) AS best_per_user WHERE code_length = $3"#,
            )
            .bind(contest_id)
            .bind(pid)
            .bind(best_len)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

            best_solution_counts.insert(pid.clone(), count as i32);
        }
    }

    // Get all participants for this contest
    let participants: Vec<String> =
        sqlx::query_scalar("SELECT username FROM contest_participants WHERE contest_id = $1")
            .bind(contest_id)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    // Get all users' best submissions for each problem
    let user_scores: Vec<ProblemScore> = sqlx::query_as::<_, ProblemScore>(
        r#"
        SELECT DISTINCT ON (problem_id, username)
               problem_id, username, code_length
        FROM submissions
        WHERE contest_id = $1 AND verdict = 'AC'
        ORDER BY problem_id, username, code_length ASC, created_at ASC
        "#,
    )
    .bind(contest_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Build user data with medals
    let mut user_data: UserDataMap = std::collections::HashMap::new();

    // Initialize all participants with zero scores
    for username in participants {
        user_data
            .entry(username)
            .or_insert((0, 0, 0, 0, 0, std::collections::HashMap::new()));
    }

    for score in user_scores {
        let entry = user_data.entry(score.username.clone()).or_insert((
            0,
            0,
            0,
            0,
            0,
            std::collections::HashMap::new(),
        ));

        // Determine medal type
        let (points, medal) = if let Some(&best_len) = best_solutions.get(&score.problem_id) {
            if score.code_length == best_len {
                let count = best_solution_counts
                    .get(&score.problem_id)
                    .copied()
                    .unwrap_or(0);
                if count == 1 {
                    entry.3 += 1;
                    (10000, "diamond".to_string())
                } else {
                    entry.4 += 1;
                    (10000, "gold".to_string())
                }
            } else {
                (
                    (10000 * best_len / score.code_length).max(1),
                    "none".to_string(),
                )
            }
        } else {
            (0, "none".to_string())
        };

        entry.0 += points;
        entry.1 += 1;
        entry.2 += score.code_length as i64;
        entry.5.insert(
            score.problem_id.clone(),
            UserProblemResult {
                code_length: score.code_length,
                medal,
            },
        );
    }

    // Convert to sorted entries
    let mut entries: Vec<LeaderboardEntry> = user_data
        .into_iter()
        .map(
            |(username, (score, solved, bytes, diamonds, golds, results_map))| {
                let problem_results: Vec<Option<UserProblemResult>> = problem_ids
                    .iter()
                    .map(|pid| results_map.get(pid).cloned())
                    .collect();

                LeaderboardEntry {
                    username,
                    total_score: score,
                    problems_solved: solved,
                    total_bytes: bytes,
                    diamonds,
                    golds,
                    problem_results,
                }
            },
        )
        .collect();

    entries.sort_by(|a, b| {
        b.problems_solved
            .cmp(&a.problems_solved)
            .then(a.total_bytes.cmp(&b.total_bytes))
            .then(a.username.cmp(&b.username))
    });

    axum::Json(LeaderboardApiResponse {
        entries,
        problem_ids,
        problem_titles,
    })
    .into_response()
}

pub async fn api_admin_submissions(
    Path(contest_id): Path<i32>,
    Query(query): Query<SubmissionsQuery>,
    State(state): State<AppState>,
    session: Session,
) -> impl IntoResponse {
    // Check admin
    if let Some(user) = session::get_user(&session).await {
        if !user.is_admin {
            return (
                axum::http::StatusCode::UNAUTHORIZED,
                axum::Json(Vec::<SubmissionView>::new()),
            )
                .into_response();
        }
    } else {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            axum::Json(Vec::<SubmissionView>::new()),
        )
            .into_response();
    }

    let filter_username = query.username.clone().unwrap_or_default();
    let filter_verdict = query.verdict.clone().unwrap_or_default();

    // Build query with optional filters
    let mut query_str = String::from(
        "SELECT s.id, s.username, s.problem_id, s.verdict, s.code_length, s.time, s.code, s.created_at FROM submissions s WHERE s.contest_id = $1",
    );

    if !filter_username.is_empty() {
        query_str.push_str(" AND s.username = $2");
    }
    if !filter_verdict.is_empty() {
        if filter_username.is_empty() {
            query_str.push_str(" AND s.verdict = $2");
        } else {
            query_str.push_str(" AND s.verdict = $3");
        }
    }

    query_str.push_str(" ORDER BY s.created_at DESC");

    // Execute query with appropriate bindings
    let submissions_raw: Vec<SubmissionRawTuple> =
        if !filter_username.is_empty() && !filter_verdict.is_empty() {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .bind(&filter_username)
                .bind(&filter_verdict)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        } else if !filter_username.is_empty() {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .bind(&filter_username)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        } else if !filter_verdict.is_empty() {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .bind(&filter_verdict)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        } else {
            sqlx::query_as(&query_str)
                .bind(contest_id)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
        };

    // Load problem titles from filesystem
    let mut submissions = Vec::new();
    for (id, username, problem_id, verdict, code_length, time, code, created_at) in submissions_raw
    {
        let problem_title = problems::load_problem(&problem_id)
            .ok()
            .map(|p| p.title)
            .unwrap_or_else(|| problem_id.clone());

        submissions.push(SubmissionView {
            id,
            username,
            problem_id,
            problem_title,
            verdict,
            code_length,
            time,
            code,
            created_at,
        });
    }

    axum::Json(submissions).into_response()
}
