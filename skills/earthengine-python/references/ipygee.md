# ipygee reference

`ipygee` adds a `.bokeh` accessor on `ee.Image`, `ee.ImageCollection` and
`ee.FeatureCollection` that mirrors the geetools plotting methods but returns
**interactive bokeh figures** (zoom, pan, hover). Use it only when the user wants an
interactive chart; otherwise use the static geetools plots.

Docs: https://ipygee.readthedocs.io/en/latest/

## Contents

- Setup and output
- ImageCollection charts
- Image charts
- FeatureCollection charts
- Differences from geetools
- Out of scope in VS Code

## Setup and output

```python
import ee
import ipygee  # noqa: F401  (registers the .bokeh accessor)
from bokeh.io import output_notebook, show

output_notebook()  # once per notebook

fig = collection.bokeh.plot_dates_by_bands(region=aoi, reducer="mean", scale=500, bands=["NDVI"])
fig.title.text = "NDVI"
show(fig)
```

`output_notebook()` is only needed in a notebook; in a script `show(fig)` opens the chart
in the browser. Save with `bokeh.io.save(fig, path)` only when the user asks for a file.
To combine charts, pass an existing figure through `figure=` or lay them out with
`bokeh.layouts.column(...)`.

## ImageCollection charts

| Method                                                                                                     | x-axis                | Series  |
| ---------------------------------------------------------------------------------------------------------- | --------------------- | ------- |
| `plot_dates_by_bands(region, reducer, dateProperty, bands, labels, colors, scale, ...)`                    | date                  | bands   |
| `plot_dates_by_regions(band, regions, label, reducer, dateProperty, colors, scale, ...)`                   | date                  | regions |
| `plot_doy_by_bands(region, spatialReducer, timeReducer, dateProperty, bands, labels, colors, scale, ...)`  | day of year           | bands   |
| `plot_doy_by_regions(band, regions, label, spatialReducer, timeReducer, dateProperty, colors, scale, ...)` | day of year           | regions |
| `plot_doy_by_seasons(band, region, seasonStart, seasonEnd, reducer, dateProperty, colors, scale, ...)`     | day of year in season | years   |

All accept `crs`, `crsTransform`, `tileScale`; the single-region ones also accept
`bestEffort` and `maxPixels`.

## Image charts

- `plot_by_regions(type, regions, reducer, bands, regionId, labels, colors, scale, ...)` - x: regions, series: bands
- `plot_by_bands(type, regions, reducer, bands, regionId, labels, colors, scale, ...)` - x: bands, series: regions
- `plot_hist(bins, region, bands, labels, colors, precision, scale, bestEffort, maxPixels, ...)` - pixel value histogram

`type` takes the same names as geetools (`"bar"`, `"plot"`, `"scatter"`, ...).

## FeatureCollection charts

- `plot_by_features(type, featureId, properties, labels, colors)` - x: features, series: properties
- `plot_by_properties(type, featureId, properties, labels, colors)` - x: properties, series: features
- `plot_hist(property, label, color)` - histogram of one property

## Differences from geetools

- Accessor is `.bokeh` instead of `.geetools`; use `figure=` instead of `ax=`.
- Returns a `bokeh.plotting.figure`; customise it with bokeh (`fig.title.text`,
  `fig.yaxis.axis_label`, ...).
- **Default `scale` is 10000 m** - always pass the scale matching the data.
- No `plot_doy_by_years` and no static map (`plot`) equivalent.

## Out of scope in VS Code

ipygee also ships Jupyter widgets (map, task manager, asset manager, sidecar). Do not use
them in scripts: the extension already provides the map (`vscee.Map`), the task tools
(`earthengine_listTasks`, `earthengine_cancelTask`) and the asset tools.
