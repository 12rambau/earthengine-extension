import ee
from vscee import Map

ee.Initialize(project="ee-geetools")

# Update to the latest vintage in the Data Catalog once one covering lossYear exists.
hansen = ee.Image('UMD/hansen/global_forest_change_2023_v1_11')
lossYear = 2023

# The country boundary defines both the analysis region and the outline overlay.
france = ee.FeatureCollection('FAO/GAUL/2015/level0').filter(ee.Filter.eq('ADM0_NAME', 'France'))
region = france.geometry()

# lossyear is coded as years since 2000 (1-23 in the 2023 vintage), so 2025 needs a newer asset.
loss = hansen.select('lossyear').eq(lossYear - 2000).selfMask().clip(region)

treeVis = {"bands": ['treecover2000'], "min": 0, "max": 100, "palette": ['000000', '00ff00']}
lossVis = {"palette": ['ff0000']}

Map.addLayer(hansen.select('treecover2000').clip(region), treeVis, 'Tree cover 2000')
Map.addLayer(loss, lossVis, f'Tree cover loss {lossYear}')
Map.addLayer(france, {"color": '000000', "strokeWidth": 1}, 'France boundary')
Map.centerObject(region, zoom=6)