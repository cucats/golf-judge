<script lang="ts">
  import type { PageProps } from "./$types";
  import Poll from "#lib/components/Poll.svelte";
  import Timer from "#lib/components/Timer.svelte";
  import { accepting, label } from "#lib/types.js";
  let { data }: PageProps = $props();
</script>

<svelte:head><title>Leaderboard - {data.contest.name}</title></svelte:head>
<Poll active={accepting(data.contest)} />
<div class="container">
  <div class="btn-row">
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
          >{#each data.board.problems as p}<th title={p.title}
              ><a href={`/contest/${data.contest.id}/problems/${p.id}`}
                >{label(p.problem_order)}</a
              ></th
            >{/each}</tr
        ></thead
      ><tbody
        >{#each data.board.entries as e}<tr
            ><td class="muted">{e.rank}</td><td
              >{#if data.inspect}<a
                  class="player-link"
                  href={`/contest/${data.contest.id}/submissions?user=${encodeURIComponent(e.username)}`}
                  >{e.username}</a
                >{:else}{e.username}{/if}</td
            ><td class="muted">{e.problems_solved}</td><td
              class="leaderboard-total">{e.total_bytes}</td
            >{#each e.problem_results as result, i}<td
                >{#if result}{@const score = `${result.medal === "diamond" ? "💎 " : result.medal === "gold" ? "🥇 " : ""}${result.code_length}`}{#if data.inspect}<a
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
