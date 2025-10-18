use std::path::PathBuf;
use tokio::fs;
use tokio::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(clippy::upper_case_acronyms)]
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
            .args(["--box-id", &self.box_id.to_string(), "--init"])
            .output()
            .await
            .map_err(|e| format!("Failed to init isolate: {e}"))?;

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
            .args(["--box-id", &self.box_id.to_string(), "--cleanup"])
            .output()
            .await
            .map_err(|e| format!("Failed to cleanup isolate: {e}"))?;

        if !output.status.success() {
            return Err(format!(
                "isolate cleanup failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    /// Run code with given stdin and collect stdout
    #[allow(dead_code)]
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
            .map_err(|e| format!("Failed to write stdin: {e}"))?;

        // Prepare meta file for isolate output
        let meta_file = format!("/tmp/isolate-meta-{}.txt", self.box_id);

        // Run isolate
        let output = Command::new("isolate")
            .args([
                "--box-id",
                &self.box_id.to_string(),
                "--wall-time",
                &format!("{:.1}", time_limit_secs * 2.0), // Wall time 2x CPU time
                "--time",
                &format!("{time_limit_secs:.1}"),
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
            .map_err(|e| format!("Failed to run isolate: {e}"))?;

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
    #[allow(clippy::too_many_arguments)]
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
            .ok_or_else(|| format!("Unknown language: {language_id}"))?;

        // Initialize sandbox
        let box_path = self.init().await?;

        // Write user submission to sandbox
        let submission_path = box_path.join(language.submission_filename());
        fs::write(&submission_path, code)
            .await
            .map_err(|e| format!("Failed to write submission: {e}"))?;

        // Write grader to sandbox
        let grader_path = box_path.join(language.grader_filename());
        fs::write(&grader_path, custom_grader)
            .await
            .map_err(|e| format!("Failed to write grader: {e}"))?;

        // Use provided test input/output
        let input = test_input;
        let expected_output = test_output;

        // Prepare meta file
        let meta_file = format!("/tmp/isolate-meta-{}.txt", self.box_id);

        // Build isolate command with language-specific run command
        use tokio::io::AsyncWriteExt;
        let mut cmd = Command::new("isolate");
        cmd.args([
            "--box-id",
            &self.box_id.to_string(),
            "--wall-time",
            &format!("{:.1}", time_limit_secs * 2.0),
            "--time",
            &format!("{time_limit_secs:.1}"),
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
            .map_err(|e| format!("Failed to spawn isolate: {e}"))?;

        // Write input to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(input.as_bytes())
                .await
                .map_err(|e| format!("Failed to write stdin: {e}"))?;
            drop(stdin); // Close stdin
        }

        // Wait for completion
        let output = child
            .wait_with_output()
            .await
            .map_err(|e| format!("Failed to wait for isolate: {e}"))?;

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

        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        // Determine verdict
        match status {
            "RE" | "SG" | "XX" => {
                // Extract which test case failed from stderr
                let mut test_case_info = String::new();
                #[allow(unused_assignments)]
                let mut test_num = 0;

                for line in stderr.lines() {
                    if line.starts_with("TESTCASE ") && line.contains(":") {
                        if let Some(num_str) = line
                            .strip_prefix("TESTCASE ")
                            .and_then(|s| s.split(':').next())
                            && let Ok(n) = num_str.trim().parse::<usize>()
                        {
                            test_num = n;
                            if let Some(input_desc) = line.split(':').nth(1) {
                                test_case_info = format!(
                                    "Failed on test case {}\n\nInput: {}\n\n",
                                    test_num,
                                    input_desc.trim()
                                );
                            }
                        }

                        break;
                    }
                }

                // Get error message
                let error_msg = stderr
                    .lines()
                    .filter(|line| !line.starts_with("TESTCASE "))
                    .collect::<Vec<_>>()
                    .join("\n")
                    .trim()
                    .to_string();

                // Count total test cases from expected output
                let total_tests = expected_output.lines().count();
                let passing_tests = if test_num > 0 { test_num - 1 } else { 0 };

                let output = if !test_case_info.is_empty() {
                    format!(
                        "Passed {passing_tests}/{total_tests} test cases\n\n{test_case_info}Error:\n{error_msg}"
                    )
                } else if test_num > 0 {
                    format!(
                        "Passed {passing_tests}/{total_tests} test cases\n\nRuntime error on test case {test_num}\n\n{error_msg}"
                    )
                } else {
                    format!("Passed 0/{total_tests} test cases\n\n{error_msg}")
                };

                return Ok(RunResult {
                    verdict: Verdict::RE,
                    time_ms,
                    output: if output.is_empty() {
                        format!("Passed 0/{total_tests} test cases\n\nRuntime error")
                    } else {
                        output
                    },
                });
            }
            "TO" => {
                // Extract which test case timed out and count total tests
                #[allow(unused_assignments)]
                let mut test_num = 0;

                for line in stderr.lines() {
                    if line.starts_with("TESTCASE ")
                        && line.contains(":")
                        && let Some(num_str) = line
                            .strip_prefix("TESTCASE ")
                            .and_then(|s| s.split(':').next())
                        && let Ok(n) = num_str.trim().parse::<usize>()
                    {
                        test_num = n;
                    }
                }

                // Count total test cases from expected output
                let total_tests = expected_output.lines().count();
                let passing_tests = if test_num > 0 { test_num - 1 } else { 0 };

                let output = if test_num > 0 {
                    format!(
                        "Passed {passing_tests}/{total_tests} test cases\n\nTime limit exceeded on test case {test_num}"
                    )
                } else {
                    format!("Passed 0/{total_tests} test cases\n\nTime limit exceeded")
                };

                return Ok(RunResult {
                    verdict: Verdict::TLE,
                    time_ms,
                    output,
                });
            }
            _ => {}
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        // Check if output matches expected
        let actual = stdout.trim();
        let expected = expected_output.trim();

        // Count total test cases and passing test cases
        let actual_lines: Vec<&str> = actual.lines().collect();
        let expected_lines: Vec<&str> = expected.lines().collect();
        let total_tests = expected_lines.len();

        let mut passing_tests = 0;
        let mut failed_test_num = 0;
        let mut expected_value = String::new();
        let mut actual_value = String::new();

        for (i, (exp, act)) in expected_lines.iter().zip(actual_lines.iter()).enumerate() {
            if exp == act {
                passing_tests += 1;
            } else if failed_test_num == 0 {
                // Record the first failure
                failed_test_num = i + 1;
                expected_value = exp.to_string();
                actual_value = act.to_string();
            }
        }

        // Handle length mismatch
        if actual_lines.len() != expected_lines.len() && failed_test_num == 0 {
            // No mismatch found yet, so the issue is length
            if actual_lines.len() < expected_lines.len() {
                failed_test_num = actual_lines.len() + 1;
                expected_value = expected_lines
                    .get(actual_lines.len())
                    .unwrap_or(&"")
                    .to_string();
                actual_value = "(no output)".to_string();
            } else {
                failed_test_num = expected_lines.len() + 1;
                expected_value = "(no more output expected)".to_string();
                actual_value = actual_lines
                    .get(expected_lines.len())
                    .unwrap_or(&"")
                    .to_string();
            }
        }

        if actual == expected {
            Ok(RunResult {
                verdict: Verdict::AC,
                time_ms,
                output: format!("Passed {total_tests}/{total_tests} test cases"),
            })
        } else {
            // Extract input info from stderr for the failed test case
            let mut input_info = String::new();
            if !stderr.is_empty() && failed_test_num > 0 {
                let marker = format!("TESTCASE {failed_test_num}:");
                for line in stderr.lines() {
                    if line.starts_with(&marker) {
                        if let Some(input_desc) = line.strip_prefix(&marker) {
                            input_info = format!("Input: {}\n\n", input_desc.trim());
                        }
                        break;
                    }
                }
            }

            Ok(RunResult {
                verdict: Verdict::WA,
                time_ms,
                output: format!(
                    "Passed {passing_tests}/{total_tests} test cases

Failed on test case {failed_test_num}

{input_info}Expected: {expected_value}
Got: {actual_value}"
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
