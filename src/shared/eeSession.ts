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
