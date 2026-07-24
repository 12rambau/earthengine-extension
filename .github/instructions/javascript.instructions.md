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

- A browser-side **classic script**, not an ES module. It is inlined into panel HTML as text by esbuild's `webview-script-text` plugin and is matched by the `.webview.js` suffix — keep the suffix.
- Must stay **valid static JavaScript** — no Handlebars placeholders inside. To receive data from the extension host, read a JSON script tag the template renders: `JSON.parse(document.getElementById('init-data').textContent)`. See `assetsPanel` for the canonical example.
- Has its own eslint block in `eslint.config.mjs` (`sourceType: 'script'`).
