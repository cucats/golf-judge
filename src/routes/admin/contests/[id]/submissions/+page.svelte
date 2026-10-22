<script lang="ts">
	import type { PageProps } from './$types';
	import Code from '#lib/components/Code.svelte';
	import Timestamp from '#lib/components/Timestamp.svelte';
	import Poll from '#lib/components/Poll.svelte';
	import { accepting, label } from '#lib/types.js';
	let { data }: PageProps = $props();
	let expanded = $state<Record<string, boolean>>({});
</script>

<svelte:head><title>Submissions - {data.contest.name}</title></svelte:head>
<Poll active={accepting(data.contest)} />
<div class="container">
	<a href={`/admin/contests/${data.contest.id}`}>← {data.contest.name}</a>
	<h1>{data.contest.name} — Submissions</h1>
	<form method="GET" class="btn-row card">
		<div class="field">
			<label for="username">Username</label><input
				type="text"
				id="username"
				name="username"
				value={data.filters.username ?? ''}
			/>
		</div>
		<div class="field">
			<label for="verdict">Verdict</label><select
				id="verdict"
				name="verdict"
				value={data.filters.verdict ?? ''}
				><option value="">All</option>{#each ['AC', 'WA', 'TLE', 'RE', 'SE'] as verdict}<option
						>{verdict}</option
					>{/each}</select
			>
		</div>
		<div class="field">
			<label for="problem">Problem</label><select
				id="problem"
				name="problem"
				value={data.filters.problem ?? ''}
				><option value="">All</option>{#each data.problems as p}<option value={p.id}
						>{label(p.problem_order)}. {p.title}</option
					>{/each}</select
			>
		</div>
		<button>Filter</button><a href={`/admin/contests/${data.contest.id}/submissions`}>Clear</a>
	</form>
	<div class="card table-scroll">
		<table class="table">
			<thead
				><tr
					><th>Time</th><th>Username</th><th>Problem</th><th>Verdict</th><th>Bytes</th><th
						>Time (ms)</th
					><th><span class="sr-only">Code</span></th></tr
				></thead
			><tbody
				>{#each data.submissions as s}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions (The Show code button provides keyboard access.) -->
					<tr class="click-row" onclick={() => (expanded[s.id] = !expanded[s.id])}
						><td class="muted"><Timestamp timestamp={s.created_at} /></td><td>{s.username}</td><td
							class="muted"
							>{s.problem_order === null ? '?' : label(s.problem_order)}. {s.problem_title}</td
						><td><span class={`badge ${s.verdict.toLowerCase()}`}>{s.verdict}</span></td><td
							>{s.code_length}</td
						><td>{s.time}</td><td
							><button
								type="button"
								class="code-toggle"
								aria-expanded={!!expanded[s.id]}
								aria-controls={`code-${s.id}`}
								onclick={(event) => {
									event.stopPropagation();
									expanded[s.id] = !expanded[s.id];
								}}>{expanded[s.id] ? 'Hide code' : 'Show code'}</button
							></td
						></tr
					><tr class="code-row" id={`code-${s.id}`} hidden={!expanded[s.id]}
						><td colspan="7"><pre><Code code={s.code} /></pre></td></tr
					>{/each}</tbody
			>
		</table>
	</div>
	<p class="muted">Showing {data.submissions.length} submissions</p>
</div>
