<script lang="ts">
  import { markdown } from "#lib/markdown.js";
  let {
    source = "",
    html,
    preview = false,
  }: { source?: string; html?: string; preview?: boolean } = $props();
</script>

<div
  class="problem-statement"
  class:statement-preview={preview}
  class:card={preview}
>
  {@html html ?? markdown(source)}
</div>
