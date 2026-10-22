<script lang="ts">
	import type { PageProps } from './$types';
	import { ended, durationLabel } from '#lib/types.js';
	let { data }: PageProps = $props();
	const groups = $derived([
		{
			title: 'Live now',
			contests: data.contests.filter((c) => c.status !== 'pending' && !ended(c)),
			button: 'Enter',
			path: 'join'
		},
		{
			title: 'Upcoming',
			contests: data.contests.filter((c) => c.status === 'pending'),
			button: 'Join waiting room',
			path: 'join'
		},
		{
			title: 'Past contests',
			contests: data.contests.filter((c) => c.status !== 'pending' && ended(c)),
			button: 'Results',
			path: 'leaderboard'
		}
	]);
</script>

<div class="container">
	<h1>CUCaTS Code Golf</h1>
	{#each groups as group}{#if group.contests.length}<h2>{group.title}</h2>
			{#each group.contests as c}<div class="card">
					<h3>{c.name}</h3>
					<p>{durationLabel(c)} <span class={`badge ${c.status}`}>{c.status}</span></p>
					<a class="button" href={`/contest/${c.id}/${group.path}`}>{group.button}</a>
				</div>{/each}{/if}{/each}
	{#if !data.contests.length}<div class="card">No contests yet.</div>{/if}
</div>
