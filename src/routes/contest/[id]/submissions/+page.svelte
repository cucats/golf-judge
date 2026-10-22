<script lang="ts">
	import type { PageProps } from './$types';
	import Code from '#lib/components/Code.svelte';
	import { label, elapsed } from '#lib/types.js';
	import type { Submission } from '#lib/types.js';
	let { data }: PageProps = $props();
	let shown = $state<Record<number, string>>({}),
		expanded = $state<Record<string, boolean>>({}),
		copied = $state<number | null>(null);
	const userQuery = $derived(encodeURIComponent(data.entry.username));
	const solutions = $derived(
		data.problems.map((p, i) => {
			const attempts = data.submissions.filter((s) => s.problem_id === p.id);
			const records: Submission[] = [];
			for (const s of attempts)
				if (
					s.verdict === 'AC' &&
					(!records.length || s.code_length < records[records.length - 1].code_length)
				)
					records.push(s);
			return {
				...p,
				records,
				attempts: attempts.filter((s) => s.verdict !== 'SE').length,
				result: data.entry.problem_results[i]
			};
		})
	);
	const selected = $derived(solutions.find((p) => p.id === data.selected));
	const visible = $derived(solutions.filter((p) => !selected || p.id === selected.id));
	const attempts = $derived(
		[...data.submissions].reverse().filter((s) => !selected || s.problem_id === selected.id)
	);
	async function copy(pid: number, code: string) {
		await navigator.clipboard.writeText(code);
		copied = pid;
		setTimeout(() => {
			copied = null;
		}, 1200);
	}
</script>

<svelte:head><title>{data.entry.username} - {data.contest.name}</title></svelte:head>
<div class="container">
	<a href={`/contest/${data.contest.id}/leaderboard`}>← {data.contest.name} standings</a>
	<div class="player-head">
		<h1 class="player-name">{data.entry.username}</h1>
		<div class="stat-row">
			<div class="stat">
				<span class="stat-value">#{data.entry.rank}</span><span class="stat-label"
					>of {data.playerCount}</span
				>
			</div>
			<div class="stat">
				<span class="stat-value">{data.entry.problems_solved}/{data.problems.length}</span><span
					class="stat-label">solved</span
				>
			</div>
			<div class="stat">
				<span class="stat-value bytes">{data.entry.total_bytes}</span><span class="stat-label"
					>total bytes</span
				>
			</div>
		</div>
	</div>
	<div class="problem-grid">
		{#each solutions as p}<a
				class={`problem-card medal-${p.result?.medal ?? 'none'}`}
				class:selected={p.id === selected?.id}
				class:unsolved={!p.result}
				href={`/contest/${data.contest.id}/submissions?user=${userQuery}${p.id === selected?.id ? '' : `&problem=${p.id}`}`}
				><span class="pc-label">{label(p.problem_order)}</span><span class="pc-title"
					>{p.title}</span
				><span class="pc-score"
					>{p.result?.medal === 'diamond'
						? '💎 '
						: p.result?.medal === 'gold'
							? '🥇 '
							: ''}{p.result ? `${p.result.code_length} bytes` : 'unsolved'}</span
				><span class="pc-attempts muted">{p.attempts} attempt{p.attempts === 1 ? '' : 's'}</span></a
			>{/each}
	</div>
	{#if selected}<div class="filter-bar">
			Showing <strong>{label(selected.problem_order)}. {selected.title}</strong><a
				href={`/contest/${data.contest.id}/submissions?user=${userQuery}`}>Show all problems</a
			>
		</div>{/if}
	<h3 class="section-title">{selected ? 'Best solution' : 'Best solutions'}</h3>
	{#each visible.filter((p) => p.records.length) as p}
		{@const best = p.records[p.records.length - 1]}{@const record =
			p.records.find((r) => r.id === shown[p.id]) ?? best}
		<div class={`card solution medal-${p.result?.medal ?? 'none'}`}>
			<div class="solution-head">
				<a class="solution-title" href={`/contest/${data.contest.id}/problems/${p.id}`}
					>{label(p.problem_order)}. {p.title}</a
				><strong>{record.code_length} bytes</strong>
			</div>
			<pre class="code-block"><Code code={record.code} /></pre>
			<div class="solution-foot">
				<div class="records">
					{#if p.records.length > 1}<span class="muted">Personal bests:</span
						>{#each p.records as r}<button
								class="chip"
								class:active={r.id === record.id}
								title={`Accepted at +${elapsed(data.contest, r.created_at)}`}
								onclick={() => (shown[p.id] = r.id)}>{r.code_length}</button
							>{/each}{:else}<span class="muted"
							>Accepted at +{elapsed(data.contest, best.created_at)}</span
						>{/if}
				</div>
				<button class="secondary" onclick={() => copy(p.id, record.code)}
					>{copied === p.id ? 'Copied' : 'Copy'}</button
				>
			</div>
		</div>
	{:else}<div class="card muted">
			No accepted solutions{selected ? ' for this problem' : ''}.
		</div>{/each}
	<h3 class="section-title">Submissions ({attempts.length})</h3>
	<div class="table-scroll">
		<table class="table">
			<thead
				><tr><th>Time</th><th>Problem</th><th>Verdict</th><th>Bytes</th><th>Run time</th></tr
				></thead
			><tbody
				>{#each attempts as s}{@const p = data.problems.find((p) => p.id === s.problem_id)}<tr
						><td title={`+${elapsed(data.contest, s.created_at)}`}
							><button
								class="link-btn"
								aria-expanded={!!expanded[s.id]}
								onclick={() => (expanded[s.id] = !expanded[s.id])}
								>{new Date(s.created_at * 1000).toISOString()}</button
							></td
						><td>{p ? `${label(p.problem_order)}. ${p.title}` : '?'}</td><td
							><span class={`badge ${s.verdict.toLowerCase()}`}>{s.verdict}</span
							>{#if solutions.some((p) => p.records.at(-1)?.id === s.id)}
								<span class="badge best">best</span>{/if}</td
						><td>{s.code_length}</td><td>{s.time} ms</td></tr
					>{#if expanded[s.id]}<tr class="code-row"
							><td colspan="5"><pre><Code code={s.code} /></pre></td></tr
						>{/if}{:else}<tr><td colspan="5">No submissions.</td></tr>{/each}</tbody
			>
		</table>
	</div>
</div>
