<!-- MapPane: one Leaflet map with resize and teardown tied to its split leaf -->
<script>
  import L from 'leaflet';

  let { id, center = [0, 0], zoom = 2, oncreate, onremove, onactive } = $props();

  function mount(node) {
    const map = L.map(node, { center, zoom, zoomControl: false });
    map.attributionControl.setPrefix('');
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(node);
    oncreate(id, map);
    return {
      destroy() {
        resizeObserver.disconnect();
        onremove(id, map);
        map.remove();
      },
    };
  }
</script>

<div class="map-pane" onpointerdown={() => onactive(id)} role="presentation">
  <div class="leaflet-surface" use:mount></div>
</div>

<style>
  .map-pane,
  .leaflet-surface {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .map-pane {
    position: relative;
  }
</style>
