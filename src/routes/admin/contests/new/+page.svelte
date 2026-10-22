<script lang="ts">
	import type { PageProps } from './$types';
	import ContestForm from '#lib/components/ContestForm.svelte';
	let { data, form }: PageProps = $props();
</script>

<ContestForm {data} {form} />
