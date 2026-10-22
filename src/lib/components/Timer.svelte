<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { remaining, ended } from '#lib/types.js';
	import type { Contest } from '#lib/types.js';
	let { contest }: { contest: Contest } = $props();
	let time = $state(Math.floor(Date.now() / 1000));
	const left = $derived(remaining(contest, time));
	onMount(() => {
		const interval = setInterval(() => {
			time = Math.floor(Date.now() / 1000);
			if (remaining(contest, time) === 0) {
				clearInterval(interval);
				void refreshAll();
			}
		}, 1000);
		return () => clearInterval(interval);
	});
</script>

{#if left !== null && !ended(contest)}<span class="countdown"
		>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span
	>{/if}
