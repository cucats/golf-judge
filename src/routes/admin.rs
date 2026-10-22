use askama::Template;
use axum::{
    Form, Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Redirect},
};
use serde::{Deserialize, Serialize};
use tower_sessions::Session;

use super::{AppResult, Viewer, normalize_newlines, not_found, render, require_admin};
use crate::{
    markdown,
    models::{Contest, Problem, ProblemSummary, order_label},
    problems,
    routes::contest::{SubmitForm, SubmitResponse, run_judge},
    state::AppState,
};

macro_rules! admin_or_return {
    ($session:expr) => {
        match require_admin(&$session).await {
            Ok(user) => user,
            Err(response) => return Ok(response),
        }
    };
}

// ---------- Dashboard ----------

#[derive(sqlx::FromRow)]
struct ContestRow {
    #[sqlx(flatten)]
    contest: Contest,
    problem_count: i64,
    participant_count: i64,
    submission_count: i64,
}

#[derive(Template)]
#[template(path = "admin/dashboard.html")]
struct DashboardTemplate {
    viewer: Viewer,
    contests: Vec<ContestRow>,
    problem_bank_size: i64,
}

pub async fn dashboard(State(state): State<AppState>, session: Session) -> AppResult {
    let user = admin_or_return!(session);
    let contests = sqlx::query_as::<_, ContestRow>(
        "SELECT c.*,
                (SELECT COUNT(*) FROM contest_problems cp WHERE cp.contest_id = c.id) AS problem_count,
                (SELECT COUNT(*) FROM contest_participants pa WHERE pa.contest_id = c.id) AS participant_count,
                (SELECT COUNT(*) FROM submissions s WHERE s.contest_id = c.id) AS submission_count
         FROM contests c
         ORDER BY c.created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    let problem_bank_size: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM problems")
        .fetch_one(&state.db)
        .await?;
    render(DashboardTemplate {
        viewer: Viewer::from(Some(&user)),
        contests,
        problem_bank_size,
    })
}

// ---------- Contests ----------

struct ProblemChoice {
    id: i32,
    title: String,
    /// 1-based position in the contest, None if not included
    position: Option<i32>,
}

#[derive(Template)]
#[template(path = "admin/contest.html")]
struct ContestTemplate {
    viewer: Viewer,
    /// None when creating a new contest
    contest: Option<Contest>,
    name: String,
    duration_minutes: i32,
    choices: Vec<ProblemChoice>,
    problems_editable: bool,
    participant_count: i64,
    submission_count: i64,
    error: Option<String>,
}

struct ContestForm {
    name: String,
    duration_minutes: i32,
    /// (position, problem id) for each selected problem
    selected: Vec<(i32, i32)>,
}

impl ContestForm {
    /// Fields: name, duration (minutes), pos_{problem_id} (blank = not included)
    fn parse(fields: &[(String, String)]) -> Result<Self, (Self, String)> {
        let mut form = ContestForm {
            name: String::new(),
            duration_minutes: 0,
            selected: Vec::new(),
        };
        let mut error = None;
        let mut duration_present = false;
        for (key, value) in fields {
            let value = value.trim();
            match key.as_str() {
                "name" => form.name = value.to_string(),
                "duration" => {
                    duration_present = true;
                    match value.parse() {
                        Ok(minutes) => form.duration_minutes = minutes,
                        Err(_) => error = Some("Duration must be a whole number of minutes".into()),
                    }
                }
                _ => {
                    if let Some(pid) = key.strip_prefix("pos_").and_then(|p| p.parse().ok())
                        && !value.is_empty()
                    {
                        match value.parse() {
                            Ok(position) => form.selected.push((position, pid)),
                            Err(_) => error = Some(format!("Invalid position \"{value}\"")),
                        }
                    }
                }
            }
        }
        form.selected.sort();

        if form.name.is_empty() {
            error = Some("Contest name is required".into());
        } else if form.name.chars().count() > 100 {
            error = Some("Contest name must be at most 100 characters".into());
        } else if !duration_present {
            error = Some("Duration is required".into());
        } else if form.duration_minutes < 0 {
            error = Some("Duration must be 0 or more minutes".into());
        } else if form.duration_minutes.checked_mul(60).is_none() {
            error = Some("Duration is too large".into());
        }
        match error {
            Some(e) => Err((form, e)),
            None => Ok(form),
        }
    }
}

async fn problem_choices(
    state: &AppState,
    selected: &[(i32, i32)],
) -> Result<Vec<ProblemChoice>, sqlx::Error> {
    let bank = problems::list(&state.db).await?;
    let mut choices: Vec<ProblemChoice> = bank
        .into_iter()
        .map(|p| ProblemChoice {
            position: selected
                .iter()
                .position(|&(_, pid)| pid == p.id)
                .map(|i| i as i32 + 1),
            id: p.id,
            title: p.title,
        })
        .collect();
    choices.sort_by_key(|c| (c.position.is_none(), c.position, c.id));
    Ok(choices)
}

async fn contest_counts(state: &AppState, contest_id: i32) -> Result<(i64, i64), sqlx::Error> {
    sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM contest_participants WHERE contest_id = $1),
                (SELECT COUNT(*) FROM submissions WHERE contest_id = $1)",
    )
    .bind(contest_id)
    .fetch_one(&state.db)
    .await
}

