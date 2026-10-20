"""Earth Engine map bridge for VS Code.

There is only one map panel in the VS Code extension, so this module IS
the map — no instantiation, no class. The capitalised name mirrors the
`Map` global used in the Earth Engine Code Editor.

Usage:

    import ee
    from vscee import Map

    ee.Initialize(project="my-project")

    image = ee.Image("COPERNICUS/S2_SR_HARMONIZED/20200101T100319_20200101T100321_T32TQM")
    Map.addLayer(image, {
        "bands": ["B4", "B3", "B2"],
        "min": 0,
        "max": 3000,
        "gamma": 1.2,
    }, "Sentinel-2 RGB")
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
        vis_params: Visualization parameters dict.
            Image:
                RGB: Provide three bands in red, green, blue order. Scalar
                    min/max values apply to all three; three-value sequences
                    set per-band ranges. Optional gamma adjusts midtones.
                HSV: Set vizType to "hsv" with three
                    hue/saturation/value bands and per-band min/max. The bands
                    are normalized to 0–1, then converted to RGB.
                Continuous: Provide one band, min, max, and a palette of at
                    least two colors. A palette without values or breaks is
                    interpreted as continuous.
                Categorical: Provide one band, distinct numeric values, and
                    one palette color per value. Optional labels name classes;
                    pixels with unlisted values are masked.
                Intervals: Provide one band, strictly increasing breaks, and
                    one palette color per interval. There must be one more
                    break than colors; upper bounds are excluded.
                Other ee.Image.visualize parameters include gain, bias, and
                    forceRgbOutput.
            FeatureCollection:
                Uniform: Use color, fillColor, width, and pointSize.
                Continuous: Select one numeric property and provide min, max,
                    and a palette of at least two colors.
                Categorical: Provide one property, distinct numeric or string
                    values, and one palette color per value. Optional labels
                    name classes; other values are not drawn.
                Intervals: Select one numeric property and provide increasing
                    breaks and one palette color per interval.
                Palette colors must be six-digit hex RGB, with or without #.
            Direct parameters style the layer; use default to select a stored
            visualization preset by name or index instead. Stored presets are
            string properties added to an image or collection with set(),
            using visualization_<number>_<keyword> keys.
        name: Layer name. Auto-generated if not provided.
        shown: Whether the layer is visible.
        opacity: Layer opacity (0 to 1).

        Examples:
        Image > RGB:
            Map.addLayer(image, {
                "bands": ["B4", "B3", "B2"], "min": 0, "max": 3000,
                "gamma": 1.2}, "Sentinel-2 RGB")
        Image > HSV:
            Map.addLayer(image, {"vizType": "hsv",
                "bands": ["hsv_hue", "hsv_saturation", "hsv_value"],
                "min": [0, 0, 0], "max": [1, 1, 1]}, "HSV")
        Image > Continuous:
            Map.addLayer(image, {"bands": ["B8"], "min": 0, "max": 3000,
                "palette": ["#2b83ba", "#abdda4", "#d7191c"]}, "Near Infrared")
        Image > Categorical:
            Map.addLayer(image, {"bands": ["classification"],
                "values": [0, 1, 2],
                "palette": ["#2b83ba", "#abdda4", "#d7191c"],
                "labels": ["Other", "Crop", "Water"]}, "Crop Classification")
        Image > Intervals:
            Map.addLayer(image, {"bands": ["temperature"],
                "breaks": [-10, 0, 10, 20],
                "palette": ["#2b83ba", "#abdda4", "#d7191c"],
                "labels": ["Below freezing", "Cool", "Warm"]}, "Temperature intervals")
        FeatureCollection > Uniform:
            Map.addLayer(features, {"color": "#336699",
                "fillColor": "#66aadd", "width": 2, "pointSize": 4},
                "Features")
        FeatureCollection > Continuous:
            Map.addLayer(features, {"property": "population",
                "vizType": "continuous", "min": 0, "max": 1000,
                "palette": ["#ffffcc", "#800026"]}, "Population")
        FeatureCollection > Categorical:
            Map.addLayer(features, {"property": "classification",
                "vizType": "categorical", "values": [0, 1, 2],
                "palette": ["#2b83ba", "#abdda4", "#d7191c"],
                "labels": ["Other", "Crop", "Water"]}, "Crop Classes")
        FeatureCollection > Intervals:
            Map.addLayer(features, {"property": "elevation",
                "vizType": "intervals", "breaks": [0, 500, 1500, 3000],
                "palette": ["#2b83ba", "#abdda4", "#d7191c"]},
                "Elevation intervals")
        Stored image preset:
            Map.addLayer(image, {"default": "Natural Color"}, "Preset")
    """
    vis_params = dict(vis_params or {})

    # Normalize geometry and feature inputs without making API calls.

    if isinstance(ee_object, ee.ImageCollection):
        ee_object = ee_object.mosaic()

    if isinstance(ee_object, ee.Geometry):
        ee_object = ee.FeatureCollection([ee.Feature(ee_object)])
    elif isinstance(ee_object, ee.Feature):
        ee_object = ee.FeatureCollection([ee_object])

    source_type = "featureCollection" if isinstance(ee_object, ee.FeatureCollection) else "image"
    if not isinstance(ee_object, (ee.Image, ee.FeatureCollection)):
        print(f"[Map] Unsupported object type: {type(ee_object)}")
        return

    _post(
        "addLayer",
        {
            "serialized": ee_object.serialize(),
            "sourceType": source_type,
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
