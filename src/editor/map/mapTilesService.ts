/**
 * @module mapTilesService
 * Google Map Tiles API client: API key custody, session tokens and tile URLs.
 *
 * The 2D Tiles API is a two-step protocol. A `createSession` call exchanges a
 * set of display options (map type, styles, overlays) for a session token valid
 * two weeks; every tile request then carries that token plus the API key. This
 * service owns both halves: it keeps the user's key in `SecretStorage`, caches
 * session tokens in `globalState`, and hands the WebView a ready-to-use
 * `{z}/{x}/{y}` template.
 *
 * The key is supplied by the user, never bundled — see the docs for the key
 * restrictions we ask them to apply.
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { fetchJson, postJson } from '../../shared/httpClient.js';
import { getGlobalState, getSecretStorage } from '../../shared/extensionContext.js';
import { showSecretInputBox } from '../../shared/secretInputBox.js';
import { BASEMAP_PRESETS, BasemapId, CreateSessionRequest } from './basemapPresets.js';

// ==================================================================
// CONSTANTS
// ==================================================================

const SECRET_KEY = 'earthengine.googleMapsApiKey';
const CACHE_KEY = 'earthengine.map.tileSessions';

const CREATE_SESSION_URL = 'https://tile.googleapis.com/v1/createSession';
const TILE_URL = 'https://tile.googleapis.com/v1/2dtiles';
const VIEWPORT_URL = 'https://tile.googleapis.com/tile/v1/viewport';

/** Renew a session this long before the API's stated expiry, in seconds. */
const EXPIRY_MARGIN_S = 3600;

/** Raised when no key has been configured, so callers can offer to set one. */
export const NO_API_KEY_MESSAGE =
  'No Google Maps API key configured. Basemaps are unavailable until you set one.';

// ==================================================================
// TYPES
// ==================================================================

interface SessionResponse {
  session: string;
  /** Epoch seconds, as a string. */
  expiry: string;
}

interface CachedSession {
  session: string;
  expiry: number;
  /** Hash of the key plus the request body; a mismatch means the session is stale. */
  fingerprint: string;
}

interface ViewportResponse {
  copyright?: string;
  maxZoomRects?: Array<{ maxZoom: number }>;
  error?: { message?: string };
}

/** Geographic extent of the map viewport, in degrees. */
export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ==================================================================
// MAPTILESSERVICE
// ==================================================================

/** Resolves basemap tile URLs from the Google Map Tiles API. */
export class MapTilesService {
  private sessions: Partial<Record<BasemapId, CachedSession>> | undefined;
  /** In-flight `createSession` calls, keyed by basemap id and fingerprint, so concurrent callers share one request. */
  private pendingSessions = new Map<string, Promise<string>>();

  // ── API key ─────────────────────────────────────────────────────

  /** Returns the stored key, or `undefined` if the user has not set one. */
  async getApiKey(): Promise<string | undefined> {
    return getSecretStorage().get(SECRET_KEY);
  }

  /** Prompts for a key and stores it. Returns `true` if a key was saved. */
  async promptForApiKey(): Promise<boolean> {
    const key = await showSecretInputBox({
      title: 'Google Maps API key',
      prompt: 'Key with the Map Tiles API enabled. Restrict it to that API only.',
      placeHolder: 'AIza…',
      ignoreFocusOut: true,
    });
    if (!key) {
      return false;
    }
    await getSecretStorage().store(SECRET_KEY, key.trim());
    await this.invalidate();
    return true;
  }

  /** Deletes the stored key and every cached session. */
  async clearApiKey(): Promise<void> {
    await getSecretStorage().delete(SECRET_KEY);
    await this.invalidate();
  }

  // ── Tiles ───────────────────────────────────────────────────────

  /**
   * Returns a Leaflet-ready tile URL template for a basemap slot.
   * Throws with a user-facing message if no key is set or the session fails.
   */
  async getTileUrlTemplate(id: BasemapId): Promise<string> {
    const apiKey = await this.requireApiKey();
    const session = await this.resolveSession(id, apiKey);
    return `${TILE_URL}/{z}/{x}/{y}?session=${session}&key=${encodeURIComponent(apiKey)}`;
  }

