use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use tokio::fs;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::Semaphore;

const OUTPUT_CAP_BYTES: usize = 1 << 20;
const ERROR_MESSAGE_CAP_BYTES: usize = 4096;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(clippy::upper_case_acronyms)]
pub enum Verdict {
    AC,
    WA,
    TLE,
    RE,
}

impl Verdict {
    pub fn as_str(&self) -> &'static str {
        match self {
            Verdict::AC => "AC",
            Verdict::WA => "WA",
            Verdict::TLE => "TLE",
            Verdict::RE => "RE",
        }
    }
}

#[derive(Debug, Clone)]
pub struct RunResult {
    pub verdict: Verdict,
    pub time_ms: i32,
    pub output: String,
}

pub struct Limits {
    pub time_limit_ms: i32,
    pub memory_limit_kb: i32,
}

static WORKERS: LazyLock<u32> = LazyLock::new(|| {
    std::env::var("JUDGE_WORKERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|&n| n > 0)
        .unwrap_or_else(|| {
            std::thread::available_parallelism()
                .map(|n| n.get() as u32)
                .unwrap_or(2)
        })
});
static JUDGE_SLOTS: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(*WORKERS as usize));
static FREE_BOXES: LazyLock<Mutex<Vec<u32>>> =
    LazyLock::new(|| Mutex::new((0..*WORKERS).collect()));

/// Exclusive use of one isolate box; returned to the pool on drop
struct BoxLease {
    id: u32,
    _permit: tokio::sync::SemaphorePermit<'static>,
}

impl BoxLease {
    async fn acquire() -> Self {
        let permit = JUDGE_SLOTS.acquire().await.expect("judge semaphore closed");
        let id = FREE_BOXES
            .lock()
            .unwrap()
            .pop()
            .expect("a permit guarantees a free box");
        Self {
            id,
            _permit: permit,
        }
    }
}

impl Drop for BoxLease {
    fn drop(&mut self) {
        FREE_BOXES.lock().unwrap().push(self.id);
    }
}

/// Judge a submission: the grader (main.py) imports `f` from submission.py,
/// reads the test input on stdin and prints one line per test case.
pub async fn judge(
    code: &str,
    grader: &str,
    test_input: &str,
    expected_output: &str,
    limits: &Limits,
) -> Result<RunResult, String> {
    let lease = BoxLease::acquire().await;
    let box_id = lease.id.to_string();

    let box_path = init_box(&box_id).await?;
    let result = run_in_box(&box_id, &box_path, code, grader, test_input, limits).await;
    let cleanup = isolate(&box_id, "--cleanup").await;
    let (status, time_ms, stdout, stderr) = result?;
    cleanup?;

    Ok(evaluate(
        &status,
        time_ms,
        &stdout,
        &stderr,
        expected_output,
    ))
}

