<script lang="ts">
  import { onMount } from "svelte";
  let { timestamp }: { timestamp: number } = $props();
  let mounted = $state(false);
  const date = $derived(new Date(timestamp * 1000));
  const formatted = $derived(
    mounted
      ? date.toLocaleString()
      : `${date.toLocaleString("en-GB", { timeZone: "UTC" })} UTC`,
  );
  onMount(() => {
    mounted = true;
  });
</script>

<time datetime={date.toISOString()}>{formatted}</time>
