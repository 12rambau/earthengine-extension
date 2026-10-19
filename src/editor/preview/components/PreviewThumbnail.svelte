<!-- PreviewThumbnail: loading, image, and unavailable states for asset thumbnails -->
<script>
  let { loading, url, error = 'Thumbnail not available.', onerror } = $props();
</script>

<div class="thumbnail-container">
  {#if loading}
    <span class="thumb-loading"><span class="spinner"></span> Loading thumbnail...</span>
  {:else if url}
    <img src={url} alt="Thumbnail" onerror={onerror} />
  {:else}
    <span class="thumb-unavailable">{error}</span>
  {/if}
</div>

<style>
  .thumbnail-container {
    width: 100%;
    aspect-ratio: 1;
    background: var(--vscee-color-list-hover);
    border-radius: var(--vscee-radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--vscee-space-xl);
    overflow: hidden;

    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  }
  .thumb-loading,
  .thumb-unavailable {
    font-size: var(--vscee-font-sm);
    opacity: 0.6;
    text-align: center;
    padding: var(--vscee-space-lg);
  }
</style>