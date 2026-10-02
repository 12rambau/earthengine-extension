/**
 * @module viewportAnchor
 * Client-side helper for Svelte actions that pin a floating element (popup,
 * menu) to its trigger in viewport space. Kept free of CSS imports so it can
 * be bundled into the WebView script build, unlike `webviewUtils.ts`.
 */

/**
 * Re-runs `place` on window resize and on any (capture-phase) scroll.
 */
export function trackViewportChanges(place: () => void): { destroy(): void } {
  place();
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  return {
    destroy() {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    },
  };
}
