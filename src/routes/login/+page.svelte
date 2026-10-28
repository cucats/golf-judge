<script lang="ts">
  import type { PageProps } from "./$types";
  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Login - CUCaTS Code Golf</title></svelte:head>
<div class="login-container">
  <h1>Login</h1>
  <p class="muted">Create or login</p>
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <form method="POST">
    <input type="hidden" name="next" value={form?.next ?? data.next} /><label
      for="username">Username</label
    ><input
      type="text"
      id="username"
      name="username"
      value={form?.username ?? ""}
      maxlength="32"
      autocomplete="username"
      required
    /><label for="password">Password</label><input
      id="password"
      type="password"
      name="password"
      autocomplete="current-password"
      required
    /><label for="email">Email (optional)</label><input
      id="email"
      type="email"
      name="email"
      autocomplete="email"
      maxlength="254"
      value={form?.email ?? ""}
    />
    <div class="btn-row">
      <button>Login</button><a href="/reset-password">Forgot</a>
    </div>
  </form>
</div>
