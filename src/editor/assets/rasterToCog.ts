/** @module rasterToCog — Converts GDAL-readable raster datasets to staged COGs. */

import * as fs from 'fs';
import * as path from 'path';
import { getRuntime } from './vectorToShapefile.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Single-file raster formats supported by the bundled GDAL drivers. */
export const RASTER_EXTENSIONS = [
  'tif',
  'tiff',
  'vrt',
  'img',
  'jp2',
  'j2k',
  'png',
  'jpg',
  'jpeg',
  'bmp',
  'gif',
  'webp',
  'asc',
  'grd',
  'bil',
  'nc',
  'hdf',
  'h5',
];

// ==================================================================
// PUBLIC API
// ==================================================================
/** Reads the source's band count without creating a temporary COG. */
export async function readRasterBandCount(filePath: string): Promise<number> {
  const { gdal } = await getRuntime();
  const { datasets, errors } = await gdal.open(filePath);
  if (!datasets.length) {
    throw new Error(`GDAL could not open ${path.basename(filePath)}: ${errors.join('; ')}`);
  }
  try {
    const info = await gdal.getInfo(datasets[0]);
    if (info.type !== 'raster' || !info.bandCount) {
      throw new Error(`${path.basename(filePath)} has no raster bands.`);
    }
    return info.bandCount;
  } finally {
    await gdal.close(datasets[0]);
  }
}

/** Creates a GDAL COG and returns its path and scratch directory. */
export async function convertRasterToCog(filePath: string): Promise<{
  cogPath: string;
  directory: string;
  bandCount: number;
}> {
  const { gdal, scratch } = await getRuntime();
  const { datasets, errors } = await gdal.open(filePath);
  if (!datasets.length) {
    throw new Error(`GDAL could not open ${path.basename(filePath)}: ${errors.join('; ')}`);
  }

  const dataset = datasets[0];
  try {
    const info = await gdal.getInfo(dataset);
    if (info.type !== 'raster' || !info.bandCount || !info.width || !info.height) {
      throw new Error(`${path.basename(filePath)} has no raster bands to ingest.`);
    }
    if (!info.projectionWkt) {
      throw new Error(
        `${path.basename(filePath)} has no coordinate reference system; assign one before importing.`,
      );
    }

    const directory = await fs.promises.mkdtemp(path.join(scratch, 'raster-'));
    try {
      const base = path.basename(filePath, path.extname(filePath)).replace(/[^\w.-]/g, '_');
      const output = await gdal.gdal_translate(
        dataset,
        [
          '-of',
          'COG',
          '-co',
          'BLOCKSIZE=512',
          '-co',
          'COMPRESS=DEFLATE',
          '-co',
          'INTERLEAVE=BAND',
          '-co',
          'OVERVIEWS=AUTO',
          '-co',
          'BIGTIFF=IF_SAFER',
        ],
        `${path.basename(directory)}/${base}`,
      );
      if (!fs.existsSync(output.real)) {
        throw new Error(`GDAL did not create the COG for ${path.basename(filePath)}.`);
      }
      return { cogPath: output.real, directory, bandCount: info.bandCount };
    } catch (error) {
      await fs.promises.rm(directory, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await gdal.close(dataset);
  }
}
