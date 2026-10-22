<script lang="ts">
  import type { PageProps } from "./$types";
  import ProblemForm from "#lib/components/ProblemForm.svelte";
  let { data, form }: PageProps = $props();
</script>

<ProblemForm {data} {form} />
