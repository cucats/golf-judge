<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, wrap = false }: { children: Snippet; wrap?: boolean } =
    $props();
</script>

<span class="inline-items" class:wrap>{@render children()}</span>

<style>
  .inline-items {
    display: inline-flex;
    align-items: baseline;
    column-gap: 1ch;
  }
  .wrap {
    flex-wrap: wrap;
  }
</style>
