<script lang="ts">
  import Timestamp from "./Timestamp.svelte";
  import { durationLabel } from "#lib/types.js";
  import type { Contest, ContestProblem, ProblemSummary } from "#lib/types.js";
  let {
    data,
    form,
  }: {
    data: {
      contest: Contest | null;
      choices: ProblemSummary[];
      selected: ContestProblem[];
      counts: { participants: number; submissions: number };
      origin: string;
    };
    form?: {
      error: string;
      name: string;
      duration: string;
      positions: Record<string, string>;
    } | null;
  } = $props();
  const c = $derived(data.contest);
</script>

<svelte:head><title>{c?.name ?? "New Contest"} - Admin</title></svelte:head>
<div class="container">
  <a href="/admin">← Dashboard</a>
  <h1>{c?.name ?? "New Contest"}</h1>
  {#if c}<div class="card">
      <p>
        <strong>Status:</strong>
        <span class={`badge ${c.status}`}>{c.status}</span>
      </p>
      <p><strong>Duration:</strong> {durationLabel(c)}</p>
      {#if c.start_time}<p>
          <strong>Started:</strong>
          <Timestamp timestamp={c.start_time} />
        </p>{/if}
      <p>
        <strong>Participants:</strong>
        {data.counts.participants} · <strong>Submissions:</strong>
        {data.counts.submissions}
      </p>
      <p>
        <strong>Share link:</strong>
        <a href={`/contest/${c.id}`}>{data.origin}/contest/{c.id}</a>
      </p>
      <div class="btn-row">
        <a href={`/contest/${c.id}/problems`}>Preview as contestant</a><a
          href={`/contest/${c.id}/leaderboard`}>Leaderboard</a
        ><a href={`/admin/contests/${c.id}/submissions`}>Submissions</a>
      </div>
    </div>
    <div class="btn-row section-actions">
      {#if c.status === "pending"}<form
          method="POST"
          action={`/admin/contests/${c.id}/start`}
        >
          <button class="success">Start contest</button>
        </form>{/if}
      {#if c.status === "active"}<form
          method="POST"
          action={`/admin/contests/${c.id}/end`}
          onsubmit={(e) => {
            if (!confirm("End this contest now?")) e.preventDefault();
          }}
        >
          <button class="danger">End contest</button>
        </form>{:else}<form
          method="POST"
          action={`/admin/contests/${c.id}/delete`}
          onsubmit={(e) => {
            if (!confirm("Delete this contest and all its submissions?"))
              e.preventDefault();
          }}
        >
          <button class="danger">Delete contest</button>
        </form>{/if}
    </div>{/if}
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <form method="POST" class="card">
    <div class="field">
      <label for="name">Contest name</label><input
        type="text"
        id="name"
        name="name"
        value={form?.name ?? c?.name ?? ""}
        required
        maxlength="100"
      />
    </div>
    <div class="field">
      <label for="duration">Duration (minutes)</label><input
        id="duration"
        name="duration"
        type="number"
        min="0"
        value={form?.duration ?? (c ? c.duration / 60 : 60)}
        required
      />
      <p class="muted">Use 0 for no time limit.</p>
    </div>
    <h3>Problems</h3>
    <p class="muted">
      Enter a position (1, 2, 3…) to include a problem; leave blank to exclude.
    </p>
    {#if c && c.status !== "pending"}<p class="notice">
        The problem set is locked once the contest has started.
      </p>{/if}
    <table class="table problem-choice-table">
      <thead><tr><th>Position</th><th>Title</th></tr></thead><tbody
        >{#each data.choices as p}{@const order = data.selected.find(
            (s) => s.id === p.id,
          )?.problem_order}<tr
            ><td
              ><input
                aria-label={`Position for ${p.title}`}
                type="number"
                min="1"
                name={`pos_${p.id}`}
                value={form?.positions[`pos_${p.id}`] ??
                  (order === undefined ? "" : order + 1)}
                disabled={!!c && c.status !== "pending"}
              /></td
            ><td
              ><a
                href={`/admin/problems/${p.id}`}
                target="_blank"
                rel="noreferrer">{p.title}</a
              ></td
            ></tr
          >{/each}</tbody
      >
    </table>
    <p>
      <a href="/admin/problems/new" target="_blank" rel="noreferrer"
        >Create a new problem</a
      >
    </p>
    <div class="btn-row">
      <button>{c ? "Save" : "Create contest"}</button><a href="/admin">Cancel</a
      >
    </div>
  </form>
</div>
