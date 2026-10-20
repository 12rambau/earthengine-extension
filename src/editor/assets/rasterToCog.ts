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

/** An image within a folder, Zarr store or VRT, with its source band when split. */
export interface CollectionRaster {
  path: string;
  name: string;
  bandIndex?: number;
  bandCount: number;
}

export interface CollectionSourceInfo {
  images: CollectionRaster[];
  bandCount: number;
  properties: { key: string; value: string }[];
}

// ==================================================================
// PUBLIC API
// ==================================================================
/** Finds all ingestible rasters and source-level metadata before creating a collection. */
export async function inspectCollectionSource(
  filePath: string,
  source: 'cogs' | 'zarr' | 'vrt',
): Promise<CollectionSourceInfo> {
  if (source === 'cogs') {
    const pending = [filePath];
    const files: string[] = [];
    while (pending.length) {
      const folder = pending.pop()!;
      const entries = await fs.promises.readdir(folder, { withFileTypes: true });
      for (const entry of entries) {
        const candidate = path.join(folder, entry.name);
        if (entry.isDirectory()) {
          pending.push(candidate);
        } else if (entry.isFile() && /\.tiff?$/i.test(entry.name)) {
          files.push(candidate);
        }
      }
    }
    files.sort((left, right) => left.localeCompare(right));
    if (!files.length) {
      throw new Error('The selected folder contains no .tif or .tiff images.');
    }
    const images: CollectionRaster[] = [];
    for (const file of files) {
      const bandCount = await readRasterBandCount(file);
      images.push({
        path: file,
        name: path.relative(filePath, file).replace(/[\\/]/g, '_'),
        bandCount,
      });
    }
    const bandCount = images[0].bandCount;
    if (images.some((image) => image.bandCount !== bandCount)) {
      throw new Error('All images in the folder must have the same number of bands.');
    }
    return { images, bandCount, properties: [] };
  }

  const { gdal } = await getRuntime();
  const { datasets, errors } = await gdal.open(filePath);
  if (!datasets.length) {
    throw new Error(`GDAL could not open ${path.basename(filePath)}: ${errors.join('; ')}`);
  }
  let subdatasets: string[] = [];
  let referencedFiles: string[] = [];
  let rootBands = 0;
  let properties: CollectionSourceInfo['properties'] = [];
  try {
    const info = await gdal.gdalinfo(datasets[0]);
    rootBands = info.bands?.length ?? 0;
    if (source === 'vrt') {
      referencedFiles = (info.files ?? [])
        .filter(
          (file) => file.startsWith('/input/') && file !== `/input/${path.basename(filePath)}`,
        )
        .map((file) => path.resolve(path.dirname(filePath), path.relative('/input', file)))
        .filter((file) => RASTER_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase()));
      referencedFiles = [...new Set(referencedFiles)];
    }
    properties = Object.entries(info.metadata?.[''] ?? {})
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => ({ key, value }));
    subdatasets = Object.entries(info.metadata?.SUBDATASETS ?? {})
      .filter(([key]) => /^SUBDATASET_\d+_NAME$/.test(key))
      .sort(([left], [right]) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
      .map(([, value]) => {
        const match = /^ZARR:"[^"]+":(\/.*)$/.exec(value);
        if (!match) {
          throw new Error(`Unsupported GDAL subdataset: ${value}`);
        }
        return path.join(filePath, match[1]);
      });
  } finally {
    await gdal.close(datasets[0]);
  }

  const images: CollectionRaster[] = [];
  const sources = subdatasets.length
    ? subdatasets
    : referencedFiles.length
      ? referencedFiles
      : rootBands
        ? [filePath]
        : [];
  for (const rasterPath of sources) {
    const { datasets: rasters } = await gdal.open(rasterPath);
    if (!rasters.length) {
      throw new Error(`GDAL could not open raster ${rasterPath}.`);
    }
    try {
      const info = await gdal.getInfo(rasters[0]);
      if (!info.bandCount || !info.width || !info.height) {
        continue;
      }
      if (!info.projectionWkt) {
        throw new Error(`${path.basename(rasterPath)} has no coordinate reference system.`);
      }
      const base = path.basename(rasterPath, path.extname(rasterPath));
      if (referencedFiles.length) {
        images.push({
          path: rasterPath,
          name: path.basename(rasterPath),
          bandCount: info.bandCount,
        });
      } else {
        for (let bandIndex = 1; bandIndex <= info.bandCount; bandIndex++) {
          images.push({
            path: rasterPath,
            name: `${base}_b${bandIndex}.tif`,
            bandIndex,
            bandCount: 1,
          });
        }
      }
    } finally {
      await gdal.close(rasters[0]);
    }
  }
  if (!images.length) {
    throw new Error(`${path.basename(filePath)} has no georeferenced raster images to ingest.`);
  }
  const bandCount = images[0].bandCount;
  if (images.some((image) => image.bandCount !== bandCount)) {
    throw new Error('All images referenced by the VRT must have the same number of bands.');
  }
  return { images, bandCount, properties };
}

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
export async function convertRasterToCog(
  filePath: string,
  bandIndex?: number,
): Promise<{
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
    if (bandIndex && bandIndex > info.bandCount) {
      throw new Error(`${path.basename(filePath)} has no band ${bandIndex}.`);
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
          ...(bandIndex ? ['-b', String(bandIndex)] : []),
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
      return { cogPath: output.real, directory, bandCount: bandIndex ? 1 : info.bandCount };
    } catch (error) {
      await fs.promises.rm(directory, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await gdal.close(dataset);
  }
}
