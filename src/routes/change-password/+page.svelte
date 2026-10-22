<script lang="ts">
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<svelte:head><title>Change password - CUCaTS Code Golf</title></svelte:head>
<div class="login-container">
	<h1>Change password</h1>
	{#if form?.error}<p class="error">{form.error}</p>{/if}{#if form?.changed}<p
			class="success-notice"
		>
			Password changed.
		</p>{/if}
	<form method="POST">
		<label for="current">Current password</label><input
			id="current"
			name="current_password"
			type="password"
			autocomplete="current-password"
			required
		/><label for="new">New password</label><input
			id="new"
			name="new_password"
			type="password"
			autocomplete="new-password"
			minlength="4"
			required
		/><label for="confirm">Confirm new password</label><input
			id="confirm"
			name="confirm_password"
			type="password"
			autocomplete="new-password"
			minlength="4"
			required
		/><button>Change password</button>
	</form>
</div>
