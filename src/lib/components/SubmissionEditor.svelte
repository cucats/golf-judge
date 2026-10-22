<script lang="ts">
	import Editor from './Editor.svelte';
	import type { JudgeResult } from '#lib/types.js';
	let {
		action,
		storageKey,
		blocked = null,
		best = null,
		onaccepted,
		button = 'Submit'
	}: {
		action: string;
		storageKey?: string;
		blocked?: string | null;
		best?: number | null;
		onaccepted?: (bytes: number) => void;
		button?: string;
	} = $props();
	let code = $state(''),
		busy = $state(false),
		result = $state<JudgeResult | null>(null),
		message = $state('Output shows up here!');
	let form: HTMLFormElement;
	const bytes = $derived(new TextEncoder().encode(code.replaceAll('\r\n', '\n')).length);
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (blocked || busy) return;
		busy = true;
		result = null;
		message = 'Grading...';
		try {
			const response = await fetch(action, { method: 'POST', body: new URLSearchParams({ code }) });
			if (!response.ok || response.redirected)
				throw new Error(`Submission failed (${response.status})`);
			result = await response.json();
			if (result?.verdict === 'AC') onaccepted?.(result.code_length);
		} catch (err) {
			message = String(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.ctrlKey && event.key === 'Enter') {
			event.preventDefault();
			form.requestSubmit();
		}
	}}
/>
<form bind:this={form} method="POST" {action} onsubmit={submit}>
	<Editor bind:value={code} name="code" height="500px" {storageKey} />
	<div class="btn-row editor-controls">
		<span class="muted"
			>{bytes} bytes{#if best !== null}
				· Best: {best} bytes{/if}</span
		>
		{#if blocked}<strong class="error">{blocked}</strong>{:else}<button disabled={busy}
				>{busy ? 'Submitting...' : button}</button
			>{/if}
	</div>
</form>
<pre class="judge-output" aria-live="polite">{#if result}<strong
			class={`verdict-${result.verdict.toLowerCase()}`}>{result.verdict}</strong
		><span class="muted"> | {result.code_length} bytes | {result.time}ms</span
		>{'\n\n'}{result.output}{:else}{message}{/if}</pre>
