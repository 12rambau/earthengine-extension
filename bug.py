import ee
import geopandas as gpd
import json
import LDCGEETools
from pathlib import Path
import re
from shapely.geometry import box
from tempfile import TemporaryDirectory
from urllib.request import urlopen, urlretrieve
from vscee import Map
from zipfile import ZipFile

LDCGEETools.WorkloadScript("hurricane-wind-probabilities")
ee.Initialize.ldc.from_account("ldc-weather")

# Contiguous U.S. extent for the USDA Cropland Data Layer.
CONTINENTAL_US_COORDINATES = [
 [
   [-125.0, 24.0],
   [-66.0, 24.0],
   [-66.0, 50.0],
   [-125.0, 50.0],
   [-125.0, 24.0],
 ]
]
continental_us = ee.Geometry.Polygon(CONTINENTAL_US_COORDINATES)

NHC_WIND_PROBABILITY_ARCHIVE_URL = "https://www.nhc.noaa.gov/gis/forecast/archive/"
ISAIAS_FORECAST_EXTENT = box(-105.0, 15.0, -75.0, 42.0)
PLAY_DIRECTORY = Path(__file__).resolve().parent
WIND_PROBABILITY_COLORS = {
   "<5%": "fff7bc",
   "5-10%": "fee391",
   "10-20%": "fec44f",
   "20-30%": "fe9929",
   "30-40%": "ec7014",
   "40-50%": "cc4c02",
   "50-60%": "993404",
   "60-70%": "8c2d04",
   "70-80%": "7f2704",
   "80-90%": "662506",
   ">90%": "4d1b05",
}


def latest_wind_probability_archive() -> tuple[str, str]:
   """Return the URL and UTC timestamp of the newest NHC GIS probability bundle."""
   with urlopen(NHC_WIND_PROBABILITY_ARCHIVE_URL) as response:
      archive_listing = response.read().decode("utf-8")

   filenames = re.findall(r'href="(\d{10}_wsp_120hr5km\.zip)"', archive_listing)
   if not filenames:
      raise RuntimeError("NHC has not published a wind-probability GIS bundle.")

   filename = max(filenames)
   return NHC_WIND_PROBABILITY_ARCHIVE_URL + filename, filename[:10]


def load_isaias_wind_probabilities() -> tuple[ee.FeatureCollection, str]:
   """Download current NHC probabilities and isolate Isaias's Gulf/Atlantic contours."""
   archive_url, timestamp = latest_wind_probability_archive()
   with TemporaryDirectory() as temp_dir:
      archive_path = PLAY_DIRECTORY / "isaias_wind_probabilities.zip"
      urlretrieve(archive_url, archive_path)
      with ZipFile(archive_path) as archive:
         archive.extractall(temp_dir)
      shapefile_path = next(Path(temp_dir).glob("*_wsp34knt120hr_5km.shp"))
      probability_contours = (
         gpd.read_file(shapefile_path)
         .to_crs("EPSG:4326")
         .explode(index_parts=False, ignore_index=True)
      )
      probability_contours = probability_contours[
         probability_contours.intersects(ISAIAS_FORECAST_EXTENT)
      ].copy()
      probability_contours["geometry"] = probability_contours.geometry.intersection(
         ISAIAS_FORECAST_EXTENT
      )

   if probability_contours.empty:
      raise RuntimeError("The newest NHC GIS bundle does not contain Isaias contours.")

   return ee.FeatureCollection(json.loads(probability_contours.to_json())), timestamp


# USDA CDL crop class 2 is cotton. Use the most recent annual layer.
latest_cdl = ee.ImageCollection("USDA/NASS/CDL").sort("system:time_start", False).first()
cotton_area = (
   latest_cdl.select("cropland")
   .eq(2)
   .selfMask()
   .clip(continental_us)
)
isaias_wind_probabilities, wind_probability_timestamp = load_isaias_wind_probabilities()


Map.clear()
Map.centerObject(continental_us.union(isaias_wind_probabilities.geometry()), zoom=4)
Map.addLayer(
    cotton_area,
    {"palette": ["d48806"], "opacity": 0.85},
   "U.S. cotton area (latest USDA CDL)",
)
for probability, color in WIND_PROBABILITY_COLORS.items():
   probability_contour = isaias_wind_probabilities.filter(
      ee.Filter.eq("PERCENTAGE", probability)
   ).style({"color": color, "fillColor": f"{color}66", "width": 1})
   Map.addLayer(
      probability_contour,
      {},
      f"Isaias 34 kt probability: {probability} ({wind_probability_timestamp} UTC)",
   )