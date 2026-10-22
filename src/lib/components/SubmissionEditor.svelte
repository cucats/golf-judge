<script lang="ts">
  import { onMount } from "svelte";
  import Editor from "./Editor.svelte";
  import Code from "./Code.svelte";
  import type { JudgeProgress, JudgeResult } from "#lib/types.js";
  let {
    action,
    storageKey,
    pendingStorageKey = storageKey,
    blocked = null,
    best = null,
    onaccepted,
    button = "Submit",
  }: {
    action: string;
    storageKey?: string;
    pendingStorageKey?: string;
    blocked?: string | null;
    best?: number | null;
    onaccepted?: (bytes: number) => void;
    button?: string;
  } = $props();
  type Pending = { id: string; events: string; code: string; action: string };
  let code = $state(""),
    submittedCode = $state<string | null>(null),
    busy = $state(false),
    result = $state<JudgeResult | null>(null),
    progress = $state<JudgeProgress | null>(null),
    message = $state("Submit a solution to see its result."),
    reconnecting = $state(false);
  let form: HTMLFormElement;
  let stream: EventSource | null = null;
  let mounted = false;
  const pendingKey = $derived(
    pendingStorageKey ? `${pendingStorageKey}:pending-submission` : null,
  );
  const bytes = $derived(
    new TextEncoder().encode(code.replaceAll("\r\n", "\n")).length,
  );

  function remember(pending: Pending | null) {
    if (!pendingKey) return;
    try {
      if (pending) localStorage.setItem(pendingKey, JSON.stringify(pending));
      else localStorage.removeItem(pendingKey);
    } catch {
      // Grading still works when browser storage is unavailable.
    }
  }

  function connect(pending: Pending) {
    stream?.close();
    submittedCode = pending.code;
    busy = true;
    const connection = new EventSource(pending.events);
    stream = connection;
    connection.onopen = () => {
      reconnecting = false;
    };
    connection.onerror = () => {
      reconnecting = true;
    };
    connection.addEventListener("unavailable", (event) => {
      if (stream !== connection) return;
      const update: { error: string } = JSON.parse(
        (event as MessageEvent).data,
      );
      message = update.error;
      progress = null;
      busy = false;
      reconnecting = false;
      connection.close();
      stream = null;
      remember(null);
    });
    connection.addEventListener("progress", (event) => {
      if (stream !== connection) return;
      const update: JudgeProgress = JSON.parse((event as MessageEvent).data);
      progress = update;
      reconnecting = false;
      if (update.state === "finished" && update.result) {
        result = update.result;
        busy = false;
        connection.close();
        stream = null;
        remember(null);
        if (result.verdict === "AC") onaccepted?.(result.code_length);
      }
    });
  }

  onMount(() => {
    mounted = true;
    if (pendingKey) {
      try {
        const pending: Pending | null = JSON.parse(
          localStorage.getItem(pendingKey) ?? "null",
        );
        if (
          pending?.id &&
          pending.events &&
          typeof pending.code === "string" &&
          pending.action === action
        ) {
          progress = { state: "queued", passed: 0, completed: 0, total: 0 };
          connect(pending);
        }
      } catch {
        remember(null);
      }
    }
    return () => {
      mounted = false;
      stream?.close();
      stream = null;
    };
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (blocked || busy) return;
    busy = true;
    result = null;
    progress = null;
    reconnecting = false;
    submittedCode = code;
    message = "Submitting…";
    try {
      const response = await fetch(action, {
        method: "POST",
        body: new URLSearchParams({ code: submittedCode }),
      });
      if (response.redirected)
        throw new Error("Please sign in before submitting.");
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? `Submission failed (${response.status})`);
      if (!body.id || !body.events)
        throw new Error("The server did not acknowledge this submission.");
      const pending: Pending = {
        id: body.id,
        events: body.events,
        code: submittedCode,
        action,
      };
      remember(pending);
      if (mounted) {
        progress = { state: "queued", passed: 0, completed: 0, total: 0 };
        connect(pending);
      }
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
      busy = false;
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      form.requestSubmit();
    }
  }}
/>
<form bind:this={form} method="POST" {action} onsubmit={submit}>
  <Editor bind:value={code} name="code" height="500px" {storageKey} />
  <div class="btn-row editor-controls">
    <span class="muted"
      >{bytes} bytes{#if best !== null}
        · Best: {best} bytes{/if}</span
    >
    {#if blocked}<strong class="error">{blocked}</strong>{:else}<button
        disabled={busy}>{busy ? "Grading…" : button}</button
      >{/if}
  </div>
</form>
<section class="feedback" aria-label="Submission feedback">
  <div role="status" aria-live="polite">
    {#if result}
      <strong class={`verdict-${result.verdict.toLowerCase()}`}
        >{result.verdict}</strong
      >
      <span class="muted">
        · {result.code_length} bytes · {result.time} ms</span
      >
      {#if result.verdict === "TLE"}<p>Time limit exceeded.</p>{/if}
      {#if result.verdict === "AC" && result.improvement != null && result.improvement > 0}
        <span class="verdict-ac">
          · {result.improvement} bytes shorter than your previous best</span
        >
      {/if}
      {#if result.total != null && result.passed != null}
        <p>{result.passed} / {result.total} tests passed</p>
      {/if}
    {:else if progress}
      <strong>{progress.state === "queued" ? "Queued" : "Running"}</strong>
      {#if progress.total > 0}
        <span>
          · {progress.completed} / {progress.total} checked · {progress.passed} passed</span
        >
      {/if}
    {:else}{message}{/if}
    {#if reconnecting}<p class="muted">
        Connection interrupted. Reconnecting to your submission…
      </p>{/if}
  </div>
  {#if result}
    {#if result.failure}
      <p>
        <strong
          >{result.failure.public ? "Public" : "Private"} test {result.failure
            .case}</strong
        >{#if result.failure.line != null}
          · Your code, line {result.failure
            .line}{#if result.failure.column != null}, column {result.failure
              .column}{/if}{/if}
      </p>
      {#if result.failure.error}<pre>{result.failure.error}</pre>{/if}
      {#if result.failure.line != null && submittedCode !== null}
        {@const errorLine =
          submittedCode.split(/\r?\n/)[result.failure.line - 1]}
        {#if errorLine !== undefined}<pre><Code code={errorLine} /></pre>{/if}
      {/if}
      {#if result.failure.input !== undefined}<div class="case-value">
          <strong>Input</strong>
          <pre>{result.failure.input}</pre>
        </div>{/if}
      {#if result.failure.expected !== undefined}<div class="case-value">
          <strong>Expected</strong>
          <pre>{JSON.stringify(result.failure.expected)}</pre>
        </div>{/if}
      {#if result.failure.actual !== undefined}<div class="case-value">
          <strong>Actual</strong>
          <pre>{JSON.stringify(result.failure.actual)}</pre>
        </div>{/if}
    {/if}
    {#if result.output && !result.failure && !(result.total != null && result.passed != null)}<pre>{result.output}</pre>{/if}
  {/if}
</section>

<style>
  .feedback {
    background: #1e293b;
    border-radius: 8px;
    padding: 16px;
    overflow-wrap: anywhere;
  }
  .feedback p {
    margin: 8px 0;
  }
  .feedback pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 300px;
    overflow: auto;
    margin: 8px 0;
  }
  .case-value {
    margin: 12px 0;
  }
</style>
