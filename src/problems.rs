use crate::models::Problem;
use std::fs;
use std::path::PathBuf;

const PROBLEMS_DIR: &str = "problems";
const TIME_LIMIT_SECS: f64 = 1.0;
const MEMORY_LIMIT_KB: u64 = 262144; // 256MB

/// Load a problem from the filesystem
pub fn load_problem(problem_id: &str) -> Result<Problem, std::io::Error> {
    let problem_dir = PathBuf::from(PROBLEMS_DIR).join(problem_id);

    let statement = fs::read_to_string(problem_dir.join("statement.md"))?;
    let test_input = fs::read_to_string(problem_dir.join("input.txt"))?;
    let test_output = fs::read_to_string(problem_dir.join("output.txt"))?;

    // Extract title from markdown and remove it from statement
    let (title, statement_without_title) = extract_and_remove_title(&statement);

    Ok(Problem {
        id: problem_id.to_string(),
        title,
        statement: statement_without_title,
        test_input,
        test_output,
    })
}

/// Load custom grader for a problem (required)
pub fn load_custom_grader(problem_id: &str) -> Result<String, std::io::Error> {
    let problem_dir = PathBuf::from(PROBLEMS_DIR).join(problem_id);
    let grader_path = problem_dir.join("grader.py");

    fs::read_to_string(grader_path)
}

/// Extract title from markdown (first # heading) and remove it from the content
fn extract_and_remove_title(markdown: &str) -> (String, String) {
    let lines: Vec<&str> = markdown.lines().collect();

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if let Some(stripped) = trimmed.strip_prefix("# ") {
            let title = stripped.trim().to_string();
            // Remove the title line and rejoin the rest
            let remaining_lines: Vec<&str> = lines
                .iter()
                .enumerate()
                .filter_map(|(idx, &l)| if idx != i { Some(l) } else { None })
                .collect();
            let statement = remaining_lines.join("\n").trim().to_string();
            return (title, statement);
        }
    }

    ("Untitled Problem".to_string(), markdown.to_string())
}

/// Get the time limit for problems
pub fn get_time_limit() -> f64 {
    TIME_LIMIT_SECS
}

/// Get the memory limit for problems
pub fn get_memory_limit() -> u64 {
    MEMORY_LIMIT_KB
}

/// List all available problems (scans the problems directory)
pub fn list_problems() -> Result<Vec<String>, std::io::Error> {
    let mut problem_ids = Vec::new();

    for entry in fs::read_dir(PROBLEMS_DIR)? {
        let entry = entry?;
        if entry.file_type()?.is_dir()
            && let Some(name) = entry.file_name().to_str()
        {
            // Verify this looks like a problem directory
            let problem_dir = entry.path();
            if problem_dir.join("statement.md").exists()
                && problem_dir.join("input.txt").exists()
                && problem_dir.join("output.txt").exists()
            {
                problem_ids.push(name.to_string());
            }
        }
    }

    // Sort numerically if possible
    problem_ids.sort_by(|a, b| match (a.parse::<i32>(), b.parse::<i32>()) {
        (Ok(a_num), Ok(b_num)) => a_num.cmp(&b_num),
        _ => a.cmp(b),
    });

    Ok(problem_ids)
}
