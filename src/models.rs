use serde::{Deserialize, Serialize};

// Database models

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub username: String,
    pub is_admin: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Problem {
    pub id: i32,
    pub title: String,
    pub statement: String,
    pub test_input: String,
    pub test_output: String,
    pub time_limit_secs: f64,
    pub memory_limit_kb: i32,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Contest {
    pub id: i32,
    pub name: String,
    pub duration: i32,
    pub start_time: Option<i64>,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ContestProblem {
    pub contest_id: i32,
    pub problem_id: i32,
    pub problem_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Submission {
    pub id: String,
    pub username: String,
    pub contest_id: i32,
    pub problem_id: i32,
    pub verdict: String,
    pub code_length: i32,
    pub time: i32,
    pub code: String,
    pub created_at: i64,
}

// View models for API responses

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProblemWithStatement {
    pub id: i32,
    pub title: String,
    pub statement: String, // Rendered markdown
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContestWithProblems {
    pub id: i32,
    pub name: String,
    pub duration: i32,
    pub start_time: Option<i64>,
    pub status: String,
    pub problems: Vec<ProblemWithStatement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderboardEntry {
    pub username: String,
    pub solved: i32,
    pub score: i32,
    pub golds: Vec<i32>,
    pub diamonds: Vec<i32>,
    pub problem_scores: Vec<ProblemScore>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProblemScore {
    pub score: i32,
    pub verdict: String,
}