  /**
   * Returns the attribution string Google requires us to display for the
   * currently visible tiles, or `undefined` if it could not be retrieved.
   */
  async getAttribution(
    id: BasemapId,
    bounds: ViewportBounds,
    zoom: number,
  ): Promise<string | undefined> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return undefined;
    }
    try {
      const session = await this.resolveSession(id, apiKey);
      const query = new URLSearchParams({
        session,
        key: apiKey,
        zoom: String(Math.round(zoom)),
        north: String(bounds.north),
        south: String(bounds.south),
        east: String(bounds.east),
        west: String(bounds.west),
      });
      const response = await fetchJson<ViewportResponse>(`${VIEWPORT_URL}?${query.toString()}`);
      return response.error ? undefined : response.copyright;
    } catch {
      return undefined;
    }
  }

  /** Drops cached sessions so the next request re-runs `createSession`. */
  async invalidate(id?: BasemapId): Promise<void> {
    const cache = await this.loadCache();
    for (const key of Object.keys(cache) as BasemapId[]) {
      if (!id || key === id) {
        delete cache[key];
      }
    }
    await getGlobalState().update(CACHE_KEY, cache);
  }

  // ==================================================================
  // PRIVATE
  // ==================================================================

  private async requireApiKey(): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error(NO_API_KEY_MESSAGE);
    }
    return apiKey;
  }

  /** Merges the built-in preset with the user's override for a slot. */
  private buildRequest(id: BasemapId): CreateSessionRequest {
    const override = vscode.workspace
      .getConfiguration('earthengine.map.basemap')
      .get<Partial<CreateSessionRequest>>(id);
    const request: CreateSessionRequest = { ...BASEMAP_PRESETS[id], ...(override ?? {}) };
    // The API rejects `styles` on anything but roadmap.
    if (request.mapType !== 'roadmap') {
      delete request.styles;
    }
    return request;
  }

  /** Derives the IETF language tag and CLDR region from the VS Code locale. */
  private locale(): { language: string; region: string } {
    const language = vscode.env.language || 'en-US';
    const region = language.split('-')[1]?.toUpperCase() ?? 'US';
    return { language, region };
  }

  private async loadCache(): Promise<Partial<Record<BasemapId, CachedSession>>> {
    this.sessions ??= getGlobalState().get<Partial<Record<BasemapId, CachedSession>>>(
      CACHE_KEY,
      {},
    );
    return this.sessions;
  }

  /** Returns a live session token for a slot, creating one if needed. */
  private async resolveSession(id: BasemapId, apiKey: string): Promise<string> {
    const body = JSON.stringify({ ...this.buildRequest(id), ...this.locale() });
    const fingerprint = crypto.createHash('sha256').update(`${apiKey}\n${body}`).digest('hex');
    const now = Math.floor(Date.now() / 1000);

    const cache = await this.loadCache();
    const cached = cache[id];
    if (cached && cached.fingerprint === fingerprint && cached.expiry - EXPIRY_MARGIN_S > now) {
      return cached.session;
    }

    const pendingKey = `${id}\n${fingerprint}`;
    const pending = this.pendingSessions.get(pendingKey);
    if (pending) {
      return pending;
    }

    const operation = (async () => {
      const created = await this.createSession(apiKey, body);
      const latestCache = await this.loadCache();
      latestCache[id] = {
        session: created.session,
        expiry: Number(created.expiry),
        fingerprint,
      };
      await getGlobalState().update(CACHE_KEY, latestCache);
      return created.session;
    })();
    this.pendingSessions.set(pendingKey, operation);
    try {
      return await operation;
    } finally {
      this.pendingSessions.delete(pendingKey);
    }
  }

  private async createSession(apiKey: string, body: string): Promise<SessionResponse> {
    const url = `${CREATE_SESSION_URL}?key=${encodeURIComponent(apiKey)}`;
    let raw: string;
    try {
      raw = await postJson(url, body);
    } catch (err) {
      throw new Error(`Google Map Tiles: ${describeApiError(err)}`);
    }
    const parsed = JSON.parse(raw) as SessionResponse;
    if (!parsed.session) {
      throw new Error('Google Map Tiles: createSession returned no session token.');
    }
    return parsed;
  }
}

/** Pulls Google's `error.message` out of an `HTTP 4xx: {json}` rejection. */
function describeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const start = raw.indexOf('{');
  if (start === -1) {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw.slice(start)) as { error?: { message?: string } };
    return parsed.error?.message ?? raw;
  } catch {
    return raw;
  }
}