pub async fn new_contest_page(State(state): State<AppState>, session: Session) -> AppResult {
    let user = admin_or_return!(session);
    render(ContestTemplate {
        viewer: Viewer::from(Some(&user)),
        contest: None,
        name: String::new(),
        duration_minutes: 60,
        choices: problem_choices(&state, &[]).await?,
        problems_editable: true,
        participant_count: 0,
        submission_count: 0,
        error: None,
    })
}

async fn replace_contest_problems(
    tx: &mut sqlx::PgConnection,
    contest_id: i32,
    selected: &[(i32, i32)],
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM contest_problems WHERE contest_id = $1")
        .bind(contest_id)
        .execute(&mut *tx)
        .await?;
    for (order, &(_, problem_id)) in selected.iter().enumerate() {
        sqlx::query(
            "INSERT INTO contest_problems (contest_id, problem_id, problem_order) VALUES ($1, $2, $3)",
        )
        .bind(contest_id)
        .bind(problem_id)
        .bind(order as i32)
        .execute(&mut *tx)
        .await?;
    }
    Ok(())
}

pub async fn create_contest(
    State(state): State<AppState>,
    session: Session,
    Form(fields): Form<Vec<(String, String)>>,
) -> AppResult {
    let user = admin_or_return!(session);
    let form = match ContestForm::parse(&fields) {
        Ok(form) => form,
        Err((form, error)) => {
            return render(ContestTemplate {
                viewer: Viewer::from(Some(&user)),
                contest: None,
                choices: problem_choices(&state, &form.selected).await?,
                name: form.name,
                duration_minutes: form.duration_minutes,
                problems_editable: true,
                participant_count: 0,
                submission_count: 0,
                error: Some(error),
            });
        }
    };

    let mut tx = state.db.begin().await?;
    let contest_id: i32 = sqlx::query_scalar(
        "INSERT INTO contests (name, duration, status, created_at) VALUES ($1, $2, 'pending', $3) RETURNING id",
    )
    .bind(&form.name)
    .bind(form.duration_minutes * 60)
    .bind(chrono::Utc::now().timestamp())
    .fetch_one(&mut *tx)
    .await?;
    replace_contest_problems(&mut tx, contest_id, &form.selected).await?;
    tx.commit().await?;

    Ok(Redirect::to(&format!("/admin/contests/{contest_id}")).into_response())
}

pub async fn manage_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let user = admin_or_return!(session);
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    let selected: Vec<(i32, i32)> = problems::for_contest(&state.db, contest_id)
        .await?
        .iter()
        .map(|p| (p.problem_order, p.id))
        .collect();
    let (participant_count, submission_count) = contest_counts(&state, contest_id).await?;
    render(ContestTemplate {
        viewer: Viewer::from(Some(&user)),
        name: contest.name.clone(),
        duration_minutes: contest.duration_minutes(),
        choices: problem_choices(&state, &selected).await?,
        problems_editable: contest.is_pending(),
        contest: Some(contest),
        participant_count,
        submission_count,
        error: None,
    })
}

