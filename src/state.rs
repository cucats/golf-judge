use sqlx::PgPool;
use crate::models::Contest;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub admin_token: String,
}

impl AppState {
    pub fn new(db: PgPool, admin_token: String) -> Self {
        Self {
            db,
            admin_token,
        }
    }

    // Contest helper methods
    pub async fn get_contest(&self, contest_id: i32) -> Result<Option<Contest>, sqlx::Error> {
        sqlx::query_as::<_, Contest>("SELECT * FROM contests WHERE id = $1")
            .bind(contest_id)
            .fetch_optional(&self.db)
            .await
    }

    pub fn is_contest_active(&self, contest: &Contest) -> bool {
        contest.status == "active" && !self.is_contest_ended(contest)
    }

    pub fn is_contest_ended(&self, contest: &Contest) -> bool {
        if let Some(start_time) = contest.start_time {
            let now = chrono::Utc::now().timestamp();
            return now >= start_time + contest.duration as i64;
        }
        false
    }

    pub fn get_time_remaining(&self, contest: &Contest) -> Option<i64> {
        if let Some(start_time) = contest.start_time {
            let now = chrono::Utc::now().timestamp();
            let remaining = (start_time + contest.duration as i64 - now).max(0);
            Some(remaining)
        } else {
            None
        }
    }

    pub async fn start_contest(&self, contest_id: i32) -> Result<(), sqlx::Error> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE contests SET start_time = $1, status = 'active' WHERE id = $2")
            .bind(now)
            .bind(contest_id)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn end_contest(&self, contest_id: i32) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE contests SET status = 'ended' WHERE id = $1")
            .bind(contest_id)
            .execute(&self.db)
            .await?;
        Ok(())
    }
}
