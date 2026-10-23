<script lang="ts">
  import Breadcrumbs from "#lib/components/Breadcrumbs.svelte";
  import InlineItems from "#lib/components/InlineItems.svelte";
  import type { PageProps } from "./$types";
  import { untrack } from "svelte";
  import { accepting, label } from "#lib/types.js";
  import Markdown from "#lib/components/Markdown.svelte";
  import Timer from "#lib/components/Timer.svelte";
  import SubmissionEditor from "#lib/components/SubmissionEditor.svelte";
  let { data }: PageProps = $props();
  let best = $state<number | null>(untrack(() => data.bestBytes));
  $effect(() => {
    best = data.bestBytes;
  });
  const blocked = $derived(
    data.contest.status === "pending"
      ? "Contest has not started"
      : !accepting(data.contest)
        ? "Contest has ended"
        : !data.user
          ? "Log in to submit"
          : null,
  );
</script>

<svelte:head
  ><title
    >{label(data.problem.problem_order)}. {data.problem.title} - {data.contest
      .name}</title
  ></svelte:head
>
<div class="container">
  <Breadcrumbs
    items={[
      { label: "Home", href: "/" },
      { label: data.contest.name },
      { label: "Problems", href: `/contest/${data.contest.id}/problems` },
      { label: `${label(data.problem.problem_order)}. ${data.problem.title}` },
    ]}
  />
  <div class="btn-row page-links">
    <a href={`/contest/${data.contest.id}/leaderboard`}>Leaderboard</a><Timer
      contest={data.contest}
    />
  </div>
</div>
<div class="problem-layout">
  <section class="card">
    <h2>{label(data.problem.problem_order)}. {data.problem.title}</h2>
    <p class="muted">
      <InlineItems wrap>
        <span>{data.problem.test_count} cases</span>
        <InlineItems>
          <span aria-hidden="true">·</span>
          <span>Time limit {data.problem.time_limit_ms} ms total</span>
        </InlineItems>
        <InlineItems>
          <span aria-hidden="true">·</span>
          <span>Memory {data.problem.memory_limit_kb / 1024} MB</span>
        </InlineItems>
        {#if best !== null}<InlineItems
            ><span aria-hidden="true">·</span><span>Best: {best} bytes</span
            ></InlineItems
          >{/if}
      </InlineItems>
    </p>
    <Markdown html={data.html} />
  </section>
  <section>
    {#key `${data.contest.id}_${data.problem.id}_${data.user?.username ?? ""}`}<SubmissionEditor
        action={`/contest/${data.contest.id}/problems/${data.problem.id}/submit`}
        storageKey={`code_${data.contest.id}_${data.problem.id}_${data.user?.username ?? ""}`}
        {blocked}
        {best}
        publicCases={data.publicCases}
        onaccepted={(bytes) => {
          best = best === null ? bytes : Math.min(best, bytes);
        }}
      />{/key}
  </section>
</div>
