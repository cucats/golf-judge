<script lang="ts">
  import type { PageProps } from "./$types";
  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Contest password - CUCaTS Code Golf</title></svelte:head>
<div class="login-container">
  <h1>{data.name}</h1>
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <form method="POST">
    <input type="hidden" name="next" value={form?.next ?? data.next} />
    <label for="password">Contest password</label>
    <input
      id="password"
      name="password"
      type="password"
      autocomplete="current-password"
      required
    />
    <button>Enter contest</button>
  </form>
</div>
