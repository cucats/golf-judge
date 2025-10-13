use tower_sessions::{Expiry, MemoryStore, Session, SessionManagerLayer};

pub fn session_layer() -> SessionManagerLayer<MemoryStore> {
    let session_store = MemoryStore::default();
    SessionManagerLayer::new(session_store)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(1)))
}

pub struct SessionUser {
    pub username: String,
    pub is_admin: bool,
}

pub async fn get_user(session: &Session) -> Option<SessionUser> {
    let username: String = session.get::<String>("username").await.ok()??;
    let is_admin: bool = session.get::<bool>("is_admin").await.ok().flatten().unwrap_or(false);
    Some(SessionUser { username, is_admin })
}

pub async fn set_user(session: &Session, username: String, is_admin: bool) -> Result<(), tower_sessions::session::Error> {
    session.insert("username", username).await?;
    session.insert("is_admin", is_admin).await?;
    Ok(())
}

pub async fn clear_user(session: &Session) -> Result<(), tower_sessions::session::Error> {
    session.remove::<String>("username").await?;
    session.remove::<bool>("is_admin").await?;
    Ok(())
}
