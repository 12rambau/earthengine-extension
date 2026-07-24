---
applyTo: '**'
---

# Earth Engine VS Code Extension — Copilot Instructions

Architecture and cross-cutting rules. Per-file-type conventions (module headers, section
banners, formatting) live in `.github/instructions/*.instructions.md` — one each for
`typescript`, `javascript`, `css`, and `hbs`; they apply automatically by file glob.

## Project structure

This is a VS Code extension for Google Earth Engine. Read `.github/ARCHITECTURE.md` for the full architecture overview.

## Key rules

- **OOP**: every sidebar panel is a `SidebarSection` subclass, every editor panel is an `EditorPanel` subclass. Do not add free-floating command registrations in `extension.ts` — create or extend a Section class.
- **One class per file**: each class in its own file, named after it, so the filesystem reveals the components (a tree data provider and its tree item are separate files). See the TypeScript instructions for details.
- **Shared code**: HTTP utilities go in `src/shared/httpClient.ts`, HTML/WebView utilities go in `src/shared/webviewUtils.ts`. Never duplicate these.
- **No emojis**: use VS Code ThemeIcon codicons in tree views, inline SVG in WebViews.
- **Lazy loading pattern**: tree views return spinner placeholders immediately, load in the background, then fire `_onDidChangeTreeData`. See `assetsTreeDataProvider.ts` for the canonical example.
- **Pagination**: server-side (API pageToken) for large collections, not client-side.
- **package.json**: be careful with JSON structure — orphan fragments are a recurring issue. Validate after edits.

## Anatomy of a WebView panel

Every editor panel is a `.ts` module plus three sibling files, all bundled as plain strings by esbuild (`.hbs`/`.css` via the `text` loader, `.webview.js` via the `webview-script-text` plugin; type declarations in `src/templates.d.ts`):

- `{name}Panel.ts` — creates the WebView panel and renders the template.
- `{name}Panel.hbs` — markup.
- `{name}Panel.css` — styles.
- `{name}Panel.webview.js` — browser-side script.

The `.ts` imports the three files and injects them:

```ts
import { renderTemplate } from '../../shared/index.js';
import template from './{name}Panel.hbs';
import style from './{name}Panel.css';
import script from './{name}Panel.webview.js';

panel.webview.html = renderTemplate(template, { style, script /*, ...values */ });
```

The rules each sibling follows (theme variables, escaping, the `init-data` bridge, etc.) are in the `hbs`, `css`, and `javascript` instruction files.

## Talking to Earth Engine (two layers, on purpose)

The extension reaches Earth Engine two different ways, and the split is deliberate — **do not** try to route everything through one client.

- **Computation → the `@google/earthengine` JS client**, via `src/shared/eeSession.ts`. Use it to build and evaluate server-side graphs: `ee.Image`/`ee.ImageCollection`/`ee.Reducer`, `getThumbURL`, `reduceRegion().evaluate()`, etc. This is what the preview panels use for thumbnails and band min/max, and it reads like the Python/JS EE API instead of hand-built request JSON. `eeSession` owns the singleton client: it registers a token refresher wired to `AuthService`, initializes lazily per project, and re-initializes on profile change. Auth is injected via `setAuthToken` — the client never sees the refresh token or private key.
- **Metadata CRUD → the REST client** (`src/shared/httpClient.ts` + `sidebar/assets/eeApiClient.ts`, `sidebar/tasks/tasksApiClient.ts`). `listAssets`, `getAsset`, `listFeatures`, `listOperations`, delete/move/copy, etc. go through hand-rolled `https` calls. These are already readable one-liners and, importantly, they **work reliably in the extension host** (see below).

**Known issue — `ee.data.*` fails in the extension host.** The JS client's metadata calls (`ee.data.getAsset`, and by extension `listAssets`/`listOperations`) throw `Invalid JSON: Error: Parse Error: JS Exception` (a Node HTTP-layer error surfaced at `TLSSocket.socketOnData`) when run in the VS Code extension host. What we established while investigating:

- The compute calls and `ee.data.*` share **one transport**: `apiclient.send` → async → `goog.net.XhrIo` → the bundled `xmlhttprequest@1.8.0` package → Node `https.request` (`agent: false`). Compute POSTs succeed; `getAsset` GET fails.
- The error message is `xmlhttprequest` stuffing a Node request error's `.stack` into `responseText`, which the client then fails to `JSON.parse`. The real error is a Node HTTP response parse error.
- In **plain Node** that same package handles GET, POST, small and large (6.8 MB) responses against the live endpoints with no error — so the transport is fine outside the extension host, and it is not a response-size or shape problem.
- Our own direct-`https` REST client hits the same endpoints fine **inside** the extension host, so it is not Google sending bad headers or a strict-parser issue with these endpoints.
- Toggling `http.proxySupport` (`off`/`on`/`fallback`/`override`, with a window reload each time) did **not** change it, so `@vscode/proxy-agent` is not (solely) the cause.

Root cause is still open (escalated to EE API experts). Until it's resolved: **keep metadata on the REST client**, use the EE JS client only for computation. There is a temporary probe (`probeEeGetAsset`, marked `TEMP PROBE`) in `editor/assets/assetPreviewPanel.ts` that logs `ee.data.getAsset` success/failure to the Debug Console — handy for retesting fixes; remove it once resolved.

**Cost:** bundling the EE client adds ~7.7 MB minified (~18 MB dev) to `dist/extension.js` — the Google Closure library it carries. Accepted for the computation-readability win.

## Testing changes

```bash
npx tsc --noEmit   # type check
node esbuild.js    # build
# F5 to launch Extension Development Host
```

## When adding a new sidebar section

1. Create `src/sidebar/{name}/{name}Section.ts` extending `SidebarSection`
2. Create the tree data provider — and its tree item, in its own file — in the same folder
3. Export from `src/sidebar/{name}/index.ts`
4. Register in `src/extension.ts` activate()
5. Add view ID to `package.json` under `contributes.views.earthengine`
6. Add commands to `package.json` under `contributes.commands`
7. Add menu entries to `package.json` under `contributes.menus`

## When adding a new editor panel

1. Create `src/editor/{name}/{name}Panel.ts` (function or EditorPanel subclass)
2. Create the WebView files next to it: `{name}Panel.hbs`, `{name}Panel.css`, `{name}Panel.webview.js` (see "Anatomy of a WebView panel")
3. Export from `src/editor/{name}/index.ts`
4. Import and call from the relevant SidebarSection
