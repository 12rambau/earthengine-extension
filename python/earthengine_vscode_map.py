"""Earth Engine Map bridge for VS Code.

Usage in a Python script or notebook:

    import ee
    from earthengine_vscode_map import Map

    ee.Initialize(project="my-project")

    image = ee.Image("COPERNICUS/S2_SR/20200101T100319_20200101T100321_T32TQM")
    Map.addLayer(image, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}, "RGB")
    Map.centerObject(image, zoom=10)
"""

import json
import urllib.request
import ee

_PORT = 31415
_BASE_URL = f"http://127.0.0.1:{_PORT}"


def _post(endpoint: str, data: dict):
    """Send a POST request to the VS Code extension map server."""
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        f"{_BASE_URL}/{endpoint}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[Map] Could not connect to VS Code map server: {e}")
        print(f"[Map] Make sure the map panel is open in VS Code.")
        return None


def _get_default_vis_params(ee_object, vis_params=None):
    """Build visualization parameters with sensible defaults."""
    vis = dict(vis_params or {})

    if isinstance(ee_object, ee.FeatureCollection):
        return vis

    if isinstance(ee_object, ee.ImageCollection):
        ee_object = ee_object.mosaic()

    if isinstance(ee_object, ee.Image):
        # If no bands specified, try to pick reasonable defaults
        if "bands" not in vis:
            info = ee_object.bandNames().getInfo()
            if info and len(info) >= 3:
                vis["bands"] = info[:3]
            elif info:
                vis["bands"] = [info[0]]

        # Try to read visualization params from the image metadata
        if "min" not in vis and "max" not in vis:
            try:
                props = ee_object.getInfo().get("properties", {})
                if "visualization_0_min" in props:
                    vis["min"] = props["visualization_0_min"]
                    vis["max"] = props.get("visualization_0_max", vis["min"])
                if "visualization_0_bands" in props and "bands" not in (vis_params or {}):
                    vis["bands"] = props["visualization_0_bands"].split(",")
            except Exception:
                pass

    return vis


class _Map:
    """Singleton Map object that communicates with the VS Code extension."""

    def addLayer(self, ee_object, vis_params=None, name=None, shown=True, opacity=1.0):
        """Add an Earth Engine layer to the VS Code map.

        Args:
            ee_object: An ee.Image, ee.ImageCollection, ee.FeatureCollection, or ee.Geometry.
            vis_params: Visualization parameters dict (bands, min, max, palette, etc.).
            name: Layer name. Auto-generated if not provided.
            shown: Whether the layer is visible.
            opacity: Layer opacity (0 to 1).
        """
        vis = _get_default_vis_params(ee_object, vis_params)

        # Handle different EE types
        if isinstance(ee_object, ee.ImageCollection):
            ee_object = ee_object.mosaic()

        if isinstance(ee_object, (ee.Geometry, ee.Feature)):
            # Convert to FeatureCollection for display
            if isinstance(ee_object, ee.Geometry):
                ee_object = ee.FeatureCollection([ee.Feature(ee_object)])
            elif isinstance(ee_object, ee.Feature):
                ee_object = ee.FeatureCollection([ee_object])

        if isinstance(ee_object, ee.FeatureCollection):
            # Get GeoJSON for vector data
            try:
                geojson = ee_object.getInfo()
                _post("addGeoJson", {
                    "geojson": geojson,
                    "name": name or "Vector Layer",
                    "shown": shown,
                    "opacity": opacity,
                    "style": vis,
                })
                return
            except Exception as e:
                print(f"[Map] Error getting vector data: {e}")
                return

        if isinstance(ee_object, ee.Image):
            try:
                map_id_dict = ee_object.getMapId(vis)
                tile_url = map_id_dict["tile_fetcher"].url_format
                _post("addTileLayer", {
                    "url": tile_url,
                    "name": name or "Layer",
                    "shown": shown,
                    "opacity": opacity,
                })
            except Exception as e:
                print(f"[Map] Error creating tile layer: {e}")
                return

    def centerObject(self, ee_object, zoom=None):
        """Center the map on an Earth Engine object.

        Args:
            ee_object: An ee.Image, ee.ImageCollection, ee.FeatureCollection, ee.Feature, or ee.Geometry.
            zoom: Optional zoom level (1-24). Auto-computed if not provided.
        """
        try:
            # Get geometry for any EE type
            if isinstance(ee_object, ee.Image):
                geom = ee_object.geometry()
            elif isinstance(ee_object, ee.ImageCollection):
                geom = ee_object.geometry()
            elif isinstance(ee_object, ee.FeatureCollection):
                geom = ee_object.geometry()
            elif isinstance(ee_object, ee.Feature):
                geom = ee_object.geometry()
            elif isinstance(ee_object, ee.Geometry):
                geom = ee_object
            else:
                print(f"[Map] Unsupported object type: {type(ee_object)}")
                return

            bounds = geom.bounds().getInfo()
            coords = bounds["coordinates"][0]
            west = min(c[0] for c in coords)
            south = min(c[1] for c in coords)
            east = max(c[0] for c in coords)
            north = max(c[1] for c in coords)

            _post("centerObject", {
                "bounds": [south, west, north, east],
                "zoom": zoom,
            })
        except Exception as e:
            print(f"[Map] Error centering: {e}")

    def setCenter(self, lon, lat, zoom=None):
        """Set the map center to specific coordinates.

        Args:
            lon: Longitude.
            lat: Latitude.
            zoom: Optional zoom level.
        """
        _post("setCenter", {"lat": lat, "lon": lon, "zoom": zoom})

    def clear(self):
        """Remove all layers from the map."""
        _post("clear", {})


Map = _Map()
