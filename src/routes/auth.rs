use askama::Template;
use axum::{
    Form,
    extract::{Query, State},
    response::{IntoResponse, Redirect},
};
use serde::Deserialize;
use tower_sessions::Session;

use super::{AppResult, Viewer, render, safe_next};
use crate::{session, state::AppState};

const MAX_USERNAME_CHARS: usize = 32;
const MIN_PASSWORD_CHARS: usize = 4;

#[derive(Template)]
#[template(path = "login.html")]
struct LoginTemplate {
    viewer: Viewer,
    error: Option<String>,
    next: String,
    username: String,
}

#[derive(Deserialize)]
pub struct NextQuery {
    next: Option<String>,
}

pub async fn login_page(Query(query): Query<NextQuery>, session: Session) -> AppResult {
    let next = safe_next(query.next.as_deref());
    if session::get_user(&session).await.is_some() {
        return Ok(Redirect::to(&next).into_response());
    }
    render(LoginTemplate {
        viewer: Viewer::from(None),
        error: None,
        next,
        username: String::new(),
    })
}

#[derive(Deserialize)]
pub struct LoginForm {
    username: String,
    password: String,
    next: Option<String>,
}

fn validate_username(username: &str) -> Result<(), String> {
    if username.is_empty() {
        return Err("Username is required".into());
    }
    if username.chars().count() > MAX_USERNAME_CHARS {
        return Err(format!(
            "Username must be at most {MAX_USERNAME_CHARS} characters"
        ));
    }
    if username.chars().any(char::is_control) {
        return Err("Username contains invalid characters".into());
    }
    Ok(())
}

pub async fn login_post(
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<LoginForm>,
) -> AppResult {
    let username = form.username.trim();
    let next = safe_next(form.next.as_deref());

    let outcome = match validate_username(username) {
        Ok(()) => authenticate(&state, username, &form.password).await?,
        Err(error) => Err(error),
    };
    let is_admin = match outcome {
        Ok(is_admin) => is_admin,
        Err(error) => {
            return render(LoginTemplate {
                viewer: Viewer::from(None),
                error: Some(error),
                next,
                username: username.to_string(),
            });
        }
    };

    session::set_user(&session, username.to_string(), is_admin)
        .await
        .map_err(|e| super::AppError(e.to_string()))?;
    Ok(Redirect::to(&next).into_response())
}

/// Returns the database admin role only after successful authentication.
async fn authenticate(
    state: &AppState,
    username: &str,
    password: &str,
) -> Result<Result<bool, String>, sqlx::Error> {
    const WRONG: &str = "Incorrect password for this username";
    if password.is_empty() {
        return Ok(Err("Password is required".into()));
    }
    ensure_user(state, username).await?;
    let (stored, is_admin): (Option<String>, bool) =
        sqlx::query_as("SELECT password_hash, is_admin FROM users WHERE username = $1")
            .bind(username)
            .fetch_one(&state.db)
            .await?;
    // argon2 takes tens of milliseconds of CPU; keep it off the async workers
    let password = password.to_string();
    if let Some(hash) = stored {
        let matches = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
            .await
            .expect("password check panicked");
        return Ok(matches.then_some(is_admin).ok_or(WRONG.into()));
    }
    if password.chars().count() < MIN_PASSWORD_CHARS {
        return Ok(Err(format!(
            "Choose a password of at least {MIN_PASSWORD_CHARS} characters"
        )));
    }
    let claimed = sqlx::query(
        "UPDATE users SET password_hash = $2 WHERE username = $1 AND password_hash IS NULL AND NOT is_admin",
    )
    .bind(username)
    .bind(
        tokio::task::spawn_blocking(move || hash_password(&password))
            .await
            .expect("password hashing panicked"),
    )
    .execute(&state.db)
    .await?
    .rows_affected()
        == 1;
    Ok(claimed.then_some(false).ok_or(WRONG.into()))
}

fn hash_password(password: &str) -> String {
    use argon2::password_hash::{PasswordHasher, SaltString, rand_core::OsRng};
    argon2::Argon2::default()
        .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
        .expect("argon2 hashing with default parameters cannot fail")
        .to_string()
}

fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    PasswordHash::new(hash).is_ok_and(|parsed| {
        argon2::Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}

async fn ensure_user(state: &AppState, username: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO users (username, is_admin, created_at) VALUES ($1, FALSE, $2)
         ON CONFLICT (username) DO NOTHING",
    )
    .bind(username)
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.db)
    .await?;
    Ok(())
}

pub async fn logout(session: Session) -> impl IntoResponse {
    let _ = session.flush().await;
    Redirect::to("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_rules() {
        assert!(validate_username("alice").is_ok());
        assert!(validate_username("").is_err());
        assert!(validate_username(&"x".repeat(33)).is_err());
        assert!(validate_username("a\u{0}b").is_err());
    }

    #[test]
    fn password_hash_roundtrip() {
        let hash = hash_password("hunter2");
        assert!(verify_password("hunter2", &hash));
        assert!(!verify_password("hunter3", &hash));
        assert!(!verify_password("hunter2", "not a hash"));
    }
}
