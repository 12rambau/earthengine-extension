---
name: earthengine-python
description: Google Earth Engine analysis with Python in VS Code. Use for ANY Earth Engine request beyond displaying one existing asset unchanged - filtering image collections by date, region or clouds, cloud masking, composites (median, mosaic), monthly or yearly aggregation, NDVI or other spectral indices and band math, reducers, zonal statistics, time series, change detection, classification, sampling, charts and plots (static or interactive), and exports to Drive, Cloud Storage or assets. Explains how to write and run a Python script with earthengine-api, geetools and ipygee, and display results on the VS Code Earth Engine map with vscee.Map.
---

# Earth Engine with Python in VS Code

## Contents

- [Decision rule](#decision-rule) - tools vs. Python script
- [Workflow](#workflow) - header, install, write, run, report
- [Libraries](#libraries) - which library for which job
- [Script template](#script-template)
- [`vscee.Map` API](#vsceemap-api-mirrors-the-code-editor-map)
- [Earth Engine best practices](#earth-engine-best-practices)
- [Finding datasets](#finding-datasets)
- References (read when needed):
  [geetools](references/geetools.md) - preprocessing, interval reductions, static matplotlib plots, assets, collection exports;
  [ipygee](references/ipygee.md) - interactive bokeh charts

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
2. **Prepare Python**: make sure a Python environment is selected, then install the
   libraries in it: `pip install earthengine-api vscee geetools ipygee`.
3. **Pick the format, then write the code** in the workspace, never in a temporary
   location the user cannot see:
   - **Notebook** (`ee_notebooks/<topic>.ipynb`) - the default for exploration, charts
     and any iterative analysis. First cell = header, then one step per cell.
   - **Script** (`ee_scripts/<topic>.py`) - for one-shot pipelines, exports and anything
     the user wants to re-run unchanged. Follow the template below.
4. **Always run it yourself** right after writing it - never stop at showing the code or
   telling the user to run it.
   - Notebook: run the cells in order with the notebook tools; outputs and plots appear
     inline.
   - Script: use the terminal tool in the foreground (not a background process or
     subagent) so the output stays visible in the user's terminal:
     `<selected python interpreter> ee_scripts/<topic>.py`.
   - Exception: code that starts export tasks (`task.start()`) consumes EECU and writes
     outputs. Run it only after the user explicitly authorizes it; otherwise return the
     code without running it.

   Layers sent with `vscee.Map` appear in the Earth Engine map panel, which opens
   automatically. On failure, read the traceback, fix the code and run it again
   (missing package → install it in the selected environment; authentication → see
   step 1). Stop and ask the user after 3 failed attempts on the same error.

5. **Report**: summarize the printed output; for exports, give the task description and
   offer to follow it with `earthengine_listTasks` (runtime, EECU cost) or cancel it with
   `earthengine_cancelTask`.

## Libraries

| Need                                                                   | Use                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Show results on the map                                                | `vscee.Map` (below)                                                                        |
| Cloud masking, scale/offset, spectral indices, closest image to a date | geetools `.geetools.maskClouds()`, `.scaleAndOffset()`, `.spectralIndices()`, `.closest()` |
| Monthly / yearly / n-day composites                                    | geetools `.geetools.reduceInterval(reducer, unit, duration)`                               |
| Static charts (time series, per-region bars, histograms)               | geetools `.geetools.plot_*` (matplotlib) - **default**                                     |
| Interactive charts (zoom, hover)                                       | ipygee `.bokeh.plot_*` - only when the user asks for interactivity                         |
| Export a whole ImageCollection                                         | `ee.batch.Export.geetools.imagecollection.toAsset/toDrive/toCloudStorage`                  |

`import geetools` and `import ipygee` only register the `.geetools` / `.bokeh`
accessors on `ee` objects; import them right after `import ee`. Prefer a geetools
method over hand-written equivalent code. Before using one, read
[references/geetools.md](references/geetools.md) or [references/ipygee.md](references/ipygee.md).

Displaying plots - always show them; save to a file only when the user asks (then
at the path they give):

- **matplotlib / geetools**: `plt.show()`.
- **bokeh / ipygee**: in a notebook call `bokeh.io.output_notebook()` once, then
  `bokeh.io.show(fig)`; in a script `bokeh.io.show(fig)` opens the chart in the browser.
- In a script, put all `print()` output before the final `plt.show()`: the run waits
  until the plot window is closed.

## Script template

```python
import ee
import geetools  # noqa: F401  (registers the .geetools accessor)
from vscee import Map

ee.Initialize(project="my-project")  # project from earthengine_getPythonSetup

aoi = ee.Geometry.Point([2.35, 48.85]).buffer(10_000)

s2 = (
    ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(aoi)
    .filterDate("2024-06-01", "2024-09-01")
    .geetools.maskClouds()
    .geetools.scaleAndOffset()
    .geetools.spectralIndices(["NDVI"])
)
composite = s2.median().clip(aoi)

Map.addLayer(composite, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 0.3}, "RGB")
Map.addLayer(composite, {"bands": ["NDVI"], "min": 0, "max": 1, "palette": ["white", "green"]}, "NDVI")
Map.centerObject(aoi, zoom=11)

mean = composite.select("NDVI").reduceRegion(ee.Reducer.mean(), aoi, scale=10, maxPixels=1e9)
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
  `reduceRegions` and `sample`. Use the native resolution of the data (S2 10 m,
  Landsat 30 m, MODIS 250-1000 m) unless the user wants coarser.
- **Cloud masking**: Sentinel-2 → `COPERNICUS/S2_CLOUD_PROBABILITY` or the `SCL` band /
  `QA60`; Landsat Collection 2 → `QA_PIXEL` bits; apply scaling factors
  (`SR_B*` × 0.0000275 − 0.2) before computing indices.
- **Composites**: `median()` for cloud-robust reflectance, `qualityMosaic("NDVI")` for
  greenest pixel, `mosaic()` only for "most recent on top".
- **Large outputs** (whole countries, high resolution, many features, long series)
  → export them, then `task.start()` (see step 4 for authorization). Do not `getInfo()` them.
  - Images (`ee.batch.Export.image.toAsset / toDrive / toCloudStorage`): pass `region`
    and `maxPixels`, and set the grid with **either** `scale` (optionally `crs`),
    **or** `crs` + `crsTransform`, **or** `dimensions` - never combine them.
  - Tables (`ee.batch.Export.table.toAsset / toDrive / toCloudStorage`): no `scale`,
    `maxPixels` or `bestEffort` - those are not table export parameters; set
    `fileFormat` / `selectors` as needed.
  - Exports to assets go under `projects/<project>/assets/...`.
- **Charts**: use the geetools / ipygee plot methods (see [Libraries](#libraries)); they
  reduce server-side and fetch only the small result. For a chart they do not cover,
  reduce to a small `ee.FeatureCollection` or dictionary, `getInfo()` it once, then plot
  with matplotlib.
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
