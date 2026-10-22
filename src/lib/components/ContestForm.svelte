<script lang="ts">
  import { untrack } from "svelte";
  import Timestamp from "./Timestamp.svelte";
  import { durationLabel, label } from "#lib/types.js";
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
      problemIds: number[];
    } | null;
  } = $props();
  const c = $derived(data.contest);
  const editable = $derived(!c || c.status === "pending");
  const initialIds = () =>
    [...new Set(form?.problemIds ?? data.selected.map((p) => p.id))].filter(
      (id) => data.choices.some((p) => p.id === id),
    );
  let problemIds = $state<number[]>(untrack(initialIds));
  let candidate = $state<number | undefined>();
  $effect(() => {
    problemIds = initialIds();
    candidate = undefined;
  });
  const available = $derived(
    data.choices.filter((p) => !problemIds.includes(p.id)),
  );
  function addProblem() {
    if (!editable || !available.some((p) => p.id === candidate)) return;
    problemIds = [...problemIds, candidate!];
    candidate = undefined;
  }
  function moveProblem(index: number, direction: number) {
    const target = index + direction;
    if (!editable || target < 0 || target >= problemIds.length) return;
    const reordered = [...problemIds];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    problemIds = reordered;
  }
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
    {#if !editable}<p class="notice">
        The problem set is locked once the contest has started.
      </p>{/if}
    <ol class="contest-problems">
      {#each problemIds as pid, i (pid)}
        {@const p = data.choices.find((p) => p.id === pid)!}
        <li>
          <input type="hidden" name="problem_ids" value={pid} />
          <span class="pc-label">{label(i)}.</span>
          <a
            class="problem-title"
            href={`/admin/problems/${pid}`}
            target="_blank"
            rel="noreferrer">{p.title}</a
          >
          {#if editable}<div class="btn-row">
              <button
                type="button"
                class="secondary"
                aria-label={`Move ${p.title} up`}
                disabled={i === 0}
                onclick={() => moveProblem(i, -1)}>↑</button
              >
              <button
                type="button"
                class="secondary"
                aria-label={`Move ${p.title} down`}
                disabled={i === problemIds.length - 1}
                onclick={() => moveProblem(i, 1)}>↓</button
              >
              <button
                type="button"
                class="secondary"
                aria-label={`Remove ${p.title}`}
                onclick={() =>
                  (problemIds = problemIds.filter((id) => id !== pid))}
                >Remove</button
              >
            </div>{/if}
        </li>
      {:else}<li class="muted">No problems added.</li>{/each}
    </ol>
    {#if editable}
      <div class="btn-row add-problem">
        <select
          aria-label="Problem to add"
          bind:value={candidate}
          disabled={!available.length}
        >
          <option value={undefined} disabled
            >{available.length
              ? "Choose a problem"
              : "No more problems to add"}</option
          >
          {#each available as p}<option value={p.id}>{p.title}</option>{/each}
        </select>
        <button
          type="button"
          disabled={candidate === undefined}
          onclick={addProblem}>Add problem</button
        >
      </div>
      <p>
        <a href="/admin/problems/new" target="_blank" rel="noreferrer"
          >Create a new problem</a
        >
      </p>
    {/if}
    <div class="btn-row section-actions">
      <button>{c ? "Save" : "Create contest"}</button><a href="/admin">Cancel</a
      >
    </div>
  </form>
</div>

<style>
  .contest-problems {
    list-style: none;
    margin: 12px 0;
  }
  .contest-problems li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #334155;
  }
  .problem-title {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .contest-problems .btn-row {
    flex-wrap: nowrap;
    gap: 6px;
  }
  .contest-problems button {
    padding: 4px 8px;
  }
  .contest-problems button:disabled,
  .add-problem button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .add-problem {
    margin-bottom: 12px;
  }
  .add-problem select {
    flex: 1;
    min-width: 0;
  }
</style>
