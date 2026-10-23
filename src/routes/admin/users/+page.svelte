<script lang="ts">
  import type { PageProps } from "./$types";
  import Breadcrumbs from "#lib/components/Breadcrumbs.svelte";
  import Timestamp from "#lib/components/Timestamp.svelte";
  let { data }: PageProps = $props();
</script>

<svelte:head><title>Users - Admin</title></svelte:head>
<div class="container">
  <Breadcrumbs
    items={[
      { label: "Home", href: "/" },
      { label: "Admin", href: "/admin" },
      { label: "Users" },
    ]}
  />
  <h1>Users</h1>
  <div class="card table-scroll">
    <table class="table">
      <thead>
        <tr><th>Username</th><th>Role</th><th>Created</th><th></th></tr>
      </thead>
      <tbody>
        {#each data.users as user}
          <tr>
            <td>{user.username}</td>
            <td>{user.is_admin ? "Admin" : "User"}</td>
            <td class="muted"><Timestamp timestamp={user.created_at} /></td>
            <td
              ><a href={`/admin/users/${encodeURIComponent(user.username)}`}
                >Change password</a
              ></td
            >
          </tr>
        {:else}<tr><td colspan="4">No users.</td></tr>{/each}
      </tbody>
    </table>
  </div>
</div>
