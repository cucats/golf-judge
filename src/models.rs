use serde::Serialize;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Contest {
    pub id: i32,
    pub name: String,
    pub duration: i32,
    pub start_time: Option<i64>,
    pub status: String,
    pub created_at: i64,
}

impl Contest {
    pub fn is_pending(&self) -> bool {
        self.status == "pending"
    }

    pub fn is_ended(&self) -> bool {
        self.status == "ended" || self.time_remaining() == Some(0)
    }

    pub fn is_accepting_submissions(&self) -> bool {
        self.status == "active" && !self.is_ended()
    }

    pub fn time_remaining(&self) -> Option<i64> {
        let start_time = self.start_time?;
        let now = chrono::Utc::now().timestamp();
        Some((start_time + self.duration as i64 - now).max(0))
    }

    pub fn duration_minutes(&self) -> i32 {
        self.duration / 60
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Problem {
    pub id: i32,
    pub title: String,
    pub statement: String,
    pub test_input: String,
    pub test_output: String,
    pub grader: String,
    pub time_limit_ms: i32,
    pub memory_limit_kb: i32,
}

impl Problem {
    pub fn memory_limit_mb(&self) -> i32 {
        self.memory_limit_kb / 1024
    }

    pub fn test_count(&self) -> usize {
        self.test_output.trim().lines().count()
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ProblemSummary {
    pub id: i32,
    pub title: String,
    pub contest_count: i64,
    pub submission_count: i64,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ContestProblem {
    pub id: i32,
    pub title: String,
    pub problem_order: i32,
}

impl ContestProblem {
    pub fn label(&self) -> String {
        order_label(self.problem_order)
    }
}

/// 0 -> "A", 1 -> "B", ..., 25 -> "Z", 26 -> "AA"
pub fn order_label(order: i32) -> String {
    let mut n = order.max(0) as u32;
    let mut label = String::new();
    loop {
        label.insert(0, char::from(b'A' + (n % 26) as u8));
        if n < 26 {
            return label;
        }
        n = n / 26 - 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_labels() {
        assert_eq!(order_label(0), "A");
        assert_eq!(order_label(25), "Z");
        assert_eq!(order_label(26), "AA");
        assert_eq!(order_label(27), "AB");
    }
}
