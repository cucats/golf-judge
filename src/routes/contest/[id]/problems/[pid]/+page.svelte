<script lang="ts">
	import type { PageProps } from './$types';
	import { untrack } from 'svelte';
	import { accepting, label } from '#lib/types.js';
	import Markdown from '#lib/components/Markdown.svelte';
	import Timer from '#lib/components/Timer.svelte';
	import SubmissionEditor from '#lib/components/SubmissionEditor.svelte';
	let { data }: PageProps = $props();
	let best = $state<number | null>(untrack(() => data.bestBytes));
	$effect(() => {
		best = data.bestBytes;
	});
	const blocked = $derived(
		data.contest.status === 'pending'
			? 'Contest has not started'
			: !accepting(data.contest)
				? 'Contest has ended'
				: !data.user
					? 'Log in to submit'
					: null
	);
</script>

<svelte:head
	><title>{label(data.problem.problem_order)}. {data.problem.title} - {data.contest.name}</title
	></svelte:head
>
<div class="container">
	<div class="btn-row">
		<a href={`/contest/${data.contest.id}/problems`}>Problems</a><a
			href={`/contest/${data.contest.id}/leaderboard`}>Leaderboard</a
		><Timer contest={data.contest} />
	</div>
</div>
<div class="problem-layout">
	<section class="card">
		<h2>{label(data.problem.problem_order)}. {data.problem.title}</h2>
		<p class="muted">
			Time limit {data.problem.time_limit_ms} ms (whole run) · Memory {data.problem
				.memory_limit_kb / 1024} MB{#if best !== null}
				· Best: {best} bytes{/if}
		</p>
		<Markdown html={data.html} />
	</section>
	<section>
		{#key `${data.contest.id}_${data.problem.id}_${data.user?.username ?? ''}`}<SubmissionEditor
				action={`/contest/${data.contest.id}/problems/${data.problem.id}/submit`}
				storageKey={`code_${data.contest.id}_${data.problem.id}_${data.user?.username ?? ''}`}
				{blocked}
				{best}
				onaccepted={(bytes) => {
					best = best === null ? bytes : Math.min(best, bytes);
				}}
			/>{/key}
	</section>
</div>
