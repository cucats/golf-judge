use crate::models::Contest;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub admin_password: String,
}

impl AppState {
    pub async fn get_contest(&self, contest_id: i32) -> Result<Option<Contest>, sqlx::Error> {
        sqlx::query_as::<_, Contest>("SELECT * FROM contests WHERE id = $1")
            .bind(contest_id)
            .fetch_optional(&self.db)
            .await
    }

    pub async fn start_contest(&self, contest_id: i32) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE contests SET start_time = $1, status = 'active' WHERE id = $2 AND status = 'pending'",
        )
        .bind(chrono::Utc::now().timestamp())
        .bind(contest_id)
        .execute(&self.db)
        .await?;
        Ok(())
    }

    pub async fn end_contest(&self, contest_id: i32) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE contests SET status = 'ended' WHERE id = $1 AND status = 'active'")
            .bind(contest_id)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn auto_end_expired_contests(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE contests SET status = 'ended'
             WHERE status = 'active' AND start_time IS NOT NULL AND $1 >= start_time + duration",
        )
        .bind(chrono::Utc::now().timestamp())
        .execute(&self.db)
        .await?;
        Ok(())
    }
}
