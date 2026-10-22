<script lang="ts">
	import { untrack } from 'svelte';
	import type { Contest, Problem } from '#lib/types.js';
	import Editor from './Editor.svelte';
	import Markdown from './Markdown.svelte';
	import Code from './Code.svelte';
	import SubmissionEditor from './SubmissionEditor.svelte';
	let {
		data,
		form
	}: {
		data: { problem: Problem; usedIn: Contest[]; saved: boolean };
		form?: { error: string; problem: Problem } | null;
	} = $props();
	let p = $state<Problem>(untrack(() => ({ ...(form?.problem ?? data.problem) })));
	$effect(() => {
		p = { ...(form?.problem ?? data.problem) };
	});
	const testCount = $derived(p.test_output.trim() ? p.test_output.trim().split(/\r?\n/).length : 0);
</script>

<svelte:head><title>{p.id ? p.title : 'New Problem'} - Admin</title></svelte:head>
<div class="container">
	<div class="btn-row">
		<a href="/admin">Dashboard</a><a href="/admin/problems">Problem bank</a>
	</div>
	<h1>{p.id ? p.title : 'New Problem'}</h1>
	{#if data.saved && !form?.error}<p class="success-notice">Saved.</p>{/if}{#if form?.error}<p
			class="error"
		>
			{form.error}
		</p>{/if}
	{#if data.usedIn.some((c) => c.status === 'active')}<p class="notice">
			This problem is in a running contest. Edits take effect immediately and do not rejudge earlier
			submissions.
		</p>{/if}
	{#if data.usedIn.length}<div class="card">
			<strong>Used in:</strong>{#each data.usedIn as c}<p>
					<a href={`/admin/contests/${c.id}`}>{c.name}</a>
					<span class={`badge ${c.status}`}>{c.status}</span>
				</p>{/each}
		</div>{/if}
	<div class="help-box">
		<strong>Grading protocol.</strong> The contestant's code defines a function <code>f</code> in
		<code>submission.py</code>. The grader (<code>main.py</code>) receives the test input on stdin,
		must <Code code="from submission import f" />, call <code>f</code> once per test case, and print
		one line of output per case. Stdout is compared line-by-line against the expected output
		(trailing whitespace is ignored). Before each case, the grader should write
		<code>TESTCASE n: &lt;input description&gt;</code>
		to stderr so contestants can see which case failed. The time limit applies to the whole run, across
		all test cases. Expected test count: {testCount}.
	</div>
	<form method="POST">
		<div class="field">
			<label for="title">Title</label><input
				type="text"
				id="title"
				name="title"
				bind:value={p.title}
				required
				maxlength="200"
			/>
		</div>
		<div class="statement-edit-layout">
			<div class="field">
				<strong>Statement (Markdown)</strong><Editor
					mode="markdown"
					name="statement"
					label="Statement (Markdown)"
					bind:value={p.statement}
				/>
			</div>
			<div class="field">
				<strong>Statement preview</strong>
				<Markdown source={p.statement} preview />
			</div>
		</div>
		<div class="field">
			<label for="test-input">Test input</label><textarea
				id="test-input"
				name="test_input"
				bind:value={p.test_input}
				class="mono code-area"
				spellcheck="false"></textarea>
		</div>
		<div class="field">
			<label for="test-output">Test output (one line per case)</label><textarea
				id="test-output"
				name="test_output"
				bind:value={p.test_output}
				class="mono code-area"
				spellcheck="false"></textarea>
		</div>
		<div class="field">
			<strong>Grader (Python, main.py)</strong><Editor
				name="grader"
				label="Grader (Python)"
				bind:value={p.grader}
			/>
		</div>
		<div class="btn-row">
			<div class="field">
				<label for="time">Time limit (ms, whole run)</label><input
					id="time"
					name="time_limit_ms"
					type="number"
					min="100"
					max="10000"
					bind:value={p.time_limit_ms}
					required
				/>
			</div>
			<div class="field">
				<label for="memory">Memory limit (MB)</label><input
					id="memory"
					name="memory_limit_mb"
					type="number"
					min="16"
					max="1024"
					value={p.memory_limit_kb / 1024}
					required
				/>
			</div>
		</div>
		<div class="btn-row"><button>Save problem</button><a href="/admin/problems">Cancel</a></div>
	</form>
	{#if p.id}<section class="card">
			<h2>Try a solution</h2>
			<p class="muted">
				Runs against the saved version without recording a submission. Save your edits first.
			</p>
			<SubmissionEditor
				action={`/admin/problems/${p.id}/test`}
				storageKey={`admin_test_${p.id}`}
				button="Run"
			/>
		</section>{/if}
</div>
