"""Earth Engine map bridge for VS Code.

There is only one map panel in the VS Code extension, so this module IS
the map — no instantiation, no class. The capitalised name mirrors the
`Map` global used in the Earth Engine Code Editor.

Usage:

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
        print("[Map] Make sure the Earth Engine extension is active in VS Code.")
        return None


def addLayer(ee_object, vis_params=None, name=None, shown=True, opacity=1.0):
    """Add an Earth Engine layer to the VS Code map.

    The object is serialized and sent to the VS Code extension, which
    resolves the tile URL via the EE JS client. No EE API calls are made
    on the Python side.

    Args:
        ee_object: An ee.Image, ee.ImageCollection, ee.FeatureCollection,
                   ee.Feature, or ee.Geometry.
        vis_params: Visualization parameters dict (bands, min, max, palette,
                    color, strokeWidth, etc.).
        name: Layer name. Auto-generated if not provided.
        shown: Whether the layer is visible.
        opacity: Layer opacity (0 to 1).
    """
    vis_params = dict(vis_params or {})

    # Normalise to a single ee.Image (expression only — no API calls) ------

    if isinstance(ee_object, ee.ImageCollection):
        ee_object = ee_object.mosaic()

    if isinstance(ee_object, ee.Geometry):
        ee_object = ee.FeatureCollection([ee.Feature(ee_object)])
    elif isinstance(ee_object, ee.Feature):
        ee_object = ee.FeatureCollection([ee_object])

    if isinstance(ee_object, ee.FeatureCollection):
        stroke_width = vis_params.pop("strokeWidth", 2)
        color = vis_params.pop("color", "000000")
        ee_object = ee.Image().paint(ee_object, 1, stroke_width)
        vis_params = {"min": 0, "max": 1, "palette": [color]}

    if not isinstance(ee_object, ee.Image):
        print(f"[Map] Unsupported object type: {type(ee_object)}")
        return

    _post(
        "addLayer",
        {
            "serialized": ee_object.serialize(),
            "visParams": vis_params,
            "name": name or "Layer",
            "shown": shown,
            "opacity": opacity,
        },
    )


def centerObject(ee_object, zoom=None):
    """Center the map on an Earth Engine object.

    Args:
        ee_object: An ee.Image, ee.ImageCollection, ee.FeatureCollection,
                   ee.Feature, or ee.Geometry.
        zoom: Optional zoom level (1-24). Auto-computed if not provided.
    """
    try:
        if isinstance(ee_object, ee.Geometry):
            geom = ee_object
        elif isinstance(
            ee_object,
            (ee.Image, ee.ImageCollection, ee.FeatureCollection, ee.Feature),
        ):
            geom = ee_object.geometry()
        else:
            print(f"[Map] Unsupported object type: {type(ee_object)}")
            return

        bounds = geom.bounds().getInfo()
        coords = bounds["coordinates"][0]
        west = min(c[0] for c in coords)
        south = min(c[1] for c in coords)
        east = max(c[0] for c in coords)
        north = max(c[1] for c in coords)

        _post(
            "centerObject",
            {
                "bounds": [south, west, north, east],
                "zoom": zoom,
            },
        )
    except Exception as e:
        print(f"[Map] Error centering: {e}")


def setCenter(lon, lat, zoom=None):
    """Set the map center to specific coordinates.

    Args:
        lon: Longitude.
        lat: Latitude.
        zoom: Optional zoom level.
    """
    _post("setCenter", {"lat": lat, "lon": lon, "zoom": zoom})


def clear():
    """Remove all layers from the map."""
    _post("clear", {})


__all__ = ["addLayer", "centerObject", "clear", "setCenter"]
