<!-- MapMenu: map control button paired with a closable panel -->
<script>
  import MapButton from './MapButton.svelte';

  let { title, visible = $bindable(false), onopen, onclose, icon, panel } = $props();

  function toggle() {
    visible = !visible;
    if (visible) {
      onopen?.();
    } else {
      onclose?.();
    }
  }
</script>

<MapButton active={visible} aria-expanded={visible} {title} onclick={toggle}>
  {@render icon()}
</MapButton>
{@render panel()}