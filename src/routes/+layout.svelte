<script lang="ts">
	import type { LayoutProps } from './$types';
	import '../../static/css/style.css';
	let { data, children }: LayoutProps = $props();
</script>

<svelte:head><title>CUCaTS Code Golf</title></svelte:head>
<nav class="nav">
	<a href="/"><strong>CUCaTS Code Golf</strong></a>
	<div class="nav-user">
		<a href="/tips">Tips</a>
		{#if data.user?.is_admin}<a href="/admin">Admin</a>{/if}
		{#if data.user}<span class="nav-username">{data.user.username}</span><a href="/change-password"
				>Change password</a
			>
			<form method="POST" action="/logout"><button class="link-btn">Logout</button></form>{:else}<a
				href="/login">Login</a
			>{/if}
	</div>
</nav>
{@render children()}
