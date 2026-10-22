<script lang="ts">
  let { cases }: { cases: { case: number; input: string; output: string }[] } =
    $props();
</script>

{#if cases.length}
  <section class="public-cases" aria-label="Public test cases">
    <h3>Public test cases · {cases.length}</h3>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus and scroll the table.) -->
    <div
      class="case-table"
      role="region"
      aria-label="Test case values"
      tabindex="0"
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Input</th>
            <th scope="col">Expected output</th>
          </tr>
        </thead>
        <tbody>
          {#each cases as test (test.case)}
            <tr>
              <th scope="row">{test.case}</th>
              <td><pre>{test.input}</pre></td>
              <td><pre>{test.output}</pre></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .public-cases {
    margin-top: 24px;
  }
  h3 {
    margin-bottom: 12px;
    font-size: 1.125rem;
  }
  .case-table {
    max-height: 32rem;
    overflow: auto;
    border: 1px solid #334155;
    border-radius: 6px;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
  }
  th,
  td {
    padding: 10px 12px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid #334155;
  }
  th:first-child {
    width: 4rem;
  }
  thead th {
    position: sticky;
    top: 0;
    background: #1e293b;
  }
  tbody tr:last-child > * {
    border-bottom: 0;
  }
  pre {
    min-height: 1.25em;
    max-height: 12rem;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: inherit;
    line-height: 1.5;
    tab-size: 4;
  }
  @media (max-width: 640px) {
    th,
    td {
      padding: 8px;
    }
    th:first-child {
      width: 3rem;
    }
  }
</style>
