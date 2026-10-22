<script lang="ts">
  import { onMount } from "svelte";
  import Editor from "./Editor.svelte";
  import SubmissionFeedback from "./SubmissionFeedback.svelte";
  import type { JudgeProgress, JudgeResult } from "#lib/types.js";
  let {
    action,
    storageKey,
    pendingStorageKey = storageKey,
    blocked = null,
    best = null,
    onaccepted,
    button = "Submit",
    publicCases = [],
  }: {
    action: string;
    storageKey?: string;
    pendingStorageKey?: string;
    blocked?: string | null;
    best?: number | null;
    onaccepted?: (bytes: number) => void;
    button?: string;
    publicCases?: { case: number; input: string; output: string }[];
  } = $props();
  type Pending = { id: string; events: string; code: string; action: string };
  let code = $state(""),
    submittedCode = $state<string | null>(null),
    busy = $state(false),
    result = $state<JudgeResult | null>(null),
    progress = $state<JudgeProgress | null>(null),
    message = $state("Ready"),
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
<SubmissionFeedback
  {result}
  {progress}
  {message}
  {reconnecting}
  {submittedCode}
  {publicCases}
/>
