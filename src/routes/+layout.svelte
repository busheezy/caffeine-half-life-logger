<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div
  class="min-h-screen min-w-80 bg-[#0c100f] font-sans text-[#edf3ee] [color-scheme:dark] [font-synthesis:none]"
>
  {@render children()}
</div>
