/**
 * @module eeSession
 * Owns the singleton `@google/earthengine` client session.
 *
 * The EE JS client is stateful: it authenticates and initializes once, then
 * every `ee.*` call uses that session. This module bridges it to the
 * extension's multi-profile `AuthService` — it registers a token refresher so
 * the client always pulls a fresh access token, initializes lazily for the
 * active profile's project, and re-initializes when the profile changes.
 */

import ee from '@google/earthengine';
import { AuthService } from '../auth/index.js';
import { httpRequest } from './httpClient.js';

let authService: AuthService | undefined;
let readyProject: string | undefined;
let readyPromise: Promise<void> | undefined;

// ==================================================================
// SETUP
// ==================================================================
/** Wires the EE client to the auth service. Call once during activation. */
export function configureEeSession(auth: AuthService): void {
  authService = auth;

  // EE calls this whenever its access token nears expiry, so the session
  // always borrows a fresh token from the auth service (which handles the
  // refresh-token / service-account exchange) rather than holding a stale one.
  ee.data.setAuthTokenRefresher((_authArgs, callback) => {
    auth
      .getToken()
      .then((token) => {
        callback(
          token
            ? { access_token: token, token_type: 'Bearer', expires_in: 3600 }
            : { access_token: '', token_type: 'Bearer', expires_in: 0, error: 'Not authenticated' },
        );
      })
      .catch((err) => {
        callback({ access_token: '', token_type: 'Bearer', expires_in: 0, error: String(err) });
      });
  });

  // A profile switch changes the active project — force a re-initialization.
  auth.onDidChangeAuth(() => {
    readyPromise = undefined;
    readyProject = undefined;
  });
}

// ==================================================================
// INITIALIZATION
// ==================================================================
/**
 * Ensures the EE client is initialized for the active profile's project and
 * returns the `ee` namespace. Safe to call repeatedly — initialization runs
 * once per project; a failed attempt is discarded so the next call retries.
 */
export async function ensureEe(): Promise<typeof ee> {
  if (!authService) {
    throw new Error('EE session not configured');
  }
  const profile = authService.currentProfile;
  if (!profile) {
    throw new Error('Not authenticated');
  }
  const project = profile.project;

  if (!readyPromise || readyProject !== project) {
    readyProject = project;
    readyPromise = initialize(project);
  }
  try {
    await readyPromise;
  } catch (err) {
    readyPromise = undefined;
    readyProject = undefined;
    throw err;
  }
  return ee;
}

/** Returns the current access token and project for direct REST calls. */
export async function getEeContext(): Promise<{ token: string; project: string }> {
  if (!authService) {
    throw new Error('EE session not configured');
  }
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  if (!readyProject) {
    throw new Error('EE session not initialized — call ensureEe() first');
  }
  return { token, project: readyProject };
}

/** Sets an initial token then initializes the client against `project`. */
function initialize(project: string): Promise<void> {
  return new Promise((resolve, reject) => {
    authService!
      .getToken()
      .then((token) => {
        if (!token) {
          reject(new Error('Not authenticated'));
          return;
        }

        const eeAny = ee as any;
        const algUrl = `https://earthengine.googleapis.com/v1/projects/${encodeURIComponent(project)}/algorithms?prettyPrint=false`;
        eeAny.data.getAlgorithms = (opt_callback?: (data: unknown, error?: string) => void) => {
          if (!opt_callback) {
            // Synchronous path — only hit when there's no success callback.
            // Shouldn't occur with our async initialization, but fall through
            // to original behaviour to avoid breaking anything.
            throw new Error('[EE] Synchronous getAlgorithms not available in extension host');
          }
          authService!
            .getToken()
            .then((tok) => {
              if (!tok) {
                throw new Error('Not authenticated');
              }
              return httpRequest(algUrl, 'GET', tok);
            })
            .then((raw) => {
              const converted = eeAny.rpc_convert.algorithms(JSON.parse(raw));
              opt_callback(converted, undefined);
            })
            .catch((err: unknown) => opt_callback(undefined, String(err)));
        };

        ee.data.setAuthToken(
          null,
          'Bearer',
          token,
          3600,
          null,
          () =>
            ee.initialize(
              null,
              null,
              () => resolve(),
              (message) => reject(new Error(message)),
              null,
              project,
            ),
          false,
        );
      })
      .catch(reject);
  });
}

// ==================================================================
// PROMISIFIED HELPERS
// ==================================================================
/** Promisified `ee.ComputedObject.evaluate()`. The caller asserts the result shape via `T`. */
export function evaluate<T = unknown>(object: {
  evaluate(callback: (result: unknown, error?: string) => void): void;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    object.evaluate((result, error) => (error ? reject(new Error(error)) : resolve(result as T)));
  });
}

/** Promisified `ee.data.getAsset()` — returns EE's asset metadata object. */
export async function getAssetInfo(name: string): Promise<unknown> {
  const client = await ensureEe();
  return new Promise((resolve, reject) => {
    client.data.getAsset(name, (result, error) =>
      error ? reject(new Error(error)) : resolve(result),
    );
  });
}

/** Promisified `ee.Image.getThumbURL()`. */
export function getThumbUrl(
  image: {
    getThumbURL(
      params: Record<string, unknown>,
      callback: (url: string, error?: string) => void,
    ): void;
  },
  params: Record<string, unknown>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    image.getThumbURL(params, (url, error) => (error ? reject(new Error(error)) : resolve(url)));
  });
}

/**
 * Requests a tile URL for an EE Image expression, bypassing `ee.data.getMapId`
 * (which uses the xmlhttprequest transport known to fail in the extension host).
 *
 * Bakes vis params into the expression via `ee.Image.visualize()` (handles
 * duplicate bands, array min/max, etc.) then POSTs to the Maps REST API
 * directly via `httpClient`.
 */
export async function getMapIdUrl(
  image: unknown,
  visParams: Record<string, unknown>,
): Promise<string> {
  console.log('[getMapIdUrl] start, visParams:', JSON.stringify(visParams).slice(0, 120));
  const eeAny = (await ensureEe()) as any;

  // Bake vis params into the expression via visualize() — this handles
  // duplicate band names and array min/max that the Maps API bandIds field rejects.
  const finalImage =
    Object.keys(visParams).length > 0 ? eeAny.Image(image).visualize(visParams) : image;

  // encodeCloudApi = encodeCloudApiExpression + domain_object_serialize → plain JSON
  const expression = eeAny.Serializer.encodeCloudApi(finalImage);
  console.log('[getMapIdUrl] expression encoded, keys:', Object.keys(expression ?? {}).join(','));

  const body: Record<string, unknown> = { expression, fileFormat: 'AUTO_JPEG_PNG' };

  // POST via Node https — not xmlhttprequest ---------------------------
  const { token, project } = await getEeContext();
  const url = `https://earthengine.googleapis.com/v1/projects/${encodeURIComponent(project)}/maps?fields=name`;
  console.log('[getMapIdUrl] POSTing to:', url, 'token prefix:', token?.slice(0, 10));

  const raw = await httpRequest(url, 'POST', token, JSON.stringify(body));
  console.log('[getMapIdUrl] POST response raw:', raw?.slice(0, 200));

  const parsed = JSON.parse(raw) as { name?: string };
  if (!parsed.name) {
    throw new Error(`Maps API returned no map name. Response: ${raw}`);
  }

  const tileUrl = `https://earthengine.googleapis.com/v1/${parsed.name}/tiles/{z}/{x}/{y}`;
  console.log('[getMapIdUrl] tile URL:', tileUrl.slice(0, 100));
  return tileUrl;
}
