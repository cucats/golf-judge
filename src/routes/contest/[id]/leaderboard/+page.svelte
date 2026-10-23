<script lang="ts">
  import Breadcrumbs from "#lib/components/Breadcrumbs.svelte";
  import type { PageProps } from "./$types";
  import Poll from "#lib/components/Poll.svelte";
  import Timer from "#lib/components/Timer.svelte";
  import { accepting, label } from "#lib/types.js";
  let { data }: PageProps = $props();
</script>

<svelte:head><title>Leaderboard - {data.contest.name}</title></svelte:head>
<Poll active={accepting(data.contest)} />
<div class="container">
  <Breadcrumbs
    items={[
      { label: "Home", href: "/" },
      { label: data.contest.name },
      { label: "Leaderboard" },
    ]}
  />
  <div class="btn-row page-links">
    <a href={`/contest/${data.contest.id}/problems`}>Problems</a><Timer
      contest={data.contest}
    />
  </div>
  <h1>{data.contest.name} — Leaderboard</h1>
  <div class="card table-scroll">
    <table class="table leaderboard">
      <thead
        ><tr
          ><th>Rank</th><th>Player</th><th>Solved</th><th>Bytes</th
          >{#each data.board.problems as p}<th class="problem-heading"
              ><a href={`/contest/${data.contest.id}/problems/${p.id}`}
                ><span>{label(p.problem_order)}</span><span
                  class="problem-heading-title">{p.title}</span
                ></a
              ></th
            >{/each}</tr
        ></thead
      ><tbody
        >{#each data.board.entries as e}{@const inspect =
            data.inspect || e.username === data.user?.username}<tr
            ><td class="muted">{e.rank}</td><td
              >{#if inspect}<a
                  class="player-link"
                  href={`/contest/${data.contest.id}/submissions?user=${encodeURIComponent(e.username)}`}
                  >{e.username}</a
                >{:else}{e.username}{/if}</td
            ><td class="muted">{e.problems_solved}</td><td
              class="leaderboard-total">{e.total_bytes}</td
            >{#each e.problem_results as result, i}<td
                >{#if result}{@const score = `${result.medal === "diamond" ? "💎 " : result.medal === "gold" ? "🥇 " : ""}${result.code_length}`}{#if inspect}<a
                      class="score-link"
                      href={`/contest/${data.contest.id}/submissions?user=${encodeURIComponent(e.username)}&problem=${data.board.problems[i].id}`}
                      ><span class={`score-${result.medal}`}>{score}</span></a
                    >{:else}<span class={`score-${result.medal}`}>{score}</span
                    >{/if}{:else}<span class="score-missing">—</span>{/if}</td
              >{/each}</tr
          >{:else}<tr
            ><td colspan={4 + data.board.problems.length}
              >No participants yet.</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
</div>

<style>
  .problem-heading {
    text-align: center;
  }
  .problem-heading a {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .problem-heading-title {
    max-width: 16ch;
    font-size: 0.75rem;
    line-height: 1.25;
    white-space: normal;
    overflow-wrap: anywhere;
  }
</style>
