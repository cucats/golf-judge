<script lang="ts">
  import type { PageProps } from "./$types";
  let { data }: PageProps = $props();
</script>

<svelte:head><title>Problem bank - Admin</title></svelte:head>
<div class="container">
  <a href="/admin">← Dashboard</a>
  <h1>Problem bank</h1>
  <p><a class="button" href="/admin/problems/new">New problem</a></p>
  {#if data.error}<p class="error">{data.error}</p>{/if}
  <div class="card table-scroll">
    <table class="table">
      <thead
        ><tr
          ><th>Title</th><th>Contests</th><th>Submissions</th><th>Actions</th
          ></tr
        ></thead
      ><tbody
        >{#each data.problems as p}<tr
            ><td><a href={`/admin/problems/${p.id}`}>{p.title}</a></td><td
              >{p.contest_count}</td
            ><td>{p.submission_count}</td><td
              ><div class="btn-row">
                <form
                  method="POST"
                  action={`/admin/problems/${p.id}/duplicate`}
                >
                  <button class="secondary">Duplicate</button>
                </form>
                <form
                  method="POST"
                  action={`/admin/problems/${p.id}/delete`}
                  onsubmit={(e) => {
                    if (!confirm(`Delete ${p.title}?`)) e.preventDefault();
                  }}
                >
                  <button
                    class="danger"
                    disabled={p.contest_count > 0 || p.submission_count > 0}
                    >Delete</button
                  >
                </form>
              </div></td
            ></tr
          >{:else}<tr><td colspan="4">No problems yet.</td></tr>{/each}</tbody
      >
    </table>
  </div>
</div>
