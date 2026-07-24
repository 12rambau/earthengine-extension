/**
 * Minimal ambient declarations for the `@google/earthengine` JS client, which
 * ships no types. Only the surface the extension actually uses is typed; the
 * client is dynamically typed, so `unknown`/index signatures are the escape
 * hatches. Extend as new calls are adopted.
 */
declare module '@google/earthengine' {
  /** EE async callback: `(result, error?)` — error is a string when the call fails. */
  type EeCallback<T = unknown> = (result: T, error?: string) => void;

  /** Result object handed to an auth-token refresher (see `setAuthTokenRefresher`). */
  interface EeAuthToken {
    access_token: string;
    token_type: string;
    expires_in: number;
    error?: string;
    state?: string;
  }

  interface EeComputedObject {
    /** Asynchronously evaluates the object server-side. */
    evaluate(callback: EeCallback): void;
    getInfo(callback?: EeCallback): unknown;
  }

  interface EeFeatureCollection extends EeComputedObject {
    select(...properties: unknown[]): EeFeatureCollection;
  }

  interface EeImage extends EeComputedObject {
    select(...bands: unknown[]): EeImage;
    visualize(params?: Record<string, unknown>): EeImage;
    clip(geometry: unknown): EeImage;
    /** Paints the features of a collection onto the image (color, width). */
    paint(featureCollection: unknown, color?: unknown, width?: unknown): EeImage;
    reduceRegion(params: Record<string, unknown>): EeComputedObject;
    /** Requests a thumbnail URL; `callback` receives `(url, error?)`. */
    getThumbURL(
      params: Record<string, unknown>,
      callback: (url: string, error?: string) => void,
    ): void;
  }

  interface EeImageCollection extends EeComputedObject {
    select(...bands: unknown[]): EeImageCollection;
    limit(max: number): EeImageCollection;
    first(): EeImage;
    mosaic(): EeImage;
  }

  interface EeReducer {
    minMax(): EeReducer;
    [key: string]: unknown;
  }

  interface EeData {
    setAuthToken(
      clientId: string | null,
      tokenType: string,
      accessToken: string,
      expiresIn: number,
      extraScopes: string[] | null,
      callback: (() => void) | null,
      updateAuthLibrary: boolean,
      suppressDefaultScopes?: boolean,
    ): void;
    setAuthTokenRefresher(
      refresher: (authArgs: unknown, callback: (token: EeAuthToken) => void) => void,
    ): void;
    listAssets(parent: string, params?: Record<string, unknown>, callback?: EeCallback): unknown;
    getAsset(id: string, callback?: EeCallback): unknown;
    listFeatures(asset: string, params: Record<string, unknown>, callback?: EeCallback): unknown;
    deleteAsset(assetId: string, callback?: EeCallback): unknown;
    renameAsset(sourceId: string, destinationId: string, callback?: EeCallback): unknown;
    copyAsset(
      sourceId: string,
      destinationId: string,
      overwrite?: boolean,
      callback?: EeCallback,
    ): unknown;
    createFolder(path: string, force?: boolean, callback?: EeCallback): unknown;
    listOperations(limit?: number, callback?: EeCallback): unknown;
    getOperation(operationName: string, callback?: EeCallback): unknown;
    cancelOperation(operationName: string, callback?: EeCallback): unknown;
    [key: string]: unknown;
  }

  interface Ee {
    data: EeData;
    Image: (arg?: unknown) => EeImage;
    ImageCollection: (arg: unknown) => EeImageCollection;
    FeatureCollection: (arg: unknown) => EeFeatureCollection;
    Reducer: EeReducer;
    Geometry: unknown;
    Number: unknown;
    /** `initialize(baseurl, tileurl, success?, error?, xsrf?, project?)`. */
    initialize(
      baseurl: string | null,
      tileurl: string | null,
      success?: () => void,
      error?: (message: string) => void,
      xsrfToken?: string | null,
      project?: string,
    ): void;
    reset(): void;
    [key: string]: unknown;
  }

  const ee: Ee;
  export default ee;
}
