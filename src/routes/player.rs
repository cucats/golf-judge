use askama::Template;
use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Redirect},
};
use serde::Deserialize;
use tower_sessions::Session;

use super::{AppResult, Viewer, not_found, render};
use crate::{
    leaderboard::{self, Entry},
    models::Contest,
    problems, session,
    state::AppState,
};

/// Admins may always inspect a player's code; everyone else once the contest is over
pub fn can_inspect(contest: &Contest, is_admin: bool) -> bool {
    is_admin || contest.is_ended()
}

#[derive(Deserialize)]
pub struct PlayerQuery {
    user: String,
    problem: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct SubmissionRow {
    id: String,
    problem_id: i32,
    verdict: String,
    code_length: i32,
    time: i32,
    code: String,
    created_at: i64,
}

#[derive(Clone)]
struct ProblemCard {
    id: i32,
    label: String,
    title: String,
    bytes: Option<i32>,
    medal: &'static str,
    attempts: usize,
    selected: bool,
}

/// A submission that set a new personal best on its problem
struct Record {
    id: String,
    code_length: i32,
    code: String,
    elapsed: String,
}

struct BestSolution {
    problem_id: i32,
    label: String,
    title: String,
    medal: &'static str,
    /// Oldest first; the last one is the solution behind the score
    records: Vec<Record>,
}

impl BestSolution {
    fn best(&self) -> &Record {
        self.records
            .last()
            .expect("a best solution has at least one record")
    }
}

struct Attempt {
    id: String,
    label: String,
    title: String,
    verdict: String,
    code_length: i32,
    time: i32,
    code: String,
    created_at: i64,
    elapsed: String,
    is_best: bool,
}

#[derive(Template)]
#[template(path = "contest/player.html")]
struct PlayerTemplate {
    viewer: Viewer,
    contest: Contest,
    entry: Entry,
    player_count: usize,
    problem_count: usize,
    cards: Vec<ProblemCard>,
    selected: Option<ProblemCard>,
    best_solutions: Vec<BestSolution>,
    attempts: Vec<Attempt>,
}

/// Time since the contest started, as h:mm:ss
fn elapsed(contest: &Contest, at: i64) -> String {
    let Some(start) = contest.start_time else {
        return String::new();
    };
    let secs = (at - start).max(0);
    format!("{}:{:02}:{:02}", secs / 3600, secs / 60 % 60, secs % 60)
}

pub async fn player_page(
    Path(contest_id): Path<i32>,
    Query(query): Query<PlayerQuery>,
    State(state): State<AppState>,
    session: Session,
) -> AppResult {
    let Some(contest) = state.get_contest(contest_id).await? else {
        return Ok(not_found());
    };
    let user = session::get_user(&session).await;
    let is_admin = user.as_ref().is_some_and(|u| u.is_admin);
    if !can_inspect(&contest, is_admin) {
        return Ok(Redirect::to(&format!("/contest/{contest_id}/leaderboard")).into_response());
    }

    let board = leaderboard::load(&state.db, contest_id).await?;
    let player_count = board.entries.len();
    let Some(entry) = board.entries.into_iter().find(|e| e.username == query.user) else {
        return Ok(not_found());
    };
    let contest_problems = problems::for_contest(&state.db, contest_id).await?;
    let submissions: Vec<SubmissionRow> = sqlx::query_as(
        "SELECT id, problem_id, verdict, code_length, time, code, created_at
         FROM submissions WHERE contest_id = $1 AND username = $2
         ORDER BY created_at, id",
    )
    .bind(contest_id)
    .bind(&entry.username)
    .fetch_all(&state.db)
    .await?;

    let mut cards = Vec::new();
    let mut best_solutions = Vec::new();
    let mut best_ids = Vec::new();
    for (col, problem) in contest_problems.iter().enumerate() {
        let result = entry.problem_results[col].as_ref();
        let mine = submissions.iter().filter(|s| s.problem_id == problem.id);
        let mut records: Vec<Record> = Vec::new();
        for s in mine.clone().filter(|s| s.verdict == "AC") {
            if records.last().is_none_or(|r| s.code_length < r.code_length) {
                records.push(Record {
                    id: s.id.clone(),
                    code_length: s.code_length,
                    code: s.code.clone(),
                    elapsed: elapsed(&contest, s.created_at),
                });
            }
        }
        let medal = result.map_or("none", |r| r.medal);
        if let Some(best) = records.last() {
            best_ids.push(best.id.clone());
            best_solutions.push(BestSolution {
                problem_id: problem.id,
                label: problem.label(),
                title: problem.title.clone(),
                medal,
                records,
            });
        }
        cards.push(ProblemCard {
            id: problem.id,
            label: problem.label(),
            title: problem.title.clone(),
            bytes: result.map(|r| r.code_length),
            medal,
            attempts: mine.filter(|s| s.verdict != "SE").count(),
            selected: query.problem == Some(problem.id),
        });
    }

    let selected = cards.iter().find(|c| c.selected).cloned();
    if let Some(card) = &selected {
        best_solutions.retain(|b| b.problem_id == card.id);
    }

    let mut attempts: Vec<Attempt> = submissions
        .into_iter()
        .filter(|s| selected.as_ref().is_none_or(|c| c.id == s.problem_id))
        .filter_map(|s| {
            let problem = contest_problems.iter().find(|p| p.id == s.problem_id)?;
            Some(Attempt {
                is_best: best_ids.contains(&s.id),
                elapsed: elapsed(&contest, s.created_at),
                label: problem.label(),
                title: problem.title.clone(),
                id: s.id,
                verdict: s.verdict,
                code_length: s.code_length,
                time: s.time,
                code: s.code,
                created_at: s.created_at,
            })
        })
        .collect();
    attempts.reverse();

    render(PlayerTemplate {
        viewer: Viewer::from(user.as_ref()),
        problem_count: contest_problems.len(),
        contest,
        entry,
        player_count,
        cards,
        selected,
        best_solutions,
        attempts,
    })
}
