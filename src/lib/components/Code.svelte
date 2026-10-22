<script lang="ts">
	import { highlight } from '#lib/markdown.js';
	let { code, language = 'python' }: { code: string; language?: string } = $props();
</script>

<code class="hljs">{@html highlight(code, language)}</code>
