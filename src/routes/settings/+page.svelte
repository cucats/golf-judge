<script lang="ts">
  import type { PageProps } from "./$types";
  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Settings - CUCaTS Code Golf</title></svelte:head>
<div class="container">
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <form method="POST" class="email-form">
    <label for="email">Email (optional)</label>
    <input
      id="email"
      name="email"
      type="email"
      autocomplete="email"
      maxlength="254"
      value={form?.email ?? data.email}
    />
    <div><button>Save</button></div>
  </form>
  <a class="button" href="/change-password">Change password</a>
</div>

<style>
  .email-form {
    max-width: 28rem;
    margin-bottom: 20px;
  }
</style>