pub async fn update_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
    Form(fields): Form<Vec<(String, String)>>,
) -> AppResult {
    let user = admin_or_return!(session);
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };

    let form = match ContestForm::parse(&fields) {
        Ok(form) => form,
        Err((form, error)) => {
            let (participant_count, submission_count) = contest_counts(&state, contest_id).await?;
            return render(ContestTemplate {
                viewer: Viewer::from(Some(&user)),
                choices: problem_choices(&state, &form.selected).await?,
                name: form.name,
                duration_minutes: form.duration_minutes,
                problems_editable: contest.is_pending(),
                contest: Some(contest),
                participant_count,
                submission_count,
                error: Some(error),
            });
        }
    };

    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE contests SET name = $1, duration = $2 WHERE id = $3")
        .bind(&form.name)
        .bind(form.duration_minutes * 60)
        .bind(contest_id)
        .execute(&mut *tx)
        .await?;
    // Changing the problem set after the start would invalidate submissions
    if contest.is_pending() {
        replace_contest_problems(&mut tx, contest_id, &form.selected).await?;
    }
    tx.commit().await?;

    Ok(Redirect::to(&format!("/admin/contests/{contest_id}")).into_response())
}

pub async fn start_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    admin_or_return!(session);
    state.start_contest(contest_id).await?;
    Ok(Redirect::to(&format!("/admin/contests/{contest_id}")).into_response())
}

pub async fn end_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    admin_or_return!(session);
    state.end_contest(contest_id).await?;
    Ok(Redirect::to(&format!("/admin/contests/{contest_id}")).into_response())
}

pub async fn delete_contest(
    Path(contest_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    admin_or_return!(session);
    // Running contests must be ended first
    sqlx::query("DELETE FROM contests WHERE id = $1 AND status <> 'active'")
        .bind(contest_id)
        .execute(&state.db)
        .await?;
    Ok(Redirect::to("/admin").into_response())
}

// ---------- Submissions ----------

#[derive(Serialize, sqlx::FromRow)]
struct SubmissionView {
    id: String,
    username: String,
    problem_id: i32,
    problem_label: String,
    problem_title: String,
    verdict: String,
    code_length: i32,
    time: i32,
    code: String,
    created_at: i64,
}

type SubmissionRow = (
    String,
    String,
    i32,
    Option<i32>,
    String,
    String,
    i32,
    i32,
    String,
    i64,
);

#[derive(Deserialize)]
pub struct SubmissionsQuery {
    username: Option<String>,
    verdict: Option<String>,
    problem: Option<String>,
}

async fn fetch_submissions(
    state: &AppState,
    contest_id: i32,
    query: &SubmissionsQuery,
) -> Result<Vec<SubmissionView>, sqlx::Error> {
    let mut sql = sqlx::QueryBuilder::new(
        "SELECT s.id, s.username, s.problem_id, cp.problem_order, p.title AS problem_title,
                s.verdict, s.code_length, s.time, s.code, s.created_at
         FROM submissions s
         JOIN problems p ON p.id = s.problem_id
         LEFT JOIN contest_problems cp ON cp.contest_id = s.contest_id AND cp.problem_id = s.problem_id
         WHERE s.contest_id = ",
    );
    sql.push_bind(contest_id);
    if let Some(username) = query.username.as_deref().filter(|u| !u.is_empty()) {
        sql.push(" AND s.username = ").push_bind(username);
    }
    if let Some(verdict) = query.verdict.as_deref().filter(|v| !v.is_empty()) {
        sql.push(" AND s.verdict = ").push_bind(verdict);
    }
    if let Some(problem) = query.problem.as_deref().and_then(|p| p.parse::<i32>().ok()) {
        sql.push(" AND s.problem_id = ").push_bind(problem);
    }
    sql.push(" ORDER BY s.created_at DESC, s.id");

    let rows: Vec<SubmissionRow> = sql.build_query_as().fetch_all(&state.db).await?;
    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                username,
                problem_id,
                order,
                problem_title,
                verdict,
                code_length,
                time,
                code,
                created_at,
            )| {
                SubmissionView {
                    id,
                    username,
                    problem_id,
                    problem_label: order.map(order_label).unwrap_or_else(|| "?".into()),
                    problem_title,
                    verdict,
                    code_length,
                    time,
                    code,
                    created_at,
                }
            },
        )
        .collect())
}

