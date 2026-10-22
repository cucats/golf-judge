(() => {
    if (!window.ace) return;

    ace.config.set('basePath', 'https://cdn.jsdelivr.net/npm/ace-builds@1.32.7/src-noconflict/');

    function createEditor(id, mode) {
        const textarea = document.getElementById(id);
        const container = document.getElementById(`${id}-editor`);
        container.hidden = false;
        const editor = ace.edit(container);
        editor.setTheme('ace/theme/tomorrow_night');
        editor.session.setMode(`ace/mode/${mode}`);
        editor.setOptions({
            useSoftTabs: false,
            tabSize: 4,
            showInvisibles: true,
            fontSize: '15px',
            fontFamily: "'Ubuntu Mono', monospace",
            showPrintMargin: false,
            wrap: mode === 'markdown'
        });
        editor.setValue(textarea.value, -1);
        editor.textInput.getElement().setAttribute('aria-labelledby', `${id}-label`);
        document.getElementById(`${id}-label`).addEventListener('click', () => editor.focus());
        textarea.hidden = true;
        editor.session.on('change', () => {
            textarea.value = editor.getValue();
        });
        return editor;
    }

    const statement = createEditor('statement', 'markdown');
    createEditor('grader', 'python');

    const preview = document.getElementById('statement-preview');
    const error = document.getElementById('preview-error');
    let timer;
    let controller;
    let revision = 0;

    statement.session.on('change', () => {
        clearTimeout(timer);
        controller?.abort();
        const currentRevision = ++revision;
        timer = setTimeout(async () => {
            controller = new AbortController();
            try {
                const response = await fetch('/admin/problems/preview', {
                    method: 'POST',
                    body: new URLSearchParams({ statement: statement.getValue() }),
                    signal: controller.signal
                });
                if (!response.ok || response.redirected) throw new Error('Preview unavailable');
                const html = await response.text();
                if (currentRevision !== revision) return;
                preview.innerHTML = html;
                error.hidden = true;
            } catch (err) {
                if (err.name === 'AbortError' || currentRevision !== revision) return;
                error.textContent = 'Preview could not update. Your edits are still in the editor.';
                error.hidden = false;
            }
        }, 250);
    });
})();
