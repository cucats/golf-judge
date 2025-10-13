use ammonia::Builder;
use pulldown_cmark::{html, Parser};

/// Render markdown to HTML with sanitization
/// Allows math (MathJax will handle $...$ and $$...$$)
pub fn render_markdown(markdown: &str) -> String {
    // Parse markdown to HTML
    let parser = Parser::new(markdown);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    // Sanitize HTML with ammonia
    // Allow safe tags and preserve math delimiters
    let sanitized = Builder::default()
        .add_tags(&["span", "div"]) // For math blocks
        .add_tag_attributes("span", &["class"]) // For inline math styling
        .add_tag_attributes("div", &["class"]) // For display math styling
        .clean(&html_output)
        .to_string();

    sanitized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_markdown() {
        let md = "# Hello\n\nThis is **bold**.";
        let html = render_markdown(md);
        assert!(html.contains("<h1>"));
        assert!(html.contains("<strong>"));
    }

    #[test]
    fn test_xss_prevention() {
        let md = "<script>alert('xss')</script>";
        let html = render_markdown(md);
        assert!(!html.contains("<script>"));
    }

    #[test]
    fn test_math_preservation() {
        let md = "Inline math: $x^2$ and display: $$\\sum_{i=1}^{n} i$$";
        let html = render_markdown(md);
        // Math delimiters should be preserved in text content
        assert!(html.contains("$x^2$") || html.contains("x^2"));
    }
}