#[derive(Template)]
#[template(path = "admin/submissions.html")]
struct SubmissionsTemplate {
    viewer: Viewer,
    contest: Contest,
    problems: Vec<crate::models::ContestProblem>,
    submissions: Vec<SubmissionView>,
    filter_username: String,
    filter_verdict: String,
    filter_problem: String,
    live: bool,
}

pub async fn submissions(
    Path(contest_id): Path<i32>,
    Query(query): Query<SubmissionsQuery>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let user = admin_or_return!(session);
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    render(SubmissionsTemplate {
        viewer: Viewer::from(Some(&user)),
        problems: problems::for_contest(&state.db, contest_id).await?,
        submissions: fetch_submissions(&state, contest_id, &query).await?,
        filter_username: query.username.unwrap_or_default(),
        filter_verdict: query.verdict.unwrap_or_default(),
        filter_problem: query.problem.unwrap_or_default(),
        live: contest.is_accepting_submissions(),
        contest,
    })
}

pub async fn api_submissions(
    Path(contest_id): Path<i32>,
    Query(query): Query<SubmissionsQuery>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    if require_admin(&session).await.is_err() {
        return Ok(StatusCode::UNAUTHORIZED.into_response());
    }
    Ok(Json(fetch_submissions(&state, contest_id, &query).await?).into_response())
}

// ---------- Problems ----------

#[derive(Template)]
#[template(path = "admin/problems.html")]
struct ProblemsTemplate {
    viewer: Viewer,
    problems: Vec<ProblemSummary>,
    error: Option<String>,
}

pub async fn problems_page(State(state): State<AppState>, session: Session) -> AppResult {
    let user = admin_or_return!(session);
    render(ProblemsTemplate {
        viewer: Viewer::from(Some(&user)),
        problems: problems::list(&state.db).await?,
        error: None,
    })
}

struct ContestUsage {
    id: i32,
    name: String,
    status: String,
}

#[derive(Template)]
#[template(path = "admin/problem.html")]
struct ProblemTemplate {
    viewer: Viewer,
    /// id is 0 for a problem that hasn't been saved yet
    problem: Problem,
    statement_html: String,
    used_in: Vec<ContestUsage>,
    error: Option<String>,
    saved: bool,
}

impl ProblemTemplate {
    fn is_new(&self) -> bool {
        self.problem.id == 0
    }

    fn is_live(&self) -> bool {
        self.used_in.iter().any(|c| c.status == "active")
    }
}

async fn problem_usage(
    state: &AppState,
    problem_id: i32,
) -> Result<Vec<ContestUsage>, sqlx::Error> {
    let rows: Vec<(i32, String, String)> = sqlx::query_as(
        "SELECT c.id, c.name, c.status FROM contests c
         JOIN contest_problems cp ON cp.contest_id = c.id
         WHERE cp.problem_id = $1 ORDER BY c.created_at DESC",
    )
    .bind(problem_id)
    .fetch_all(&state.db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, status)| ContestUsage { id, name, status })
        .collect())
}

const DEFAULT_GRADER: &str = r#"from submission import f

__t = int(input())
for __i in range(__t):
    __s = input()
    __import__('sys').stderr.write(f"TESTCASE {__i + 1}: {__s!r}\n")
    print(f(__s))
"#;

pub async fn new_problem_page(session: Session) -> AppResult {
    let user = admin_or_return!(session);
    render(ProblemTemplate {
        viewer: Viewer::from(Some(&user)),
        problem: Problem {
            id: 0,
            title: String::new(),
            statement: String::new(),
            test_input: String::new(),
            test_output: String::new(),
            grader: DEFAULT_GRADER.to_string(),
            time_limit_ms: problems::DEFAULT_TIME_LIMIT_MS,
            memory_limit_kb: problems::DEFAULT_MEMORY_LIMIT_KB,
        },
        statement_html: String::new(),
        used_in: Vec::new(),
        error: None,
        saved: false,
    })
}

#[derive(Deserialize)]
pub struct StatementPreviewForm {
    statement: String,
}

pub async fn preview_statement(
    session: Session,
    Form(form): Form<StatementPreviewForm>,
) -> AppResult {
    admin_or_return!(session);
    Ok(Html(markdown::render_markdown(&form.statement)).into_response())
}

