use tower_sessions::{Expiry, MemoryStore, Session, SessionManagerLayer};

pub fn session_layer() -> SessionManagerLayer<MemoryStore> {
    let secure = std::env::var("INSECURE_COOKIES").is_err();
    SessionManagerLayer::new(MemoryStore::default())
        .with_secure(secure)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(1)))
}

pub struct SessionUser {
    pub username: String,
    pub is_admin: bool,
}

pub async fn get_user(session: &Session) -> Option<SessionUser> {
    let username: String = session.get("username").await.ok()??;
    let is_admin = session
        .get("is_admin")
        .await
        .ok()
        .flatten()
        .unwrap_or(false);
    Some(SessionUser { username, is_admin })
}

pub async fn set_user(
    session: &Session,
    username: String,
    is_admin: bool,
) -> Result<(), tower_sessions::session::Error> {
    session.cycle_id().await?;
    session.insert("username", username).await?;
    session.insert("is_admin", is_admin).await?;
    Ok(())
}
