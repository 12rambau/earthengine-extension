---
applyTo: '**/*.js'
---

# JavaScript conventions

Covers build/config scripts (`esbuild.js`, `*.config.js`, `.lintstagedrc.js`) and WebView client scripts (`*.webview.js`).

- **Module header**: every file starts with a `/** @module <name> */` header (one-line summary, optional longer description).
- **Section separators**: divide long files with a three-line `//` banner comment — a `=` bar, the UPPERCASE section name, another bar:

  ```js
  // ==================================================================
  // SECTION
  // ==================================================================
  ```

## WebView client scripts (`*.webview.js`)

- A browser-side **ES module entry point** inlined into panel HTML as an IIFE by the `webview-script-text` esbuild plugin (which runs a nested bundle before returning the text). Keep the `.webview.js` suffix — the plugin matches on it.
- Must stay **valid static JavaScript** — no Handlebars placeholders inside. To receive data from the extension host, read a JSON script tag the template renders: `JSON.parse(document.getElementById('init-data').textContent)`. See `assetsPanel` for the canonical example.
- Runtime values from `init-data` that components need (basemap IDs, the `vscode` handle, etc.) are read in the entry point and passed to component `init*()` functions.
- Has its own eslint block in `eslint.config.mjs` (`sourceType: 'module'`).

## WebView component modules (`src/**/webview/**/*.js`)

- ES modules imported by a `*.webview.js` entry point and bundled together into the IIFE by the nested esbuild step — use `import`/`export` freely.
- **One component per file**: whenever you start building something that looks like a component — a cohesive unit of state, DOM queries and event listeners around a single UI region — extract it into its own module. File name describes what it owns (e.g. `scaleBar.js`, `inspector.js`).
- Files live in a `webview/` folder next to the panel they serve: `src/map/webview/`, `src/editor/{name}/webview/`, etc.
- Use named `init*()` functions to receive runtime config that cannot be statically imported.
- Prefer named exports. Side-effect-only modules (event wiring with no public API) are imported for their side effects: `import './webview/statusBar.js'`.
- The outer esbuild watcher is informed of all component files via `watchFiles` in the plugin, so edits to components trigger a full rebuild automatically.
