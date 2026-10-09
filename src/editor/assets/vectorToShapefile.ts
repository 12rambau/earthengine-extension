/**
 * @module vectorToShapefile
 * Converts any OGR-readable vector file to a Shapefile, through gdal3.js.
 *
 * Earth Engine table ingestion only reads Shapefiles (and CSV/TFRecord), so a
 * GeoJSON, GeoPackage or KML source has to be rewritten before it is staged in
 * Cloud Storage. The rewrite is a plain `ogr2ogr` run, which keeps the
 * attribute table and geometries of the source and therefore produces the exact
 * same ingestion manifest as a Shapefile picked directly.
 *
 * gdal3.js is GDAL compiled to WebAssembly: unlike a native binding it needs no
 * per-platform build and no rebuild when VS Code moves to a new Electron ABI,
 * so a single VSIX keeps working. The two runtime assets it loads — the `.wasm`
 * module and the `.data` bundle holding PROJ/GDAL support files — are copied
 * into `dist/gdal` by `esbuild.js`.
 *
 * Constraints inherited from the Shapefile format, enforced by GDAL itself:
 * - one layer per file, so a multi-layer source has to be narrowed down;
 * - `.dbf` field names are capped at 10 characters, so long property names are
 *   laundered — the renames are captured and reported to the caller.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import initGdalJs from 'gdal3.js/node.js';
import { getExtensionUri } from '../../shared/extensionContext.js';

// ==================================================================
// CONSTANTS
// ==================================================================
/** Vector extensions the New Asset picker accepts and routes through GDAL. */
export const CONVERTIBLE_EXTENSIONS = [
  'geojson',
  'json',
  'gpkg',
  'kml',
  'kmz',
  'gml',
  'gpx',
  'fgb',
  'topojson',
  'tab',
  'mif',
  'dxf',
  'sqlite',
];

/** Earth Engine stores tables in WGS 84, so everything is reprojected to it. */
const TARGET_SRS = 'EPSG:4326';

/** GDAL emits this when a property name is too long for a `.dbf` column. */
const LAUNDERED_FIELD = /Normalized\/laundered field name: '(.+?)' to '(.+?)'/;

// ==================================================================
// INTERFACES
// ==================================================================
/** The Shapefile written from a converted source, plus its cleanup handle. */
export interface ShapefileConversion {
  /** Absolute path of the generated `.shp`; its sidecars sit next to it. */
  shpPath: string;
  /** Temporary directory holding every generated file — delete it once staged. */
  directory: string;
  /** Number of features written. */
  featureCount: number;
  /** Source property name → `.dbf` column, for the names GDAL had to shorten. */
  renamedFields: { source: string; column: string }[];
}

/** Asks the user which layer to ingest; returning undefined aborts. */
export type LayerChooser = (layers: string[]) => Promise<string | undefined>;

// ==================================================================
// STATE
// ==================================================================
/**
 * The WebAssembly runtime is expensive to start and gdal3.js caches a single
 * instance internally, so the scratch directory mounted over its virtual
 * `/output` tree is fixed on first use and every conversion gets a subfolder.
 */
let runtime: Promise<{ gdal: Awaited<ReturnType<typeof initGdalJs>>; scratch: string }> | undefined;

/** GDAL warnings emitted by the conversion currently running. */
let warnings: string[] = [];

// ==================================================================
// PUBLIC API
// ==================================================================
/** Whether a path has to be converted before ingestion. */
export function isConvertibleVectorPath(filePath: string): boolean {
  return CONVERTIBLE_EXTENSIONS.includes(path.extname(filePath).slice(1).toLowerCase());
}

/**
 * Rewrites a vector file as a Shapefile in a fresh temporary directory.
 *
 * @param chooseLayer Called when the source holds more than one layer.
 * @throws If the file holds no vector layer, if the layer choice is cancelled
 *   or if GDAL rejects the translation.
 */
export async function convertToShapefile(
  filePath: string,
  chooseLayer: LayerChooser,
): Promise<ShapefileConversion> {
  const { gdal, scratch } = await getRuntime();
  const { datasets, errors } = await gdal.open(filePath);
  if (!datasets.length) {
    throw new Error(
      `GDAL could not open ${path.basename(filePath)}${errors.length ? `: ${errors[0]}` : '.'}`,
    );
  }

  const dataset = datasets[0];
  try {
    const info = await gdal.getInfo(dataset);
    const layers = info.layers ?? [];
    if (info.type !== 'vector' || layers.length === 0) {
      throw new Error(`${path.basename(filePath)} holds no vector layer to ingest.`);
    }

    let layer = layers[0];
    if (layers.length > 1) {
      const chosen = await chooseLayer(layers.map(({ name }) => name));
      if (!chosen) {
        throw new Error('Ingestion cancelled: no layer selected.');
      }
      layer = layers.find(({ name }) => name === chosen)!;
    }
    if (layer.featureCount === 0) {
      throw new Error(`Layer "${layer.name}" contains no feature to ingest.`);
    }

    const directory = await fs.promises.mkdtemp(path.join(scratch, 'run-'));
    const base = path.basename(filePath, path.extname(filePath)).replace(/[^\w.-]/g, '_');

    warnings = [];
    const output = await gdal.ogr2ogr(
      dataset,
      ['-f', 'ESRI Shapefile', '-t_srs', TARGET_SRS, '-lco', 'ENCODING=UTF-8', layer.name],
      // Relative to the scratch root, which GDAL sees mounted as `/output`.
      `${path.basename(directory)}/${base}`,
    );

    return {
      shpPath: output.real,
      directory,
      featureCount: layer.featureCount,
      renamedFields: collectRenamedFields(),
    };
  } finally {
    await gdal.close(dataset);
  }
}

// ==================================================================
// RUNTIME
// ==================================================================
/** Boots the WebAssembly runtime once and mounts its output scratch directory. */
export async function getRuntime(): Promise<{
  gdal: Awaited<ReturnType<typeof initGdalJs>>;
  scratch: string;
}> {
  runtime ??= (async () => {
    const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ee-ogr-'));
    const gdal = await initGdalJs({
      path: assetDirectory(),
      dest: scratch,
      useWorker: false,
      logHandler: () => {},
      errorHandler: (message) => warnings.push(message),
    });
    return { gdal, scratch };
  })();
  return runtime;
}

/**
 * gdal3.js reads its `.data` bundle as `"./" + locateFile(...)`, so the asset
 * directory has to be expressed relative to the process working directory.
 */
function assetDirectory(): string {
  const absolute = path.join(getExtensionUri().fsPath, 'dist', 'gdal');
  const relative = path.relative(process.cwd(), absolute);
  return path.isAbsolute(relative) ? absolute : relative.split(path.sep).join('/');
}

/** Turns the `.dbf` laundering warnings of the last run into rename pairs. */
function collectRenamedFields(): { source: string; column: string }[] {
  return warnings.flatMap((message) => {
    const match = LAUNDERED_FIELD.exec(message);
    return match ? [{ source: match[1], column: match[2] }] : [];
  });
}