#[derive(Deserialize)]
pub struct SavedQuery {
    saved: Option<String>,
}

pub async fn edit_problem_page(
    Path(problem_id): Path<i32>,
    Query(query): Query<SavedQuery>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let user = admin_or_return!(session);
    let Some(problem) = problems::get(&state.db, problem_id).await? else {
        return Ok(not_found());
    };
    render(ProblemTemplate {
        viewer: Viewer::from(Some(&user)),
        statement_html: markdown::render_markdown(&problem.statement),
        used_in: problem_usage(&state, problem_id).await?,
        problem,
        error: None,
        saved: query.saved.is_some(),
    })
}

#[derive(Deserialize)]
pub struct ProblemForm {
    title: String,
    statement: String,
    test_input: String,
    test_output: String,
    grader: String,
    time_limit_ms: String,
    memory_limit_mb: String,
}

impl ProblemForm {
    fn into_problem(self, id: i32) -> (Problem, Option<String>) {
        let time_limit_ms = self.time_limit_ms.trim().parse::<i32>();
        let memory_limit_mb = self.memory_limit_mb.trim().parse::<i32>();
        let problem = Problem {
            id,
            title: self.title.trim().to_string(),
            statement: normalize_newlines(&self.statement),
            test_input: normalize_newlines(&self.test_input),
            test_output: normalize_newlines(&self.test_output),
            grader: normalize_newlines(&self.grader),
            time_limit_ms: *time_limit_ms
                .as_ref()
                .unwrap_or(&problems::DEFAULT_TIME_LIMIT_MS),
            memory_limit_kb: memory_limit_mb
                .as_ref()
                .map(|mb| mb * 1024)
                .unwrap_or(problems::DEFAULT_MEMORY_LIMIT_KB),
        };
        let error = if problem.title.is_empty() {
            Some("Title is required".to_string())
        } else if problem.title.chars().count() > 200 {
            Some("Title must be at most 200 characters".to_string())
        } else if !time_limit_ms.is_ok_and(|t| (100..=10_000).contains(&t)) {
            Some("Time limit must be between 100 and 10000 ms".to_string())
        } else if !memory_limit_mb.is_ok_and(|m| (16..=1024).contains(&m)) {
            Some("Memory limit must be between 16 and 1024 MB".to_string())
        } else {
            None
        };
        (problem, error)
    }
}

pub async fn create_problem(
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<ProblemForm>,
) -> AppResult {
    let user = admin_or_return!(session);
    let (problem, error) = form.into_problem(0);
    if error.is_some() {
        return render(ProblemTemplate {
            viewer: Viewer::from(Some(&user)),
            statement_html: markdown::render_markdown(&problem.statement),
            problem,
            used_in: Vec::new(),
            error,
            saved: false,
        });
    }
    let now = chrono::Utc::now().timestamp();
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO problems (title, statement, test_input, test_output, grader, time_limit_ms, memory_limit_kb, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id",
    )
    .bind(&problem.title)
    .bind(&problem.statement)
    .bind(&problem.test_input)
    .bind(&problem.test_output)
    .bind(&problem.grader)
    .bind(problem.time_limit_ms)
    .bind(problem.memory_limit_kb)
    .bind(now)
    .fetch_one(&state.db)
    .await?;
    Ok(Redirect::to(&format!("/admin/problems/{id}?saved=1")).into_response())
}

