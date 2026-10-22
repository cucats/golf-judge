<script lang="ts">
	import { onMount, tick } from 'svelte';
	let {
		value = $bindable(''),
		mode = 'python',
		name,
		label = 'Code',
		height = '400px',
		storageKey
	}: {
		value?: string;
		mode?: 'python' | 'markdown';
		name?: string;
		label?: string;
		height?: string;
		storageKey?: string;
	} = $props();
	let container: HTMLDivElement;
	let ready = $state(false);
	let editor: import('ace-builds').Ace.Editor | undefined;
	$effect(() => {
		if (editor && editor.getValue() !== value) editor.setValue(value, -1);
	});
	onMount(() => {
		let disposed = false;
		(async () => {
			const ace = await import('ace-builds');
			await Promise.all([
				import('ace-builds/src-noconflict/mode-python'),
				import('ace-builds/src-noconflict/mode-markdown'),
				import('ace-builds/src-noconflict/theme-tomorrow_night')
			]);
			if (disposed) return;
			editor = ace.edit(container);
			editor.setTheme('ace/theme/tomorrow_night');
			editor.session.setMode(`ace/mode/${mode}`);
			editor.session.setUseWorker(false);
			editor.setOptions({
				useSoftTabs: false,
				tabSize: 4,
				showInvisibles: true,
				fontSize: '15px',
				fontFamily: "'Ubuntu Mono', monospace",
				showPrintMargin: false,
				wrap: mode === 'markdown'
			});
			if (storageKey) {
				try {
					value = localStorage.getItem(storageKey) ?? value;
				} catch {}
			}
			editor.setValue(value, -1);
			editor.textInput.getElement().setAttribute('aria-label', label);
			editor.on('change', () => {
				value = editor!.getValue();
				if (storageKey) {
					try {
						localStorage.setItem(storageKey, value);
					} catch {}
				}
			});
			ready = true;
			await tick();
			if (!disposed) editor.resize();
		})();
		return () => {
			disposed = true;
			editor?.destroy();
			editor = undefined;
		};
	});
</script>

<textarea
	{name}
	bind:value
	aria-label={label}
	hidden={ready}
	spellcheck="false"
	class="mono code-area"
	style:height></textarea>
<div
	bind:this={container}
	class="code-editor problem-editor"
	style:height
	style:display={ready ? 'block' : 'none'}
></div>
