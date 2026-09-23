import ee
from vscee import Map

ee.Initialize(project="ldc-rs-main")

# Update to the latest vintage in the Data Catalog once one covering lossYear exists.
hansen = ee.Image('UMD/hansen/global_forest_change_2023_v1_11')
lossYear = 2023

# The country boundary defines both the analysis region and the outline overlay.
france = ee.FeatureCollection('FAO/GAUL/2015/level0').filter(ee.Filter.eq('ADM0_NAME', 'France'))
region = france.geometry()

# Compute the trend of night-time lights.

# Adds a band containing image date as years since 1991.
def createTimeBand(img):
    year = ee.Date(img.get('system:time_start')).get('year').subtract(1991)
    return ee.Image(year).byte().addBands(img)

# Map the time band creation helper over the night-time lights collection.
# https://developers.google.com/earth-engine/datasets/catalog/NOAA_DMSP-OLS_NIGHTTIME_LIGHTS
collection = (
    ee.ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS')
    .select('stable_lights')
    .map(createTimeBand)
)

# Compute a linear fit over the series of values at each pixel, visualizing
# the y-intercept in green, and positive/negative slopes as red/blue.
Map.addLayer(
    collection.reduce(ee.Reducer.linearFit()).clip(region),
    {"min": 0, "max": [0.18, 20, -0.18], "bands": ["scale", "offset", "scale"]},
    'stable lights trend'
)
Map.centerObject(region)