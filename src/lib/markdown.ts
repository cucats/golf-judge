import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import hljs from "highlight.js/lib/common";
export function highlight(code: string, language = "python"): string {
  if (hljs.getLanguage(language))
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  return code
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
export function markdown(source: string): string {
  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }) => {
    const language = (lang || "").split(/\s/)[0];
    return `<pre><code${language ? ' class="hljs"' : ""}>${highlight(text, language || "plaintext")}</code></pre>`;
  };
  renderer.codespan = ({ text }) =>
    `<code class="hljs">${highlight(text)}</code>`;
  const html = marked.parse(source, { renderer, async: false, gfm: true });
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      span: ["class"],
      code: ["class"],
      div: ["class"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}
