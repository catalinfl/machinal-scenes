<script lang="ts">
  import { onMount } from 'svelte';
  import { useLocalExport } from './useLocalExport.svelte';

  const exporter = useLocalExport();
  const status = $derived(exporter.connection.phase === 'connected' ? exporter.connection.status : null);
  const tools = $derived(status ? [
    { label: 'Native renderer', tool: status.tools.renderer },
    { label: 'Chrome Headless Shell', tool: status.tools.browser },
    { label: 'FFmpeg', tool: status.tools.ffmpeg },
  ] : []);

  onMount(() => {
    void exporter.refresh();
    return exporter.dispose;
  });
</script>

<div class="panel-heading"><h2>Export video</h2><span class="measurement">MP4 · local</span></div>
<div class="export-body">
  <section class="export-step" aria-labelledby="tools-title">
    <h3 id="tools-title">1. Prepare this computer</h3>
    <p>The renderer is included. Chrome and FFmpeg are needed to capture frames and encode your video.</p>
    <ul class="tool-list" aria-label="Rendering tools">
      {#each tools as { label, tool }}
        <li><span>{label}</span><span class:ready={tool.available} class="tool-state">{tool.available ? 'Ready' : 'Not ready'}</span></li>
      {/each}
    </ul>
    {#if status?.tools.ready}
      <p>All tools are ready. No download needed.</p>
    {:else}
      <p>One-time download from Chrome for Testing and the FFmpeg release archive. Tools are saved in your user cache, not installed system-wide.</p>
      <button class="primary" disabled={exporter.busy || !status} onclick={() => exporter.refresh('setup')}>
        {status?.job.phase === 'installing' ? 'Downloading tools…' : 'Download rendering tools'}
      </button>
    {/if}
  </section>
  <section class="export-step" aria-labelledby="render-title">
    <h3 id="render-title">2. Render your scene</h3>
    <p>Builds your current source and saves the video on this computer. Nothing is uploaded to S3 or Machinal.</p>
    <button class="primary" disabled={exporter.busy || !status?.tools.ready} onclick={() => exporter.refresh('render')}>
      {status?.job.phase === 'building' ? 'Building scene…' : status?.job.phase === 'rendering' ? 'Rendering MP4…' : status?.job.phase === 'done' ? 'Render another MP4' : 'Render MP4'}
    </button>
    {#if status && !status.tools.ready}<p>Download the tools above to enable rendering.</p>{/if}
    {#if status?.job.phase === 'done'}
      <div class="render-result">
        <a class="download" href={status.job.download} download={status.job.filename}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>
          Download MP4
        </a>
        <p>Saved on this computer: <code>{status.job.localFile}</code></p>
        <p>The local <code>renders/</code> folder is created inside this starter, next to <code>package.json</code>. Each render gets a new filename and manifest.</p>
      </div>
    {/if}
  </section>
  <div class="operation-status">
    <div role="status" aria-live="polite">
      {#if exporter.connection.phase === 'checking'}
        <p>Checking local rendering tools…</p>
      {:else if status?.job.phase === 'installing' || status?.job.phase === 'building' || status?.job.phase === 'rendering'}
        <p>{status.job.message}</p>
      {:else if status?.job.phase === 'done'}
        <p>Your video is ready to download.</p>
      {/if}
    </div>
    {#if exporter.connection.phase === 'error'}
      <p class="export-error" role="alert">{exporter.connection.message}</p>
      <button disabled={exporter.busy} onclick={() => exporter.refresh()}>Retry connection</button>
    {:else if status?.job.phase === 'error'}
      <p class="export-error" role="alert">{status.job.message}</p>
      <p>Check the message above, then retry the download or render. Terminal alternative: <code>npm run doctor</code>.</p>
    {/if}
  </div>
</div>
