<script lang="ts">
  import Code from "./Code.svelte";
  import type {
    JudgeProgress,
    JudgeResult,
    TestCaseResult,
  } from "#lib/types.js";
  let {
    result,
    progress,
    message,
    reconnecting,
    submittedCode,
    publicCases,
  }: {
    result: JudgeResult | null;
    progress: JudgeProgress | null;
    message: string;
    reconnecting: boolean;
    submittedCode: string | null;
    publicCases: { case: number; input: string; output: string }[];
  } = $props();
  const cases: TestCaseResult[] = $derived(
    result?.cases ??
      publicCases.map((test) => ({
        case: test.case,
        public: true,
        verdict: "NOT_RUN",
        input: test.input,
        expected: test.output,
      })),
  );
  const firstFailure = $derived(
    result?.cases?.find((test) => test.case === result?.failure?.case),
  );
  const labels: Record<string, string> = {
    AC: "Passed",
    WA: "Wrong answer",
    RE: "Runtime error",
    TLE: "Time limit exceeded",
    SE: "System error",
    NOT_RUN: "Not run",
  };
</script>

{#snippet values(test: TestCaseResult)}
  {#if test.error}<p class="case-error">{test.error}</p>{/if}
  {#if test.line != null}
    <p class="source-location">
      Line {test.line}{#if test.column != null}, column {test.column}{/if}
    </p>
    {#if submittedCode !== null}
      {@const errorLine = submittedCode.split(/\r?\n/)[test.line - 1]}
      {#if errorLine !== undefined}<pre class="error-source"><Code
            code={errorLine}
          /></pre>{/if}
    {/if}
  {/if}
  {#if test.input !== undefined || test.expected !== undefined || test.actual !== undefined}
    <dl class="case-values">
      {#if test.input !== undefined}<div>
          <dt>Input</dt>
          <dd><pre>{test.input}</pre></dd>
        </div>{/if}
      {#if test.expected !== undefined}<div>
          <dt>Expected output</dt>
          <dd><pre>{test.expected}</pre></dd>
        </div>{/if}
      {#if test.actual !== undefined}<div>
          <dt>Actual output</dt>
          <dd><pre>{test.actual}</pre></dd>
        </div>{/if}
    </dl>
  {/if}
{/snippet}

<section class="feedback" aria-label="Submission feedback">
  <div class="run-summary" role="status" aria-live="polite">
    <div class="run-status">
      {#if result}
        <span class={`badge ${result.verdict.toLowerCase()}`}
          >{result.verdict}</span
        >
        <strong
          >{result.verdict === "AC"
            ? "Accepted"
            : (labels[result.verdict] ?? result.verdict)}</strong
        >
      {:else if progress}
        <strong>{progress.state === "queued" ? "Queued" : "Running"}</strong>
      {:else}<strong>{message}</strong>{/if}
      {#if reconnecting}<span class="muted">Reconnecting…</span>{/if}
    </div>
    {#if result}
      <dl class="run-metrics">
        {#if result.total != null && result.passed != null}<div>
            <dt>Tests passed</dt>
            <dd>{result.passed}<span class="muted"> / {result.total}</span></dd>
          </div>{/if}
        <div>
          <dt>Time</dt>
          <dd>{result.time}<span class="muted"> ms</span></dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{result.code_length}<span class="muted"> bytes</span></dd>
        </div>
      </dl>
      {#if result.verdict === "AC" && result.improvement != null && result.improvement > 0}
        <p class="improvement verdict-ac">
          {result.improvement} bytes shorter than your previous best
        </p>
      {/if}
      {#if result.output && result.total == null}<p class="run-message">
          {result.output}
        </p>{/if}
    {:else if progress && progress.total > 0}
      <dl class="run-metrics">
        <div>
          <dt>Checked</dt>
          <dd>
            {progress.completed}<span class="muted"> / {progress.total}</span>
          </dd>
        </div>
        <div>
          <dt>Passed</dt>
          <dd>{progress.passed}</dd>
        </div>
      </dl>
      <progress
        value={progress.completed}
        max={progress.total}
        aria-label="Tests checked"
      ></progress>
    {/if}
  </div>
  {#if firstFailure}
    <section
      class="first-failure"
      aria-label={`Failed case ${firstFailure.case}`}
    >
      <h3>
        Case {firstFailure.case}{#if !firstFailure.public}<span class="muted">
            · Private</span
          >{/if}
      </h3>
      {@render values(firstFailure)}
    </section>
  {/if}
  {#if cases.length}
    <details class="case-results">
      <summary>Test cases <span class="muted">({cases.length})</span></summary>
      <div class="case-list">
        {#each cases as test (test.case)}
          <details class="case-result">
            <summary>
              <span class="case-number">Case {test.case}</span>
              <span class={`case-verdict verdict-${test.verdict.toLowerCase()}`}
                >{labels[test.verdict] ?? test.verdict}</span
              >
              {#if !test.public}<span class="case-private muted">Private</span
                >{/if}
            </summary>
            <div class="case-details">{@render values(test)}</div>
          </details>
        {/each}
      </div>
    </details>
  {/if}
</section>

<style>
  .feedback {
    border: 1px solid #334155;
    border-radius: 8px;
    overflow: hidden;
    overflow-wrap: anywhere;
    font-family: system-ui, sans-serif;
  }
  .run-summary {
    padding: 16px;
    background: #1e293b;
  }
  .run-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .run-status strong {
    font-size: 1.125rem;
  }
  .run-metrics {
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
    margin-top: 16px;
  }
  dt {
    color: #94a3b8;
    font-size: 0.8125rem;
    font-weight: 500;
    margin-bottom: 6px;
  }
  .run-metrics dd {
    font-size: 1.125rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .run-metrics dd span {
    font-size: 0.875rem;
    font-weight: 400;
  }
  progress {
    display: block;
    width: 100%;
    height: 6px;
    margin-top: 16px;
    accent-color: #60a5fa;
  }
  .improvement,
  .run-message {
    margin-top: 12px;
  }
  .first-failure {
    padding: 16px;
    border-top: 1px solid #334155;
  }
  h3 {
    font-size: 0.9375rem;
    margin-bottom: 12px;
  }
  h3 span {
    font-weight: 400;
  }
  .case-error {
    color: #f97316;
    margin-bottom: 8px;
    white-space: pre-wrap;
  }
  .source-location {
    color: #94a3b8;
    font-size: 0.8125rem;
    margin-bottom: 6px;
  }
  .case-values {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
    gap: 12px;
  }
  .case-values > div {
    min-width: 0;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overflow: auto;
    max-height: 200px;
    min-height: 3rem;
    padding: 10px 12px;
    border: 1px solid #334155;
    border-radius: 6px;
    background: #0f172a;
    font:
      0.875rem/1.5 "Ubuntu Mono",
      monospace;
    tab-size: 4;
  }
  .error-source {
    margin-bottom: 12px;
    min-height: 0;
  }
  summary {
    cursor: pointer;
  }
  .case-results > summary {
    padding: 14px 16px;
    border-top: 1px solid #334155;
    font-weight: 600;
    font-size: 0.875rem;
  }
  .case-results > summary span {
    margin-left: 4px;
    font-weight: 400;
  }
  .case-list {
    max-height: 32rem;
    overflow: auto;
  }
  .case-result {
    border-top: 1px solid #334155;
  }
  .case-result > summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    font-size: 0.875rem;
  }
  .case-result > summary::before {
    content: "▸";
    color: #94a3b8;
  }
  .case-result[open] > summary::before {
    content: "▾";
  }
  .case-number {
    min-width: 4rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .case-private {
    margin-left: auto;
    font-size: 0.75rem;
  }
  .case-verdict {
    font-weight: 600;
  }
  .case-details {
    padding: 0 16px 16px;
  }
  @media (max-width: 480px) {
    .run-metrics {
      gap: 20px;
    }
    .case-result > summary {
      gap: 8px;
    }
    .case-number {
      min-width: 3.5rem;
    }
    .case-values {
      grid-template-columns: 1fr;
    }
  }
</style>
