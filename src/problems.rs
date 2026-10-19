use crate::models::{ContestProblem, Problem, ProblemSummary};
use sqlx::PgPool;
use std::path::Path;

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

/// Import problems/{id}/ folders into the database. Idempotent: a folder is
/// inserted once (keyed by legacy_id), and placeholder rows created by the
/// 005 migration are filled in, but problems edited in the UI are never
/// overwritten.
pub async fn import_from_filesystem(db: &PgPool, dir: &Path) -> Result<usize, String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Ok(0);
    };
    let mut folders: Vec<_> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir())
        .collect();
    folders.sort_by_key(|e| {
        let name = e.file_name().to_string_lossy().to_string();
        (name.parse::<i64>().unwrap_or(i64::MAX), name)
    });

    let now = chrono::Utc::now().timestamp();
    let mut imported = 0;
    for entry in folders {
        let legacy_id = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let read = |name: &str| std::fs::read_to_string(path.join(name));
        let (Ok(statement), Ok(test_input), Ok(test_output), Ok(grader)) = (
            read("statement.md"),
            read("input.txt"),
            read("output.txt"),
            read("grader.py"),
        ) else {
            continue;
        };
        let (title, statement) = extract_and_remove_title(&statement);

        let result = sqlx::query(
            "INSERT INTO problems (legacy_id, title, statement, test_input, test_output, grader, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
             ON CONFLICT (legacy_id) DO UPDATE SET
                title = EXCLUDED.title, statement = EXCLUDED.statement,
                test_input = EXCLUDED.test_input, test_output = EXCLUDED.test_output,
                grader = EXCLUDED.grader, updated_at = EXCLUDED.updated_at
             WHERE problems.statement = '' AND problems.grader = ''",
        )
        .bind(&legacy_id)
        .bind(&title)
        .bind(&statement)
        .bind(&test_input)
        .bind(&test_output)
        .bind(&grader)
        .bind(now)
        .execute(db)
        .await
        .map_err(|e| format!("importing problem {legacy_id}: {e}"))?;
        imported += result.rows_affected() as usize;
    }
    Ok(imported)
}

/// Extract title from markdown (first `# ` heading) and remove it from the content
fn extract_and_remove_title(markdown: &str) -> (String, String) {
    let lines: Vec<&str> = markdown.lines().collect();
    let Some(i) = lines.iter().position(|l| l.trim().starts_with("# ")) else {
        return ("Untitled Problem".to_string(), markdown.to_string());
    };
    let title = lines[i].trim()[2..].trim().to_string();
    let statement = lines
        .iter()
        .enumerate()
        .filter(|&(idx, _)| idx != i)
        .map(|(_, l)| *l)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    (title, statement)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_extraction() {
        let (title, body) = extract_and_remove_title("# Hello World\n\nBody text");
        assert_eq!(title, "Hello World");
        assert_eq!(body, "Body text");
    }

    #[test]
    fn missing_title() {
        let (title, body) = extract_and_remove_title("Body only");
        assert_eq!(title, "Untitled Problem");
        assert_eq!(body, "Body only");
    }
}
