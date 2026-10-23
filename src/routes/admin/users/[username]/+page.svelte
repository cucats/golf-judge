<script lang="ts">
  import type { PageProps } from "./$types";
  import Breadcrumbs from "#lib/components/Breadcrumbs.svelte";
  let { data, form }: PageProps = $props();
</script>

<svelte:head
  ><title>Change password - {data.account.username}</title></svelte:head
>
<div class="container">
  <Breadcrumbs
    items={[
      { label: "Home", href: "/" },
      { label: "Admin", href: "/admin" },
      { label: "Users", href: "/admin/users" },
      { label: data.account.username },
    ]}
  />
  <h1>{data.account.username}</h1>
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  {#if form?.changed}<p class="success-notice">Password changed.</p>{/if}
  <form method="POST" class="card">
    <div class="field">
      <label for="new">New password</label>
      <input
        id="new"
        name="new_password"
        type="password"
        autocomplete="new-password"
        minlength="4"
        required
      />
    </div>
    <div class="field">
      <label for="confirm">Confirm new password</label>
      <input
        id="confirm"
        name="confirm_password"
        type="password"
        autocomplete="new-password"
        minlength="4"
        required
      />
    </div>
    <div class="btn-row">
      <button>Change password</button><a href="/admin/users">Cancel</a>
    </div>
  </form>
</div>
