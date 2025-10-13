use std::path::PathBuf;
use tokio::fs;
use tokio::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    AC,  // Accepted
    WA,  // Wrong Answer
    TLE, // Time Limit Exceeded
    RE,  // Runtime Error
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

impl std::fmt::Display for Verdict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone)]
pub struct RunResult {
    pub verdict: Verdict,
    pub time_ms: i32,
    pub output: String,
}

pub struct CodeRunner {
    box_id: u32,
}

impl CodeRunner {
    pub fn new(box_id: u32) -> Self {
        Self { box_id }
    }

    /// Initialize the isolate sandbox
    pub async fn init(&self) -> Result<PathBuf, String> {
        let output = Command::new("isolate")
            .args(&["--box-id", &self.box_id.to_string(), "--init"])
            .output()
            .await
            .map_err(|e| format!("Failed to init isolate: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "isolate init failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let box_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(PathBuf::from(box_path).join("box"))
    }

    /// Clean up the isolate sandbox
    pub async fn cleanup(&self) -> Result<(), String> {
        let output = Command::new("isolate")
            .args(&["--box-id", &self.box_id.to_string(), "--cleanup"])
            .output()
            .await
            .map_err(|e| format!("Failed to cleanup isolate: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "isolate cleanup failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    /// Run code with given stdin and collect stdout
    pub async fn run(
        &self,
        code_file: &str,
        stdin: &str,
        time_limit_secs: f64,
        mem_limit_kb: u64,
    ) -> Result<RunResult, String> {
        // Initialize sandbox
        let box_path = self.init().await?;

        // Write code to sandbox
        let code_path = box_path.join(code_file);
        fs::write(&code_path, stdin)
            .await
            .map_err(|e| format!("Failed to write stdin: {}", e))?;

        // Prepare meta file for isolate output
        let meta_file = format!("/tmp/isolate-meta-{}.txt", self.box_id);

        // Run isolate
        let output = Command::new("isolate")
            .args(&[
                "--box-id",
                &self.box_id.to_string(),
                "--wall-time",
                &format!("{:.1}", time_limit_secs * 2.0), // Wall time 2x CPU time
                "--time",
                &format!("{:.1}", time_limit_secs),
                "--mem",
                &mem_limit_kb.to_string(),
                "--processes",
                "--meta",
                &meta_file,
                "--stdin",
                code_file,
                "--run",
                "--",
                "python3",
                code_file,
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to run isolate: {}", e))?;

        // Read meta file
        let meta = fs::read_to_string(&meta_file).await.unwrap_or_default();

        // Parse meta file
        let mut time_ms = 0;
        let mut status = "OK";

        for line in meta.lines() {
            if let Some(value) = line.strip_prefix("time:") {
                if let Ok(time_secs) = value.trim().parse::<f64>() {
                    time_ms = (time_secs * 1000.0) as i32;
                }
            } else if let Some(value) = line.strip_prefix("status:") {
                status = value.trim();
            }
        }

        // Clean up
        let _ = fs::remove_file(&meta_file).await;
        self.cleanup().await?;

        // Determine verdict
        let verdict = match status {
            "RE" => Verdict::RE,  // Runtime Error
            "TO" => Verdict::TLE, // Time Limit Exceeded
            "SG" => Verdict::RE,  // Signal (crash)
            "XX" => Verdict::RE,  // Internal Error
            _ => {
                if !output.status.success() {
                    Verdict::RE
                } else {
                    Verdict::AC // Will check output correctness separately
                }
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        Ok(RunResult {
            verdict,
            time_ms,
            output: stdout,
        })
    }

    /// Run submission against test cases with custom grader
    pub async fn judge(
        &self,
        code: &str,
        language_id: &str,
        test_input: &str,
        test_output: &str,
        time_limit_secs: f64,
        mem_limit_kb: u64,
        custom_grader: &str,
    ) -> Result<RunResult, String> {
        // Get language definition
        let language = crate::languages::Language::get(language_id)
            .ok_or_else(|| format!("Unknown language: {}", language_id))?;

        // Initialize sandbox
        let box_path = self.init().await?;

        // Write user submission to sandbox
        let submission_path = box_path.join(language.submission_filename());
        fs::write(&submission_path, code)
            .await
            .map_err(|e| format!("Failed to write submission: {}", e))?;

        // Write grader to sandbox
        let grader_path = box_path.join(language.grader_filename());
        fs::write(&grader_path, custom_grader)
            .await
            .map_err(|e| format!("Failed to write grader: {}", e))?;

        // Use provided test input/output
        let input = test_input;
        let expected_output = test_output;

        // Prepare meta file
        let meta_file = format!("/tmp/isolate-meta-{}.txt", self.box_id);

        // Build isolate command with language-specific run command
        use tokio::io::AsyncWriteExt;
        let mut cmd = Command::new("isolate");
        cmd.args(&[
            "--box-id",
            &self.box_id.to_string(),
            "--wall-time",
            &format!("{:.1}", time_limit_secs * 2.0),
            "--time",
            &format!("{:.1}", time_limit_secs),
            "--mem",
            &mem_limit_kb.to_string(),
            "--processes",
            "--meta",
            &meta_file,
            // Directory bindings for Python
            "--dir=/usr",
            "--dir=/lib",
            "--dir=/lib64",
            "--dir=/bin",
            "--run",
            "--",
            language.run_command.program,
        ]);
        cmd.args(language.run_command.args.iter());

        let mut child = cmd
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn isolate: {}", e))?;

        // Write input to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(input.as_bytes())
                .await
                .map_err(|e| format!("Failed to write stdin: {}", e))?;
            drop(stdin); // Close stdin
        }

        // Wait for completion
        let output = child
            .wait_with_output()
            .await
            .map_err(|e| format!("Failed to wait for isolate: {}", e))?;

        // Read meta file
        let meta = fs::read_to_string(&meta_file).await.unwrap_or_default();

        // Parse meta file
        let mut time_ms = 0;
        let mut status = "OK";

        for line in meta.lines() {
            if let Some(value) = line.strip_prefix("time:") {
                if let Ok(time_secs) = value.trim().parse::<f64>() {
                    time_ms = (time_secs * 1000.0) as i32;
                }
            } else if let Some(value) = line.strip_prefix("status:") {
                status = value.trim();
            }
        }

        // Clean up
        let _ = fs::remove_file(&meta_file).await;
        self.cleanup().await?;

        // Determine verdict
        match status {
            "RE" => {
                return Ok(RunResult {
                    verdict: Verdict::RE,
                    time_ms,
                    output: String::from_utf8_lossy(&output.stderr).to_string(),
                });
            }
            "TO" => {
                return Ok(RunResult {
                    verdict: Verdict::TLE,
                    time_ms,
                    output: "Time limit exceeded".to_string(),
                });
            }
            "SG" | "XX" => {
                return Ok(RunResult {
                    verdict: Verdict::RE,
                    time_ms,
                    output: String::from_utf8_lossy(&output.stderr).to_string(),
                });
            }
            _ => {}
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        // Check if output matches expected
        let actual = stdout.trim();
        let expected = expected_output.trim();

        if actual == expected {
            Ok(RunResult {
                verdict: Verdict::AC,
                time_ms,
                output: stdout,
            })
        } else {
            Ok(RunResult {
                verdict: Verdict::WA,
                time_ms,
                output: format!(
                    "Expected:\n{}\n\nGot:\n{}",
                    expected,
                    if actual.len() > 1000 {
                        format!("{}... (truncated)", &actual[..1000])
                    } else {
                        actual.to_string()
                    }
                ),
            })
        }
    }
}

/// Get a free isolate box ID
pub async fn get_free_box_id() -> u32 {
    use std::sync::atomic::{AtomicU32, Ordering};
    static NEXT_BOX_ID: AtomicU32 = AtomicU32::new(0);
    NEXT_BOX_ID.fetch_add(1, Ordering::SeqCst) % 100 // Cycle through 0-99
}
