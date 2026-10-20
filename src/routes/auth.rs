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
    if let Err(error) = outcome {
        return render(LoginTemplate {
            viewer: Viewer::from(None),
            error: Some(error),
            next,
            username: username.to_string(),
        });
    }

    session::set_user(&session, username.to_string(), false)
        .await
        .map_err(|e| super::AppError(e.to_string()))?;
    Ok(Redirect::to(&next).into_response())
}

/// The first login with a username claims it with that password; later logins must match
async fn authenticate(
    state: &AppState,
    username: &str,
    password: &str,
) -> Result<Result<(), String>, sqlx::Error> {
    const WRONG: &str = "Incorrect password for this username";
    if password.is_empty() {
        return Ok(Err("Password is required".into()));
    }
    ensure_user(state, username).await?;
    let stored: Option<String> =
        sqlx::query_scalar("SELECT password_hash FROM users WHERE username = $1")
            .bind(username)
            .fetch_one(&state.db)
            .await?;
    if let Some(hash) = stored {
        return Ok(verify_password(password, &hash).then_some(()).ok_or(WRONG.into()));
    }
    if password.chars().count() < MIN_PASSWORD_CHARS {
        return Ok(Err(format!(
            "Choose a password of at least {MIN_PASSWORD_CHARS} characters"
        )));
    }
    let claimed = sqlx::query(
        "UPDATE users SET password_hash = $2 WHERE username = $1 AND password_hash IS NULL",
    )
    .bind(username)
    .bind(hash_password(password))
    .execute(&state.db)
    .await?
    .rows_affected()
        == 1;
    Ok(claimed.then_some(()).ok_or(WRONG.into()))
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

#[derive(Template)]
#[template(path = "admin/login.html")]
struct AdminLoginTemplate {
    viewer: Viewer,
    error: Option<String>,
    username: String,
}

pub async fn admin_login_page(session: Session) -> AppResult {
    if session::get_user(&session)
        .await
        .is_some_and(|u| u.is_admin)
    {
        return Ok(Redirect::to("/admin").into_response());
    }
    render(AdminLoginTemplate {
        viewer: Viewer::from(session::get_user(&session).await.as_ref()),
        error: None,
        username: "admin".to_string(),
    })
}

#[derive(Deserialize)]
pub struct AdminLoginForm {
    username: String,
    password: String,
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub async fn admin_login_post(
    State(state): State<AppState>,
    session: Session,
    Form(form): Form<AdminLoginForm>,
) -> AppResult {
    let username = form.username.trim();
    let error = if !constant_time_eq(form.password.as_bytes(), state.admin_password.as_bytes()) {
        Some("Incorrect password".to_string())
    } else {
        validate_username(username).err()
    };
    if let Some(error) = error {
        return render(AdminLoginTemplate {
            viewer: Viewer::from(session::get_user(&session).await.as_ref()),
            error: Some(error),
            username: username.to_string(),
        });
    }

    ensure_user(&state, username).await?;
    session::set_user(&session, username.to_string(), true)
        .await
        .map_err(|e| super::AppError(e.to_string()))?;
    Ok(Redirect::to("/admin").into_response())
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

    #[test]
    fn password_compare() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secreT"));
        assert!(!constant_time_eq(b"secret", b"secret2"));
    }
}
