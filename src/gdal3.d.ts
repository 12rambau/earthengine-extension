/**
 * Ambient declarations for the Node entry point of `gdal3.js`, whose bundled
 * `index.d.ts` only declares the `gdal3.js` specifier. Only the vector surface
 * the extension uses is typed; extend as new applications are adopted.
 */
declare module 'gdal3.js/node.js' {
  /** A dataset opened in the WebAssembly filesystem. */
  interface Gdal3Dataset {
    pointer: number;
    path: string;
    type: string;
  }

  interface Gdal3Layer {
    name: string;
    featureCount: number;
  }

  interface Gdal3DatasetInfo {
    type: string;
    dsName: string;
    driverName: string;
    bandCount?: number;
    width?: number;
    height?: number;
    projectionWkt?: string;
    layerCount?: number;
    featureCount?: number;
    layers?: Gdal3Layer[];
  }

  /** A file produced in the virtual `/output` tree and its real on-disk twin. */
  interface Gdal3FilePath {
    local: string;
    real: string;
    all?: Gdal3FilePath[];
  }

  interface Gdal3 {
    open(fileOrFiles: string | string[]): Promise<{
      datasets: Gdal3Dataset[];
      errors: string[];
    }>;
    close(dataset: Gdal3Dataset): Promise<void>;
    getInfo(dataset: Gdal3Dataset): Promise<Gdal3DatasetInfo>;
    gdal_translate(
      dataset: Gdal3Dataset,
      options?: string[],
      outputName?: string,
    ): Promise<Gdal3FilePath>;
    ogr2ogr(dataset: Gdal3Dataset, options?: string[], outputName?: string): Promise<Gdal3FilePath>;
  }

  interface Gdal3Config {
    /** Parent directory of `gdal3WebAssembly.wasm` and `gdal3WebAssembly.data`. */
    path?: string;
    /** Real directory mounted over the virtual `/output` tree (Node only). */
    dest?: string;
    useWorker?: boolean;
    env?: Record<string, string>;
    logHandler?: (message: string, type: string) => void;
    errorHandler?: (message: string, type: string) => void;
  }

  export default function initGdalJs(config?: Gdal3Config): Promise<Gdal3>;
}
