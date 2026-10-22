(() => {
    window.highlightCode = (root = document) => {
        if (!window.hljs) return;

        root.querySelectorAll('code[class*="language-"], [data-inline-language] code').forEach(code => {
            const explicitLanguage = [...code.classList]
                .find(name => name.startsWith('language-'))?.slice('language-'.length);
            const language = explicitLanguage || (!code.closest('pre')
                ? code.closest('[data-inline-language]')?.dataset.inlineLanguage
                : null);
            if (!language || !hljs.getLanguage(language) || code.classList.contains('nohighlight')) return;

            code.innerHTML = hljs.highlight(code.textContent, { language, ignoreIllegals: true }).value;
            code.classList.add('hljs');
        });
    };

    window.highlightCode();
})();