async fn isolate(box_id: &str, action: &str) -> Result<String, String> {
    let output = Command::new("isolate")
        .args(["--box-id", box_id, action])
        .output()
        .await
        .map_err(|e| format!("failed to run isolate {action}: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "isolate {action} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn init_box(box_id: &str) -> Result<PathBuf, String> {
    // A previous crash may have left the box initialised
    let _ = isolate(box_id, "--cleanup").await;
    Ok(PathBuf::from(isolate(box_id, "--init").await?).join("box"))
}

async fn run_in_box(
    box_id: &str,
    box_path: &std::path::Path,
    code: &str,
    grader: &str,
    test_input: &str,
    limits: &Limits,
) -> Result<(String, i32, String, String), String> {
    fs::write(box_path.join("submission.py"), code)
        .await
        .map_err(|e| format!("failed to write submission: {e}"))?;
    fs::write(box_path.join("main.py"), grader)
        .await
        .map_err(|e| format!("failed to write grader: {e}"))?;

    let meta_file = format!("/tmp/isolate-meta-{box_id}.txt");
    let time_secs = limits.time_limit_ms as f64 / 1000.0;
    let mut child = Command::new("isolate")
        .args([
            "--box-id",
            box_id,
            "--time",
            &format!("{time_secs:.3}"),
            "--wall-time",
            &format!("{:.3}", time_secs * 2.0 + 1.0),
            "--mem",
            &limits.memory_limit_kb.to_string(),
            "--meta",
            &meta_file,
            "--dir=/usr",
            "--dir=/lib",
            "--dir=/lib64",
            "--dir=/bin",
            "--run",
            "--",
            "/usr/bin/python3",
            "main.py",
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("failed to spawn isolate: {e}"))?;

    let mut stdin = child.stdin.take().expect("stdin piped");
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");
    let input = test_input.as_bytes().to_vec();
    let write_stdin = async move {
        // The program may exit without reading its input; that's its verdict, not a judge error
        let _ = stdin.write_all(&input).await;
    };
    let ((), stdout, stderr) = tokio::join!(
        write_stdin,
        read_capped(stdout, OUTPUT_CAP_BYTES),
        read_capped(stderr, OUTPUT_CAP_BYTES)
    );
    child
        .wait()
        .await
        .map_err(|e| format!("failed to wait for isolate: {e}"))?;

    let meta = fs::read_to_string(&meta_file)
        .await
        .map_err(|e| format!("isolate produced no meta file: {e}"));
    let _ = fs::remove_file(&meta_file).await;
    let (status, time_ms) = parse_meta(&meta?);
    if status == "XX" {
        return Err(format!(
            "sandbox internal error: {}",
            String::from_utf8_lossy(&stderr)
        ));
    }

    Ok((
        status,
        time_ms,
        String::from_utf8_lossy(&stdout).to_string(),
        String::from_utf8_lossy(&stderr).to_string(),
    ))
}

/// Read up to `cap` bytes, then drain and discard the rest so the child never blocks
async fn read_capped(mut reader: impl AsyncRead + Unpin, cap: usize) -> Vec<u8> {
    let mut kept = Vec::new();
    let mut buf = [0u8; 8192];
    while let Ok(n) = reader.read(&mut buf).await {
        if n == 0 {
            break;
        }
        let room = cap.saturating_sub(kept.len());
        kept.extend_from_slice(&buf[..n.min(room)]);
    }
    kept
}

fn parse_meta(meta: &str) -> (String, i32) {
    let mut status = "OK".to_string();
    let mut time_ms = 0;
    for line in meta.lines() {
        if let Some(value) = line.strip_prefix("time:") {
            if let Ok(secs) = value.trim().parse::<f64>() {
                time_ms = (secs * 1000.0) as i32;
            }
        } else if let Some(value) = line.strip_prefix("status:") {
            status = value.trim().to_string();
        }
    }
    (status, time_ms)
}

/// The grader writes "TESTCASE n: <input description>" to stderr before each case
fn testcase_markers(stderr: &str) -> impl Iterator<Item = (usize, &str)> {
    stderr.lines().filter_map(|line| {
        let (num, desc) = line.strip_prefix("TESTCASE ")?.split_once(':')?;
        Some((num.trim().parse().ok()?, desc.trim()))
    })
}

fn truncate(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n... (truncated)", &text[..end])
}

fn evaluate(
    status: &str,
    time_ms: i32,
    stdout: &str,
    stderr: &str,
    expected_output: &str,
) -> RunResult {
    let expected = expected_output.trim();
    let expected_lines: Vec<&str> = expected.lines().map(str::trim_end).collect();
    let total = expected_lines.len();
    let last_case = testcase_markers(stderr).last();
    let started = last_case.map_or(0, |(n, _)| n);
    let passed_before_crash = started.saturating_sub(1);

    match status {
        "RE" | "SG" => {
            let error = stderr
                .lines()
                .filter(|l| !l.starts_with("TESTCASE "))
                .collect::<Vec<_>>()
                .join("\n");
            let error = truncate(error.trim(), ERROR_MESSAGE_CAP_BYTES);
            let location = match last_case {
                Some((n, desc)) => format!("Failed on test case {n}\n\nInput: {desc}\n\n"),
                None => String::new(),
            };
            return RunResult {
                verdict: Verdict::RE,
                time_ms,
                output: format!(
                    "Passed {passed_before_crash}/{total} test cases\n\n{location}Error:\n{error}"
                ),
            };
        }
        "TO" => {
            let location = if started > 0 {
                format!(" on test case {started}")
            } else {
                String::new()
            };
            return RunResult {
                verdict: Verdict::TLE,
                time_ms,
                output: format!(
                    "Passed {passed_before_crash}/{total} test cases\n\nTime limit exceeded{location}"
                ),
            };
        }
        _ => {}
    }

    let actual_lines: Vec<&str> = stdout.trim().lines().map(str::trim_end).collect();
    let passed = expected_lines
        .iter()
        .zip(&actual_lines)
        .filter(|(e, a)| e == a)
        .count();

    if actual_lines == expected_lines {
        return RunResult {
            verdict: Verdict::AC,
            time_ms,
            output: format!("Passed {total}/{total} test cases"),
        };
    }

    let first_diff = (0..expected_lines.len().max(actual_lines.len()))
        .find(|&i| expected_lines.get(i) != actual_lines.get(i))
        .unwrap_or(0);
    let expected_value = expected_lines
        .get(first_diff)
        .copied()
        .unwrap_or("(no more output expected)");
    let actual_value = actual_lines
        .get(first_diff)
        .copied()
        .unwrap_or("(no output)");
    let case = first_diff + 1;
    let input_info = testcase_markers(stderr)
        .find(|&(n, _)| n == case)
        .map(|(_, desc)| format!("Input: {}\n\n", truncate(desc, ERROR_MESSAGE_CAP_BYTES)))
        .unwrap_or_default();

    RunResult {
        verdict: Verdict::WA,
        time_ms,
        output: format!(
            "Passed {passed}/{total} test cases\n\nFailed on test case {case}\n\n{input_info}Expected: {}\nGot: {}",
            truncate(expected_value, ERROR_MESSAGE_CAP_BYTES),
            truncate(actual_value, ERROR_MESSAGE_CAP_BYTES)
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STDERR: &str = "TESTCASE 1: a:b\nTESTCASE 2: c\n";

    #[test]
    fn accepted() {
        let r = evaluate("OK", 10, "1\n2\n", "", "1\n2\n");
        assert_eq!(r.verdict, Verdict::AC);
        assert_eq!(r.output, "Passed 2/2 test cases");
    }

    #[test]
    fn crlf_and_trailing_spaces_accepted() {
        let r = evaluate("OK", 10, "1 \r\n2\r\n", "", "1\n2\n");
        assert_eq!(r.verdict, Verdict::AC);
    }

    #[test]
    fn wrong_answer_reports_first_mismatch() {
        let r = evaluate("OK", 10, "1\n3\n", STDERR, "1\n2\n");
        assert_eq!(r.verdict, Verdict::WA);
        assert!(r.output.contains("Passed 1/2"));
        assert!(r.output.contains("Failed on test case 2"));
        assert!(r.output.contains("Input: c"));
        assert!(r.output.contains("Expected: 2\nGot: 3"));
    }

    #[test]
    fn missing_output() {
        let r = evaluate("OK", 10, "1\n", STDERR, "1\n2\n");
        assert_eq!(r.verdict, Verdict::WA);
        assert!(r.output.contains("Got: (no output)"));
    }

    #[test]
    fn extra_output() {
        let r = evaluate("OK", 10, "1\n2\n3\n", STDERR, "1\n2\n");
        assert_eq!(r.verdict, Verdict::WA);
        assert!(r.output.contains("Failed on test case 3"));
    }

    #[test]
    fn runtime_error_keeps_colons_in_input() {
        let stderr = "TESTCASE 1: {'k': 1}\nTraceback: boom\n";
        let r = evaluate("RE", 10, "", stderr, "1\n2\n");
        assert_eq!(r.verdict, Verdict::RE);
        assert!(r.output.contains("Passed 0/2"));
        assert!(r.output.contains("Input: {'k': 1}"));
        assert!(r.output.contains("Traceback: boom"));
    }

    #[test]
    fn time_limit() {
        let r = evaluate("TO", 1000, "", STDERR, "1\n2\n3\n");
        assert_eq!(r.verdict, Verdict::TLE);
        assert!(r.output.contains("Passed 1/3"));
        assert!(r.output.contains("on test case 2"));
    }

    #[test]
    fn meta_parsing() {
        assert_eq!(
            parse_meta("time:0.123\nstatus:TO\n"),
            ("TO".to_string(), 123)
        );
        assert_eq!(parse_meta(""), ("OK".to_string(), 0));
    }

    #[test]
    fn truncate_respects_char_boundaries() {
        assert!(truncate("ééé", 3).starts_with('é'));
    }
}
