<script lang="ts">
  import Breadcrumbs from "#lib/components/Breadcrumbs.svelte";
  import InlineItems from "#lib/components/InlineItems.svelte";
  import type { PageProps } from "./$types";
  import { durationLabel } from "#lib/types.js";
  let { data }: PageProps = $props();
</script>

<svelte:head><title>Admin - CUCaTS Code Golf</title></svelte:head>
<div class="container">
  <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Admin" }]} />
  <h1>Admin</h1>
  <div class="btn-row section-actions">
    <a class="button" href="/admin/contests/new">New contest</a><a
      href="/admin/problems">Problem bank ({data.bankSize})</a
    >
    <a href="/admin/users">Users</a>
    <a href="/admin/queue">Queue</a>
  </div>
  <div class="card table-scroll">
    <table class="table">
      <thead
        ><tr
          ><th>Contest</th><th>Status</th><th>Duration</th><th>Problems</th><th
            >Participants</th
          ><th>Submissions</th></tr
        ></thead
      ><tbody
        >{#each data.contests as c}<tr
            ><td
              ><InlineItems
                ><a href={`/admin/contests/${c.id}`}>{c.name}</a
                >{#if c.is_private}<span class="muted" aria-hidden="true"
                    >·</span
                  ><span class="muted">Private</span>{/if}</InlineItems
              ></td
            ><td><span class={`badge ${c.status}`}>{c.status}</span></td><td
              >{durationLabel(c)}</td
            ><td>{c.problem_count}</td><td>{c.participant_count}</td><td
              ><a href={`/admin/contests/${c.id}/submissions`}
                >{c.submission_count}</a
              ></td
            ></tr
          >{:else}<tr><td colspan="6">No contests yet.</td></tr>{/each}</tbody
      >
    </table>
  </div>
</div>
