<script lang="ts">
  import type { PageProps } from "./$types";
  let { data, form }: PageProps = $props();
  const stage = $derived(form?.stage ?? data.stage);
</script>

<svelte:head><title>Reset password - CUCaTS Code Golf</title></svelte:head>
<div class="login-container">
  <h1>Reset password</h1>
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  {#if stage === "email"}
    <form method="POST" action="?/send">
      <input
        type="email"
        name="email"
        autocomplete="email"
        aria-label="Email"
        maxlength="254"
        required
      />
      <button>Send code</button>
    </form>
  {:else if stage === "code"}
    <form method="POST" action="?/verify">
      <input
        type="text"
        name="code"
        autocomplete="one-time-code"
        aria-label="Code"
        pattern="[A-Z0-9]{6}"
        minlength="6"
        maxlength="6"
        required
      />
      <button>Verify</button>
    </form>
  {:else}
    <form method="POST" action="?/reset">
      <label for="new">New password</label>
      <input
        id="new"
        name="new_password"
        type="password"
        autocomplete="new-password"
        minlength="4"
        required
      />
      <label for="confirm">Confirm new password</label>
      <input
        id="confirm"
        name="confirm_password"
        type="password"
        autocomplete="new-password"
        minlength="4"
        required
      />
      <button>Reset password</button>
    </form>
  {/if}
</div>
