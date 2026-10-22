<script lang="ts">
	import type { PageProps } from './$types';
	import Timer from '#lib/components/Timer.svelte';
	import { accepting, label } from '#lib/types.js';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Problems - {data.contest.name}</title></svelte:head>
<div class="container">
	<div class="btn-row">
		<a href={`/contest/${data.contest.id}/leaderboard`}>Leaderboard</a><Timer
			contest={data.contest}
		/>
	</div>
	<h1>Problems</h1>
	{#if data.contest.status === 'pending'}<p class="notice">
			Preview — contest has not started
		</p>{:else if !accepting(data.contest)}<p class="notice">
			This contest has ended — problems are read-only.
		</p>{/if}
	<div class="card table-scroll">
		<table class="table">
			<thead><tr><th>#</th><th>Title</th><th>Status</th></tr></thead><tbody
				>{#each data.problems as p}<tr
						><td>{label(p.problem_order)}</td><td
							><a href={`/contest/${data.contest.id}/problems/${p.id}`}>{p.title}</a></td
						><td class="muted"
							>{#if p.best_bytes !== null}<strong class="verdict-ac">✓ {p.best_bytes} bytes</strong
								>{:else if p.attempts}{p.attempts} attempt{p.attempts === 1
									? ''
									: 's'}{:else}—{/if}</td
						></tr
					>{:else}<tr><td colspan="3">No problems in this contest.</td></tr>{/each}</tbody
			>
		</table>
	</div>
</div>
