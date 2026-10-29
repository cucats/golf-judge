<script lang="ts">
  import Breadcrumbs from "#lib/components/Breadcrumbs.svelte";
  import Poll from "#lib/components/Poll.svelte";
  import Timestamp from "#lib/components/Timestamp.svelte";
  import type { PageProps } from "./$types";
  let { data }: PageProps = $props();
</script>

<svelte:head><title>Queue - CUCaTS Code Golf</title></svelte:head>
<Poll />
<div class="container">
  <Breadcrumbs
    items={[
      { label: "Home", href: "/" },
      { label: "Admin", href: "/admin" },
      { label: "Queue" },
    ]}
  />
  <h1>Queue</h1>
  <p>
    Queued: {data.jobs.filter((job) => job.state === "queued").length}
    · Running: {data.jobs.filter((job) => job.state === "running").length}
  </p>
  <div class="card table-scroll">
    <table class="table">
      <thead>
        <tr>
          <th>Submitted</th><th>Username</th><th>Problem</th><th>Contest</th>
          <th>Status</th><th>Progress</th>
        </tr>
      </thead>
      <tbody>
        {#each data.jobs as job (job.id)}
          <tr>
            <td class="muted"><Timestamp timestamp={job.created_at} /></td>
            <td
              ><a href={`/admin/users/${encodeURIComponent(job.username)}`}
                >{job.username}</a
              ></td
            >
            <td
              ><a href={`/admin/problems/${job.problem_id}`}
                >{job.problem_title}</a
              ></td
            >
            <td>
              {#if job.contest_id !== null}
                <a href={`/admin/contests/${job.contest_id}/submissions`}
                  >{job.contest_name}</a
                >
              {:else}Problem test{/if}
            </td>
            <td>
              {job.state === "queued" ? "Queued" : "Running"}
              {#if job.state === "running" && job.lease_until !== null && job.lease_until < data.now}
                <span class="muted">(lease expired)</span>
              {/if}
            </td>
            <td>{job.completed}/{job.total}</td>
          </tr>
        {:else}
          <tr><td colspan="6">Queue empty.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
