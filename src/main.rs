mod languages;
mod markdown;
mod models;
mod problems;
mod routes;
mod runner;
mod session;
mod state;

use axum::{
    Router,
    routing::{get, post},
};
use sqlx::postgres::PgPoolOptions;
use state::AppState;
use std::env;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    // Generate admin token
    let admin_token = generate_token();
    println!("https://golf.cucats.org/auth/{admin_token}");

    // Connect to database
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    // Initialize state
    let state = AppState::new(pool, admin_token);

    // Start background task to auto-end expired contests
    let state_clone = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
        loop {
            interval.tick().await;
            let _ = state_clone.auto_end_expired_contests().await;
        }
    });

    // Build router
    let app = Router::new()
        .route("/", get(routes::index))
        .route("/login", get(routes::login_page).post(routes::login_post))
        .route("/auth/{token}", get(routes::admin_auth))
        .route("/admin", get(routes::admin_dashboard))
        .route(
            "/admin/contests/new",
            get(routes::admin_create_contest_page),
        )
        .route("/admin/contests", post(routes::admin_create_contest))
        .route("/admin/contests/{id}", get(routes::admin_manage_contest))
        .route(
            "/admin/contests/{id}/start",
            post(routes::admin_start_contest),
        )
        .route("/admin/contests/{id}/end", post(routes::admin_end_contest))
        .route(
            "/admin/contests/{id}/delete",
            post(routes::admin_delete_contest),
        )
        .route(
            "/admin/contests/{id}/submissions",
            get(routes::admin_submissions),
        )
        .route("/contest/{id}/join", get(routes::contest_join))
        .route("/contest/{id}/waiting", get(routes::contest_waiting))
        .route("/contest/{id}/problems", get(routes::contest_problems))
        .route("/contest/{id}/problems/{pid}", get(routes::contest_problem))
        .route(
            "/contest/{id}/problems/{pid}/submit",
            post(routes::contest_submit),
        )
        .route(
            "/contest/{id}/leaderboard",
            get(routes::contest_leaderboard),
        )
        // API routes for JSON data
        .route(
            "/api/contest/{id}/leaderboard",
            get(routes::api_contest_leaderboard),
        )
        .route(
            "/api/admin/contests/{id}/submissions",
            get(routes::api_admin_submissions),
        )
        .nest_service("/static", ServeDir::new("static"))
        .layer(session::session_layer())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();

    println!("Server running on http://0.0.0.0:3000");

    axum::serve(listener, app).await.unwrap();
}

fn generate_token() -> String {
    use base64::Engine;
    use rand::Rng;
    let bytes: [u8; 16] = rand::rng().random();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}
