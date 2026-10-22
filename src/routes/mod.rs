pub mod admin;
pub mod auth;
pub mod contest;
pub mod player;

use askama::Template;
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse, Redirect, Response},
};
use tower_sessions::Session;

use crate::session::{self, SessionUser};

/// Who is looking at the page; every template gets one for the nav bar
pub struct Viewer {
    pub username: Option<String>,
    pub is_admin: bool,
}

impl From<Option<&SessionUser>> for Viewer {
    fn from(user: Option<&SessionUser>) -> Self {
        Self {
            username: user.map(|u| u.username.clone()),
            is_admin: user.is_some_and(|u| u.is_admin),
        }
    }
}

#[derive(Template)]
#[template(path = "tips.html")]
struct TipsTemplate {
    viewer: Viewer,
    content: String,
}

pub async fn tips(session: Session) -> AppResult {
    let user = session::get_user(&session).await;
    render(TipsTemplate {
        viewer: Viewer::from(user.as_ref()),
        content: crate::markdown::render_markdown(include_str!("../../content/tips.md")),
    })
}

pub struct AppError(String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        eprintln!("internal error: {}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        Self(e.to_string())
    }
}

impl From<askama::Error> for AppError {
    fn from(e: askama::Error) -> Self {
        Self(e.to_string())
    }
}

pub type AppResult = Result<Response, AppError>;

pub fn render(template: impl Template) -> AppResult {
    Ok(Html(template.render()?).into_response())
}

pub fn not_found() -> Response {
    (StatusCode::NOT_FOUND, "Not found").into_response()
}

/// Redirect target from a `next` parameter, restricted to same-site paths
pub fn safe_next(next: Option<&str>) -> String {
    match next {
        Some(n) if n.starts_with('/') && !n.starts_with("//") && !n.contains('\\') => n.to_string(),
        _ => "/".to_string(),
    }
}

pub fn login_redirect(next: &str) -> Response {
    Redirect::to(&format!("/login?next={}", urlencoding::encode(next))).into_response()
}

pub async fn require_admin(session: &Session) -> Result<SessionUser, Response> {
    match session::get_user(session).await {
        Some(user) if user.is_admin => Ok(user),
        Some(_) => Err(Redirect::to("/").into_response()),
        None => Err(Redirect::to("/admin/login").into_response()),
    }
}

/// Browser textareas submit CRLF line endings
pub fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_must_be_local_path() {
        assert_eq!(safe_next(Some("/contest/1/join")), "/contest/1/join");
        assert_eq!(safe_next(Some("https://evil.example")), "/");
        assert_eq!(safe_next(Some("//evil.example")), "/");
        assert_eq!(safe_next(Some("/\\evil.example")), "/");
        assert_eq!(safe_next(None), "/");
    }
}
