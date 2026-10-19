use crate::models::ContestProblem;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct ProblemResult {
    pub code_length: i32,
    pub medal: &'static str, // "diamond", "gold" or "none"
}

#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub rank: usize,
    pub username: String,
    pub problems_solved: usize,
    pub total_bytes: i64,
    pub problem_results: Vec<Option<ProblemResult>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Leaderboard {
    pub problem_ids: Vec<i32>,
    pub problem_labels: Vec<String>,
    pub problem_titles: Vec<String>,
    pub entries: Vec<Entry>,
}

pub async fn load(db: &PgPool, contest_id: i32) -> Result<Leaderboard, sqlx::Error> {
    let problems = crate::problems::for_contest(db, contest_id).await?;
    let participants: Vec<String> =
        sqlx::query_scalar("SELECT username FROM contest_participants WHERE contest_id = $1")
            .bind(contest_id)
            .fetch_all(db)
            .await?;
    let best: Vec<(String, i32, i32)> = sqlx::query_as(
        "SELECT username, problem_id, MIN(code_length)
         FROM submissions
         WHERE contest_id = $1 AND verdict = 'AC'
         GROUP BY username, problem_id",
    )
    .bind(contest_id)
    .fetch_all(db)
    .await?;
    Ok(compute(&problems, participants, &best))
}

/// `best` holds each user's shortest accepted length per problem
pub fn compute(
    problems: &[ContestProblem],
    participants: Vec<String>,
    best: &[(String, i32, i32)],
) -> Leaderboard {
    let column: HashMap<i32, usize> = problems
        .iter()
        .enumerate()
        .map(|(i, p)| (p.id, i))
        .collect();

    let mut shortest: HashMap<i32, (i32, usize)> = HashMap::new();
    for &(_, pid, len) in best.iter().filter(|(_, pid, _)| column.contains_key(pid)) {
        let slot = shortest.entry(pid).or_insert((len, 0));
        if len < slot.0 {
            *slot = (len, 1);
        } else if len == slot.0 {
            slot.1 += 1;
        }
    }

    let mut results: HashMap<String, Vec<Option<ProblemResult>>> = participants
        .into_iter()
        .map(|u| (u, vec![None; problems.len()]))
        .collect();
    for (username, pid, len) in best {
        let Some(&col) = column.get(pid) else {
            continue;
        };
        let (best_len, holders) = shortest[pid];
        let medal = match (*len == best_len, holders) {
            (true, 1) => "diamond",
            (true, _) => "gold",
            _ => "none",
        };
        results
            .entry(username.clone())
            .or_insert_with(|| vec![None; problems.len()])[col] = Some(ProblemResult {
            code_length: *len,
            medal,
        });
    }

    let mut entries: Vec<Entry> = results
        .into_iter()
        .map(|(username, problem_results)| {
            let solved = problem_results.iter().flatten();
            Entry {
                rank: 0,
                problems_solved: solved.clone().count(),
                total_bytes: solved.map(|r| r.code_length as i64).sum(),
                username,
                problem_results,
            }
        })
        .collect();
    entries.sort_by(|a, b| {
        b.problems_solved
            .cmp(&a.problems_solved)
            .then(a.total_bytes.cmp(&b.total_bytes))
            .then(a.username.cmp(&b.username))
    });
    for i in 0..entries.len() {
        let tied_with_previous = i > 0
            && entries[i].problems_solved == entries[i - 1].problems_solved
            && entries[i].total_bytes == entries[i - 1].total_bytes;
        entries[i].rank = if tied_with_previous {
            entries[i - 1].rank
        } else {
            i + 1
        };
    }

    Leaderboard {
        problem_ids: problems.iter().map(|p| p.id).collect(),
        problem_labels: problems.iter().map(ContestProblem::label).collect(),
        problem_titles: problems.iter().map(|p| p.title.clone()).collect(),
        entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn problem(id: i32, order: i32) -> ContestProblem {
        ContestProblem {
            id,
            title: format!("P{id}"),
            problem_order: order,
        }
    }

    fn row(user: &str, pid: i32, len: i32) -> (String, i32, i32) {
        (user.to_string(), pid, len)
    }

    #[test]
    fn ranks_by_solved_then_bytes_with_medals() {
        let problems = [problem(10, 0), problem(20, 1)];
        let best = [
            row("alice", 10, 50),
            row("alice", 20, 80),
            row("bob", 10, 40),
            row("carol", 10, 50),
            row("carol", 20, 80),
        ];
        let lb = compute(&problems, vec!["dave".into()], &best);
        let order: Vec<_> = lb
            .entries
            .iter()
            .map(|e| (e.username.as_str(), e.rank))
            .collect();
        assert_eq!(order, [("alice", 1), ("carol", 1), ("bob", 3), ("dave", 4)]);

        let bob = &lb.entries[2];
        assert_eq!(bob.problem_results[0].as_ref().unwrap().medal, "diamond");
        let alice = &lb.entries[0];
        assert_eq!(alice.problem_results[0].as_ref().unwrap().medal, "none");
        assert_eq!(alice.problem_results[1].as_ref().unwrap().medal, "gold");
        assert_eq!(alice.total_bytes, 130);
    }

    #[test]
    fn ignores_problems_outside_contest() {
        let lb = compute(&[problem(10, 0)], vec![], &[row("mallory", 99, 1)]);
        assert!(lb.entries.is_empty());
    }
}