pub async fn update_problem(
    Path(problem_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<ProblemForm>,
) -> AppResult {
    let user = admin_or_return!(session);
    if problems::get(&state.db, problem_id).await?.is_none() {
        return Ok(not_found());
    }
    let (problem, error) = form.into_problem(problem_id);
    if error.is_some() {
        return render(ProblemTemplate {
            viewer: Viewer::from(Some(&user)),
            statement_html: markdown::render_markdown(&problem.statement),
            used_in: problem_usage(&state, problem_id).await?,
            problem,
            error,
            saved: false,
        });
    }
    sqlx::query(
        "UPDATE problems SET title = $1, statement = $2, test_input = $3, test_output = $4, grader = $5,
                time_limit_ms = $6, memory_limit_kb = $7, updated_at = $8
         WHERE id = $9",
    )
    .bind(&problem.title)
    .bind(&problem.statement)
    .bind(&problem.test_input)
    .bind(&problem.test_output)
    .bind(&problem.grader)
    .bind(problem.time_limit_ms)
    .bind(problem.memory_limit_kb)
    .bind(chrono::Utc::now().timestamp())
    .bind(problem_id)
    .execute(&state.db)
    .await?;
    Ok(Redirect::to(&format!("/admin/problems/{problem_id}?saved=1")).into_response())
}

pub async fn duplicate_problem(
    Path(problem_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    admin_or_return!(session);
    let now = chrono::Utc::now().timestamp();
    let new_id: Option<i32> = sqlx::query_scalar(
        "INSERT INTO problems (title, statement, test_input, test_output, grader, time_limit_ms, memory_limit_kb, created_at, updated_at)
         SELECT title || ' (copy)', statement, test_input, test_output, grader, time_limit_ms, memory_limit_kb, $2, $2
         FROM problems WHERE id = $1
         RETURNING id",
    )
    .bind(problem_id)
    .bind(now)
    .fetch_optional(&state.db)
    .await?;
    Ok(match new_id {
        Some(id) => Redirect::to(&format!("/admin/problems/{id}")).into_response(),
        None => not_found(),
    })
}

pub async fn delete_problem(
    Path(problem_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let user = admin_or_return!(session);
    let in_use: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM contest_problems WHERE problem_id = $1)
             OR EXISTS (SELECT 1 FROM submissions WHERE problem_id = $1)",
    )
    .bind(problem_id)
    .fetch_one(&state.db)
    .await?;
    if in_use {
        return render(ProblemsTemplate {
            viewer: Viewer::from(Some(&user)),
            problems: problems::list(&state.db).await?,
            error: Some(
                "That problem is used by a contest or has submissions, so it can't be deleted. Remove it from its contests first (or delete those contests)."
                    .into(),
            ),
        });
    }
    sqlx::query("DELETE FROM problems WHERE id = $1")
        .bind(problem_id)
        .execute(&state.db)
        .await?;
    Ok(Redirect::to("/admin/problems").into_response())
}

/// Judge code against the saved version of a problem without recording a submission
pub async fn test_problem(
    Path(problem_id): Path<i32>,
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<SubmitForm>,
) -> AppResult {
    if require_admin(&session).await.is_err() {
        return Ok(SubmitResponse::error("Admin login required"));
    }
    let Some(problem) = problems::get(&state.db, problem_id).await? else {
        return Ok(SubmitResponse::error("Problem not found"));
    };
    let code = form.code();
    Ok(match run_judge(&problem, &code).await {
        Ok(result) => Json(SubmitResponse {
            verdict: result.verdict.as_str().to_string(),
            code_length: code.len() as i32,
            time: result.time_ms,
            output: result.output,
        })
        .into_response(),
        Err(message) => SubmitResponse::error(message),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn contest_form_orders_selected_problems() {
        let form = ContestForm::parse(&fields(&[
            ("name", "Round 2"),
            ("duration", "90"),
            ("pos_7", "2"),
            ("pos_3", ""),
            ("pos_5", "1"),
        ]))
        .ok()
        .unwrap();
        assert_eq!(form.name, "Round 2");
        assert_eq!(form.duration_minutes, 90);
        assert_eq!(form.selected, [(1, 5), (2, 7)]);
    }

    #[test]
    fn contest_form_rejects_bad_duration() {
        for duration in ["-5", "abc", "", "1.5", "35791395", "2147483648"] {
            let result = ContestForm::parse(&fields(&[("name", "x"), ("duration", duration)]));
            assert!(result.is_err(), "duration {duration} accepted");
        }
        assert!(ContestForm::parse(&fields(&[("name", "x")])).is_err());
    }

    #[test]
    fn contest_form_accepts_unlimited_and_long_durations() {
        for duration in ["0", "10081", "999999", "35791394"] {
            let result = ContestForm::parse(&fields(&[("name", "x"), ("duration", duration)]));
            assert!(result.is_ok(), "duration {duration} rejected");
        }
    }

    #[test]
    fn contest_form_requires_name() {
        assert!(ContestForm::parse(&fields(&[("name", "  "), ("duration", "60")])).is_err());
    }
}
