<script lang="ts">
	import type { PageProps } from './$types';
	import Poll from '#lib/components/Poll.svelte';
	import { durationLabel } from '#lib/types.js';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Waiting Room - {data.contest.name}</title></svelte:head>
<Poll />
<div class="container">
	<h1>Waiting Room</h1>
	<div class="card">
		<h2>{data.contest.name}</h2>
		<p>The contest has not started yet. This page will refresh automatically.</p>
		<p>
			<strong>Duration:</strong>
			{durationLabel(data.contest)}<br /><strong>Problems:</strong>
			{data.problemCount}
		</p>
	</div>
</div>
