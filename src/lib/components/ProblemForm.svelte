<script lang="ts">
  import Breadcrumbs from "#lib/components/Breadcrumbs.svelte";
  import { untrack } from "svelte";
  import type { Contest, Problem } from "#lib/types.js";
  import Editor from "./Editor.svelte";
  import Markdown from "./Markdown.svelte";
  import Code from "./Code.svelte";
  import SubmissionEditor from "./SubmissionEditor.svelte";
  let {
    data,
    form,
  }: {
    data: {
      problem: Problem;
      usedIn: Contest[];
      saved: boolean;
      user?: { username: string } | null;
    };
    form?: { error: string; problem: Problem } | null;
  } = $props();
  const copyProblem = (problem: Problem): Problem => ({
    ...problem,
    test_cases: problem.test_cases.map((test) => ({ ...test })),
  });
  let p = $state<Problem>(
    untrack(() => copyProblem(form?.problem ?? data.problem)),
  );
  $effect(() => {
    p = copyProblem(form?.problem ?? data.problem);
    selectedCase = 0;
  });
  let selectedCase = $state(0);
  function addCase() {
    p.test_cases.push({ input: "", output: "", public: true });
    selectedCase = p.test_cases.length - 1;
  }
  function removeCase() {
    p.test_cases.splice(selectedCase, 1);
    selectedCase = Math.max(0, Math.min(selectedCase, p.test_cases.length - 1));
  }
</script>

<svelte:head
  ><title>{p.id ? p.title : "New Problem"} - Admin</title></svelte:head
>
<div class="container">
  <Breadcrumbs
    items={[
      { label: "Home", href: "/" },
      { label: "Admin", href: "/admin" },
      { label: "Problem bank", href: "/admin/problems" },
      { label: p.id ? p.title : "New problem" },
    ]}
  />
  <h1>{p.id ? p.title : "New Problem"}</h1>
  {#if data.saved && !form?.error}<p class="success-notice">
      Saved.
    </p>{/if}{#if form?.error}<p class="error">
      {form.error}
    </p>{/if}
  {#if data.usedIn.some((c) => c.status === "active")}<p class="notice">
      This problem is in a running contest. Edits take effect immediately and do
      not rejudge earlier submissions.
    </p>{/if}
  {#if data.usedIn.length}<div class="card">
      <strong>Used in:</strong>{#each data.usedIn as c}<p>
          <a href={`/admin/contests/${c.id}`}>{c.name}</a>
          <span class={`badge ${c.status}`}>{c.status}</span>
        </p>{/each}
    </div>{/if}
  <div class="help-box">
    <strong>Grading protocol.</strong> Each input/output pair is one test case.
    The grader and submitted code each run in one sandbox for the whole suite.
    The grader receives each case's input on stdin, uses <Code
      code="from submission import f"
    />, and prints the output to compare with that case's expected output.
    Trailing whitespace is ignored. The time limit applies to the whole suite.
    Public cases show failure values; private cases keep those values hidden.
  </div>
  <form method="POST">
    <div class="field">
      <label for="title">Title</label><input
        type="text"
        id="title"
        name="title"
        bind:value={p.title}
        required
        maxlength="200"
      />
    </div>
    <div class="statement-edit-layout">
      <div class="field">
        <strong>Statement (Markdown)</strong><Editor
          mode="markdown"
          name="statement"
          label="Statement (Markdown)"
          bind:value={p.statement}
        />
      </div>
      <div class="field">
        <strong>Statement preview</strong>
        <Markdown source={p.statement} preview />
      </div>
    </div>
    <section class="test-cases" aria-label="Test cases">
      <input
        type="hidden"
        name="test_cases"
        value={JSON.stringify(p.test_cases)}
      />
      <strong>Test cases · {p.test_cases.length}</strong>
      <div class="btn-row case-controls">
        {#if p.test_cases.length}
          <label for="test-case">Case</label>
          <select id="test-case" bind:value={selectedCase}>
            {#each p.test_cases as test, index}<option value={index}
                >{index + 1}{test.public ? " · public" : ""}</option
              >{/each}
          </select>
        {/if}
        <button type="button" onclick={addCase}>Add case</button>
        {#if p.test_cases.length}<button
            type="button"
            class="danger"
            onclick={removeCase}>Remove case</button
          >{/if}
      </div>
      {#if p.test_cases[selectedCase]}
        <div class="case-fields">
          <div class="field">
            <label for="test-input">Input</label><textarea
              id="test-input"
              bind:value={p.test_cases[selectedCase].input}
              class="mono code-area"
              spellcheck="false"></textarea>
          </div>
          <div class="field">
            <label for="test-output">Expected output</label><textarea
              id="test-output"
              bind:value={p.test_cases[selectedCase].output}
              class="mono code-area"
              spellcheck="false"></textarea>
          </div>
        </div>
        <label class="case-visibility"
          ><input
            type="checkbox"
            bind:checked={p.test_cases[selectedCase].public}
          /> Public case</label
        >
      {/if}
    </section>
    <div class="field">
      <strong>Grader</strong><Editor
        name="grader"
        label="Grader"
        bind:value={p.grader}
      />
    </div>
    <div class="field">
      <label for="result-mode">Return value</label><select
        id="result-mode"
        name="result_mode"
        bind:value={p.result_mode}
        aria-describedby="result-mode-help"
      >
        <option value="value">Value</option>
        <option value="truthy">Truthy or falsy</option>
      </select>
      <p id="result-mode-help" class="muted">
        Truthy or falsy converts the submitted function's return value to a
        boolean before the grader receives it.
      </p>
    </div>
    <div class="btn-row">
      <div class="field">
        <label for="time">Time limit (ms, whole suite)</label><input
          id="time"
          name="time_limit_ms"
          type="number"
          min="100"
          max="10000"
          bind:value={p.time_limit_ms}
          required
        />
      </div>
      <div class="field">
        <label for="memory">Memory limit (MB)</label><input
          id="memory"
          name="memory_limit_mb"
          type="number"
          min="16"
          max="1024"
          value={p.memory_limit_kb / 1024}
          required
        />
      </div>
    </div>
    <div class="btn-row section-actions">
      <button>Save problem</button><a href="/admin/problems">Cancel</a>
    </div>
  </form>
  {#if p.id}{#key p.id}<section class="card">
        <h2>Try a solution</h2>
        <p class="muted">
          Runs against the saved version without recording a submission. Save
          your edits first.
        </p>
        <SubmissionEditor
          action={`/admin/problems/${p.id}/test`}
          storageKey={`admin_test_${p.id}`}
          pendingStorageKey={`admin_test_${p.id}_${data.user?.username ?? ""}`}
          button="Run"
        />
      </section>{/key}{/if}
</div>

<style>
  .test-cases {
    margin: 20px 0;
  }
  .case-controls {
    margin: 12px 0;
  }
  .case-controls select {
    width: auto;
  }
  .case-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
  .case-visibility {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .case-visibility input {
    width: auto;
  }
  @media (max-width: 700px) {
    .case-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
