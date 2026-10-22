mod leaderboard;
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
use routes::{admin, auth, contest, player};
use sqlx::postgres::PgPoolOptions;
use state::AppState;
use std::env;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let state = AppState { db: pool };

    let state_clone = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Err(e) = state_clone.auto_end_expired_contests().await {
                eprintln!("auto-end failed: {e}");
            }
        }
    });

    let app = Router::new()
        .route("/", get(contest::index))
        .route("/tips", get(routes::tips))
        .route("/login", get(auth::login_page).post(auth::login_post))
        .route("/logout", post(auth::logout))
        .route("/admin", get(admin::dashboard))
        .route("/admin/contests", post(admin::create_contest))
        .route("/admin/contests/new", get(admin::new_contest_page))
        .route(
            "/admin/contests/{id}",
            get(admin::manage_contest).post(admin::update_contest),
        )
        .route("/admin/contests/{id}/start", post(admin::start_contest))
        .route("/admin/contests/{id}/end", post(admin::end_contest))
        .route("/admin/contests/{id}/delete", post(admin::delete_contest))
        .route("/admin/contests/{id}/submissions", get(admin::submissions))
        .route(
            "/admin/problems",
            get(admin::problems_page).post(admin::create_problem),
        )
        .route("/admin/problems/new", get(admin::new_problem_page))
        .route("/admin/problems/preview", post(admin::preview_statement))
        .route(
            "/admin/problems/{id}",
            get(admin::edit_problem_page).post(admin::update_problem),
        )
        .route(
            "/admin/problems/{id}/duplicate",
            post(admin::duplicate_problem),
        )
        .route("/admin/problems/{id}/delete", post(admin::delete_problem))
        .route("/admin/problems/{id}/test", post(admin::test_problem))
        .route("/contest/{id}", get(contest::contest_join))
        .route("/contest/{id}/join", get(contest::contest_join))
        .route("/contest/{id}/waiting", get(contest::contest_waiting))
        .route("/contest/{id}/problems", get(contest::contest_problems))
        .route(
            "/contest/{id}/problems/{pid}",
            get(contest::contest_problem),
        )
        .route(
            "/contest/{id}/problems/{pid}/submit",
            post(contest::contest_submit),
        )
        .route(
            "/contest/{id}/leaderboard",
            get(contest::contest_leaderboard),
        )
        .route("/contest/{id}/submissions", get(player::player_page))
        .route(
            "/api/contest/{id}/leaderboard",
            get(contest::api_contest_leaderboard),
        )
        .route(
            "/api/admin/contests/{id}/submissions",
            get(admin::api_submissions),
        )
        .nest_service("/static", ServeDir::new("static"))
        .layer(session::session_layer())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server running on http://0.0.0.0:3000");
    axum::serve(listener, app).await.unwrap();
}
