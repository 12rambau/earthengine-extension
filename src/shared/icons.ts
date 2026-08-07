// Re-exports only the MDI icons used across WebView panels.
// Import from here (not directly from @mdi/js) so esbuild tree-shakes the rest.
export {
  mdiClose,
  mdiCrosshairsGps,
  mdiEye,
  mdiEyeOff,
  mdiImage,
  mdiImageMultiple,
  mdiLayers,
  mdiLoading,
  mdiMap,
  mdiRuler,
  mdiSatelliteVariant,
  mdiTableMultiple,
  mdiTrashCan,
  mdiTune,
} from '@mdi/js';
