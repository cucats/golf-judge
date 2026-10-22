<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	let { active = true }: { active?: boolean } = $props();
	onMount(() => {
		let pending = false;
		const timer = setInterval(async () => {
			if (!active || pending || document.hidden || window.getSelection()?.toString()) return;
			pending = true;
			try {
				await refreshAll();
			} finally {
				pending = false;
			}
		}, 5000);
		return () => clearInterval(timer);
	});
</script>
