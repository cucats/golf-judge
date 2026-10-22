<script lang="ts">
  let { items }: { items: { label: string; href?: string }[] } = $props();
</script>

<nav aria-label="Breadcrumb">
  <ol>
    {#each items as item, i}
      <li>
        {#if i > 0}<span class="separator" aria-hidden="true">/</span>{/if}
        {#if item.href && i < items.length - 1}
          <a href={item.href}>{item.label}</a>
        {:else}
          <span aria-current={i === items.length - 1 ? "page" : undefined}>
            {item.label}
          </span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  nav {
    margin-bottom: 16px;
    color: #94a3b8;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  ol {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    max-width: 100%;
    min-width: 0;
  }
  a,
  span {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .separator {
    flex-shrink: 0;
  }
</style>
