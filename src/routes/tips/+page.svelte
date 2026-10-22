<script lang="ts">
  import type { PageProps } from "./$types";
  import Markdown from "#lib/components/Markdown.svelte";
  let { data }: PageProps = $props();
</script>

<svelte:head><title>Tips - CUCaTS Code Golf</title></svelte:head>
<div class="container">
  <h1>Tips</h1>
  <div class="table table-scroll"><Markdown html={data.html} /></div>
</div>
