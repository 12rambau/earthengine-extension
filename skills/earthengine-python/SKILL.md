---
name: earthengine-python
description: Google Earth Engine analysis with Python in VS Code. Use for ANY Earth Engine request beyond displaying one existing asset unchanged - filtering image collections by date, region or clouds, cloud masking, composites (median, mosaic), NDVI or other indices and band math, reducers, zonal statistics, time series, change detection, classification, sampling, charts, and exports to Drive, Cloud Storage or assets. Explains how to write and run a Python script with earthengine-api and display results on the VS Code Earth Engine map with vscee.Map.
---

# Earth Engine with Python in VS Code

## Decision rule

Use the `earthengine_*` tools directly only for:

- showing ONE existing asset unchanged (`earthengine_addMapLayer`), centering the map
  (`earthengine_setMapView`), listing/removing layers;
- copying, moving or deleting assets;
- listing or cancelling tasks.

For **anything else** (filtering, computing, combining, reducing, classifying, exporting),
write a Python script and run it. Do not chain many tool calls to emulate a computation,
and do not answer with Code Editor JavaScript unless the user asks for it.

## Workflow

1. **Get the header**: call `earthengine_getPythonSetup`. It returns the active project and
   the `header` every script starts with (`import ee`, `from vscee import Map`,
   `ee.Initialize(project="<project>")`). Use it verbatim. If `project` is null, ask the
   user which Google Cloud project to use (or to sign in from the Earth Engine sidebar).
   If `ee.Initialize` fails with an authentication error, ask the user to run
   `earthengine authenticate` once in the terminal.
2. **Prepare Python**: make sure a Python environment is selected, then install
   `earthengine-api` and `vscee` in it (`pip install earthengine-api vscee`).
3. **Write the script** in the workspace (e.g. `ee_scripts/<topic>.py`), never in a
   temporary location the user cannot see. Follow the template below.
4. **Always run it yourself** right after writing it - never stop at showing the code or
   telling the user to run it. Use the terminal tool in the foreground (not a background
   process or subagent) so the output stays visible in the user's terminal:
   `<selected python interpreter> ee_scripts/<topic>.py`. Layers sent with `vscee.Map`
   appear in the Earth Engine map panel, which opens automatically.
   On failure, read the traceback, fix the script and run it again (missing package →
   install it in the selected environment; authentication → see step 1). Stop and ask
   the user after 3 failed attempts on the same error.
5. **Report**: summarize the printed output; for exports, give the task description and
   offer to follow it with `earthengine_listTasks` (runtime, EECU cost) or cancel it with
   `earthengine_cancelTask`.

## Script template

```python
import ee
from vscee import Map

ee.Initialize(project="my-project")  # project from earthengine_getPythonSetup

aoi = ee.Geometry.Point([2.35, 48.85]).buffer(10_000)

s2 = (
    ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(aoi)
    .filterDate("2024-06-01", "2024-09-01")
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    .median()
    .clip(aoi)
)
ndvi = s2.normalizedDifference(["B8", "B4"]).rename("NDVI")

Map.addLayer(s2, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}, "RGB")
Map.addLayer(ndvi, {"min": 0, "max": 1, "palette": ["white", "green"]}, "NDVI")
Map.centerObject(aoi, zoom=11)

mean = ndvi.reduceRegion(ee.Reducer.mean(), aoi, scale=10, maxPixels=1e9)
print("Mean NDVI:", mean.getInfo())
```

## `vscee.Map` API (mirrors the Code Editor `Map`)

| Call                                                                     | Notes                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Map.addLayer(obj, vis_params=None, name=None, shown=True, opacity=1.0)` | `obj`: `ee.Image`, `ee.ImageCollection` (mosaicked), `ee.FeatureCollection`, `ee.Feature`, `ee.Geometry`. Vectors accept `color` and `strokeWidth`. Re-using a name replaces the layer. |
| `Map.centerObject(obj, zoom=None)`                                       | Fits the object's bounds.                                                                                                                                                               |
| `Map.setCenter(lon, lat, zoom=None)`                                     | Note the **lon, lat** order, like the Code Editor.                                                                                                                                      |
| `Map.clear()`                                                            | Removes all layers.                                                                                                                                                                     |

Visualization parameters follow `ee.Image.visualize`: `bands` (1 or 3), `min`, `max`
(number or per-band list), `palette` (list of hex colors or CSS names), `gamma`.
`{"default": "<preset name>"}` uses a SEPAL visualization stored on the asset.
Nothing is computed client-side: tiles are rendered by Earth Engine on demand.

## Earth Engine best practices

- **Stay server-side.** Build the whole computation with `ee` objects; call `getInfo()`
  once at the end, on a small result. Never call `getInfo()` inside a Python loop - use
  `.map()`, `ee.List.sequence(...).map(...)`, `reduceRegions`, `aggregate_*` instead.
- **Filter first.** `filterBounds` → `filterDate` → metadata filters, before `.map()`.
- **Always pass `scale`** (and `maxPixels`, or `bestEffort=True`) to `reduceRegion`,
  `sample`, exports. Use the native resolution of the data (S2 10 m, Landsat 30 m,
  MODIS 250-1000 m) unless the user wants coarser.
- **Cloud masking**: Sentinel-2 → `COPERNICUS/S2_CLOUD_PROBABILITY` or the `SCL` band /
  `QA60`; Landsat Collection 2 → `QA_PIXEL` bits; apply scaling factors
  (`SR_B*` × 0.0000275 − 0.2) before computing indices.
- **Composites**: `median()` for cloud-robust reflectance, `qualityMosaic("NDVI")` for
  greenest pixel, `mosaic()` only for "most recent on top".
- **Large outputs** (whole countries, high resolution, many features, long series)
  → `ee.batch.Export.image.toAsset / toDrive / toCloudStorage` or
  `ee.batch.Export.table.*`, then `task.start()`. Do not `getInfo()` them.
  Exports to assets go under `projects/<project>/assets/...`.
- **Charts**: reduce server-side to a small `ee.FeatureCollection` or dictionary,
  `getInfo()` it, then plot with matplotlib/pandas and save the figure in the workspace.
- **Errors**: "User memory limit exceeded" / "Computation timed out" → reduce the region,
  increase `scale`, add `tileScale=4` to reducers, or switch to an export.
  "Too many concurrent aggregations" → retry later or export.

## Finding datasets

- Public catalog ids look like `COPERNICUS/S2_SR_HARMONIZED`, `LANDSAT/LC09/C02/T1_L2`,
  `MODIS/061/MOD13Q1`, `ESA/WorldCover/v200`, `USGS/SRTMGL1_003`,
  `FAO/GAUL/2015/level0`. Check band names and scales in the Earth Engine catalog
  (Datasets view of the extension) instead of guessing.
- Avoid deprecated ids: `COPERNICUS/S2_SR` → `COPERNICUS/S2_SR_HARMONIZED`,
  `MODIS/006/*` → `MODIS/061/*`, Landsat Collection 1 (`LANDSAT/LC08/C01/*`) →
  Collection 2 (`LANDSAT/LC08/C02/T1_L2`). Apply band scale factors (e.g. MODIS NDVI × 0.0001).
- User assets: `projects/<project>/assets/...` (legacy: `users/<name>/...`).
