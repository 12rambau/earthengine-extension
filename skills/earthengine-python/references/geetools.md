# geetools reference

`geetools` extends the Earth Engine Python API with a `.geetools` accessor on
`ee.Image`, `ee.ImageCollection`, `ee.FeatureCollection` (and more), plus `ee.Asset` and
`ee.batch.Export.geetools`. Everything stays server-side except the `plot_*` methods,
which fetch the reduced result and draw it with matplotlib.

Docs: https://geetools.readthedocs.io/en/stable/

## Contents

- Setup
- ImageCollection: preprocessing
- ImageCollection: temporal reduction and selection
- ImageCollection: data and static plots over time
- Image: utilities, data and static plots
- FeatureCollection: data and static plots
- Exporting an ImageCollection
- Assets as paths (`ee.Asset`)
- Pitfalls

## Setup

```python
import ee
import geetools  # noqa: F401
from matplotlib import pyplot as plt
```

End each chart with `plt.show()` (notebook and script). Save with `fig.savefig(...)`
only when the user asks for a file.

## ImageCollection: preprocessing

All return an `ee.ImageCollection`; chain them before reducing.

| Method                                                                   | Purpose                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `.geetools.maskClouds(prob=..., maskCirrus=True, maskShadows=True, ...)` | Cloud/shadow mask, Surface Reflectance products only (S2 SR, Landsat C2 L2, ...)         |
| `.geetools.scaleAndOffset()`                                             | Applies the catalog scale/offset of each band (STAC metadata)                            |
| `.geetools.preprocess()`                                                 | `maskClouds` + `scaleAndOffset` in one call                                              |
| `.geetools.spectralIndices(["NDVI", "NDWI", "EVI", ...])`                | Adds indices from the Awesome Spectral Indices list as bands; run after `scaleAndOffset` |
| `.geetools.tasseledCap()`                                                | Brightness / greenness / wetness bands                                                   |
| `.geetools.panSharpen()`                                                 | Pan-sharpening for sensors with a panchromatic band                                      |
| `.geetools.containsAllBands(bands)` / `containsAnyBands(bands)`          | Keep images having the given bands                                                       |

## ImageCollection: temporal reduction and selection

| Method                                                                              | Returns                                                                                        |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `.geetools.reduceInterval(reducer="mean", unit="month", duration=1)`                | One composite per interval (`unit`: year, month, week, day, ...) - filter the collection first |
| `.geetools.groupInterval(unit="month", duration=1)`                                 | `ee.List` of sub-collections, one per interval                                                 |
| `.geetools.closest(date, tolerance=..., unit=...)`                                  | Image(s) closest to a date                                                                     |
| `.geetools.medoid()`                                                                | Medoid composite                                                                               |
| `.geetools.outliers(bands, sigma=2)`                                                | Per-pixel outlier flags                                                                        |
| `.geetools.validPixel(band)`                                                        | Count / percentage of valid observations per pixel                                             |
| `.geetools.collectionMask()`                                                        | Pixels masked in every image                                                                   |
| `.geetools.integral(band, time=..., unit=...)`                                      | Integral of a band over time                                                                   |
| `.geetools.iloc(i)`, `.geetools.sortMany(props)`, `.geetools.aggregateArray(props)` | Indexing, multi-key sort, property arrays                                                      |
| `.geetools.reduceRegion(reducer, geometry, ...)` / `reduceRegions(...)`             | Reduction of each image of the collection                                                      |

## ImageCollection: data and static plots over time

Each `plot_*` has a data twin (same arguments, no plotting) returning a dictionary:
`datesByBands`, `datesByRegions`, `doyByBands`, `doyByRegions`, `doyByYears`, `doyBySeasons`.

```python
fig, ax = plt.subplots(figsize=(10, 4))
collection.geetools.plot_dates_by_bands(
    region=aoi, reducer="mean", scale=500, bands=["NDVI", "EVI"],
    ax=ax, dateProperty="system:time_start",
)
ax.set_title("NDVI and EVI")
plt.show()
```

| Method                                                                                  | x-axis                | Series                               |
| --------------------------------------------------------------------------------------- | --------------------- | ------------------------------------ |
| `plot_dates_by_bands(region, reducer, scale, bands, ax=...)`                            | date                  | bands                                |
| `plot_dates_by_regions(band, regions, label, reducer, scale, ax=...)`                   | date                  | regions (`label` = feature property) |
| `plot_doy_by_bands(region, spatialReducer, timeReducer, scale, bands, ax=...)`          | day of year           | bands                                |
| `plot_doy_by_regions(band, regions, label, spatialReducer, timeReducer, scale, ax=...)` | day of year           | regions                              |
| `plot_doy_by_years(band, region, reducer, scale, ax=...)`                               | day of year           | years                                |
| `plot_doy_by_seasons(band, region, seasonStart, seasonEnd, reducer, scale, ax=...)`     | day of year in season | years                                |

