<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="container">
	<h1>{page.status}</h1>
	<p>{page.error?.message ?? 'Something went wrong'}</p>
	<a href="/">Home</a>
</div>
