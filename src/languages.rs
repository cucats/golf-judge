/// Language definitions for code execution
/// Each language defines how to compile (if needed) and run user code

#[derive(Debug, Clone)]
pub struct Language {
    pub id: &'static str,
    pub name: &'static str,
    pub file_extension: &'static str,
    pub grader_template: &'static str, // Template for wrapping user code
    pub compile_command: Option<CompileCommand>,
    pub run_command: RunCommand,
}

#[derive(Debug, Clone)]
pub struct CompileCommand {
    pub program: &'static str,
    pub args: &'static [&'static str],
    pub output_file: &'static str,
}

#[derive(Debug, Clone)]
pub struct RunCommand {
    pub program: &'static str,
    pub args: &'static [&'static str], // Can include placeholders like "{file}"
}

impl Language {
    /// Get language by ID
    pub fn get(id: &str) -> Option<&'static Language> {
        LANGUAGES.iter().find(|lang| lang.id == id)
    }

    /// Get all available languages
    pub fn all() -> &'static [Language] {
        &LANGUAGES
    }

    /// Get the grader code that wraps user submission
    pub fn grader_code(&self) -> &str {
        self.grader_template
    }

    /// Get the filename for user submission
    pub fn submission_filename(&self) -> String {
        format!("submission{}", self.file_extension)
    }

    /// Get the filename for grader
    pub fn grader_filename(&self) -> String {
        format!("main{}", self.file_extension)
    }
}

// Language definitions
static LANGUAGES: &[Language] = &[Language {
    id: "python3.11_function_f",
    name: "Python 3.11 (function f)",
    file_extension: ".py",
    grader_template: r#"from submission import f

__t = int(input())
for __i in range(__t):
    __line = input()
    __in = eval(__line)
    # Handle both single args and multiple args
    if isinstance(__in, list) and len(__in) > 1:
        __out = f(*__in)
    elif isinstance(__in, list) and len(__in) == 1:
        __out = f(__in[0])
    else:
        __out = f(__in)
    print(repr(__out))
"#,
    compile_command: None,
    run_command: RunCommand {
        program: "python3",
        args: &["main.py"],
    },
}];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_python() {
        let lang = Language::get("python3.11_function_f").unwrap();
        assert_eq!(lang.name, "Python 3.11 (function f)");
        assert_eq!(lang.file_extension, ".py");
        assert!(lang.compile_command.is_none());
    }

    #[test]
    fn test_submission_filename() {
        let lang = Language::get("python3.11_function_f").unwrap();
        assert_eq!(lang.submission_filename(), "submission.py");
    }

    #[test]
    fn test_grader_filename() {
        let lang = Language::get("python3.11_function_f").unwrap();
        assert_eq!(lang.grader_filename(), "main.py");
    }
}