`seasonStart` / `seasonEnd` are days of year (`ee.Date("2022-04-15").getRelative("day", "year")`).
All accept `colors=[...]` and `labels=[...]`.

## Image: utilities, data and static plots

| Method                                                                                               | Purpose                               |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `.geetools.maskClouds()`, `.scaleAndOffset()`, `.preprocess()`, `.spectralIndices([...])`            | Same as the collection versions       |
| `.geetools.clipOnCollection(fc)`                                                                     | Clip to every feature of a collection |
| `.geetools.negativeClip(geometry)`                                                                   | Mask inside the geometry              |
| `.geetools.getValues(point, scale)`                                                                  | Pixel values at a point               |
| `.geetools.pixelArea(area_unit=...)`                                                                 | Pixel area in the requested unit      |
| `.geetools.reduceBands(reducer, bands, name)`                                                        | Band-wise reduction added as a band   |
| `.geetools.rename({"old": "new"})`, `.remove(bands)`, `.addPrefix(p)`, `.addSuffix(s)`, `.addDate()` | Band management                       |
| `.geetools.maskCoverRegion(region, scale)`                                                           | Share of masked pixels in a region    |
| `.geetools.matchHistogram(target, bands)`                                                            | Histogram matching                    |
| `.geetools.toGrid(size, band, geometry)`                                                             | Vector grid from the image            |
| `.geetools.byBands(regions, reducer, ...)` / `byRegions(...)`                                        | Data behind the plots below           |

Plots (`type`: `"bar"`, `"barh"`, `"stacked"`, `"plot"`, `"scatter"`, `"fill_between"`, `"pie"`, `"donut"`):

```python
fig, ax = plt.subplots(figsize=(10, 4))
image.geetools.plot_by_regions(
    type="bar", regions=regions, reducer="mean", scale=500, regionId="label",
    bands=["01_tmean", "02_tmean"], labels=["jan", "feb"], ax=ax,
)
```

- `plot_by_regions(type, regions, reducer, scale, regionId, bands, labels, colors, ax)` - x: regions, series: bands
- `plot_by_bands(type, regions, reducer, scale, regionId, bands, labels, colors, ax)` - x: bands, series: regions
- `plot_hist(bins, region, bands, labels, colors, scale, ax)` - pixel value histogram
- `plot(bands, region, ax, fc=None, cmap=None, scale=...)` - static map of the image (1 band + `cmap`, or 3 bands RGB), optional `fc` outline

## FeatureCollection: data and static plots

- `plot_by_features(type, featureId, properties, labels, colors, ax)` - x: features, series: properties (data: `byFeatures`)
- `plot_by_properties(type, featureId, properties, labels, colors, ax)` - x: properties, series: features (data: `byProperties`)
- `plot_hist(property, label, color, bins, ax)` - histogram of one property
- `plot(property, cmap, ax)` - static choropleth map of a property

## Exporting an ImageCollection

Returns a **list** of tasks (one per image); start each of them.

```python
tasks = ee.batch.Export.geetools.imagecollection.toAsset(
    imagecollection=collection,
    index_property="system:id",          # names each exported image
    assetId=f"projects/{PROJECT}/assets/my_collection",
    region=aoi, scale=30, maxPixels=1e13,
)
for t in tasks:
    t.start()
```

Also `toDrive(..., folder=...)` and `toCloudStorage(..., bucket=...)`.

## Assets as paths (`ee.Asset`)

`ee.Asset` behaves like `pathlib.Path` for asset ids:

```python
folder = ee.Asset(f"projects/{PROJECT}/assets/my_folder")
images = [a for a in folder.iterdir() if a.is_image()]
matches = list(folder.glob("**/landsat*"))
target = folder / "new_image"
print(target.exists(), target.parent, target.name)
```

Type checks: `is_image()`, `is_folder()`, `is_table()`, `is_type("IMAGE_COLLECTION")`.
For copy / move / delete of the user's assets prefer the
`earthengine_copyAsset` / `earthengine_moveAsset` / `earthengine_deleteAsset` tools
(they ask the user for confirmation).

## Pitfalls

- Always pass `scale` to `plot_*` and data methods; defaults can be very coarse.
- `maskClouds` works only on Surface Reflectance collections; on TOA or other data, mask
  manually with the QA band.
- `reduceInterval` processes every image: filter by date and bounds first.
- In a script, `plt.show()` waits until the window is closed: call it last.
