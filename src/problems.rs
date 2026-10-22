use crate::models::{ContestProblem, Problem, ProblemSummary};
use sqlx::PgPool;

pub const DEFAULT_TIME_LIMIT_MS: i32 = 1000;
pub const DEFAULT_MEMORY_LIMIT_KB: i32 = 262144;

pub async fn get(db: &PgPool, problem_id: i32) -> Result<Option<Problem>, sqlx::Error> {
    sqlx::query_as::<_, Problem>(
        "SELECT id, title, statement, test_input, test_output, grader, time_limit_ms, memory_limit_kb
         FROM problems WHERE id = $1",
    )
    .bind(problem_id)
    .fetch_optional(db)
    .await
}

/// Fetch a problem only if it belongs to the given contest
pub async fn get_in_contest(
    db: &PgPool,
    contest_id: i32,
    problem_id: i32,
) -> Result<Option<(Problem, i32)>, sqlx::Error> {
    let order: Option<i32> = sqlx::query_scalar(
        "SELECT problem_order FROM contest_problems WHERE contest_id = $1 AND problem_id = $2",
    )
    .bind(contest_id)
    .bind(problem_id)
    .fetch_optional(db)
    .await?;
    let Some(order) = order else {
        return Ok(None);
    };
    Ok(get(db, problem_id).await?.map(|p| (p, order)))
}

pub async fn list(db: &PgPool) -> Result<Vec<ProblemSummary>, sqlx::Error> {
    sqlx::query_as::<_, ProblemSummary>(
        "SELECT p.id, p.title,
                (SELECT COUNT(*) FROM contest_problems cp WHERE cp.problem_id = p.id) AS contest_count,
                (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id) AS submission_count
         FROM problems p
         ORDER BY p.id",
    )
    .fetch_all(db)
    .await
}

pub async fn for_contest(db: &PgPool, contest_id: i32) -> Result<Vec<ContestProblem>, sqlx::Error> {
    sqlx::query_as::<_, ContestProblem>(
        "SELECT p.id, p.title, cp.problem_order
         FROM contest_problems cp JOIN problems p ON p.id = cp.problem_id
         WHERE cp.contest_id = $1
         ORDER BY cp.problem_order",
    )
    .bind(contest_id)
    .fetch_all(db)
    .await
}
