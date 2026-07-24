---
applyTo: '**'
---

# Earth Engine VS Code Extension — Copilot Instructions

## Project structure

This is a VS Code extension for Google Earth Engine. Read `.github/ARCHITECTURE.md` for the full architecture overview.

## Key rules

- **OOP**: every sidebar panel is a `SidebarSection` subclass, every editor panel is an `EditorPanel` subclass. Do not add free-floating command registrations in `extension.ts` — create or extend a Section class.
- **Shared code**: HTTP utilities go in `src/shared/httpClient.ts`, HTML/WebView utilities go in `src/shared/webviewUtils.ts`. Never duplicate these.
- **Imports**: always use `.js` extensions in import paths.
- **No emojis**: use VS Code ThemeIcon codicons in tree views, inline SVG in WebViews.
- **Comments**: add `/** @module */` headers on new files, `// ── Section ──` separators in long files, JSDoc on public APIs. In `.css` files, group rules by component with three-line banner comments (a `=` bar, the UPPERCASE section name, another bar) so sections stand out in the minimap.
- **package.json**: be careful with JSON structure — orphan fragments are a recurring issue. Validate after edits.
- **Lazy loading pattern**: tree views return spinner placeholders immediately, load in background, then fire `_onDidChangeTreeData`. See `assetsTreeDataProvider.ts` for the canonical example.
- **Pagination**: server-side (API pageToken) for large collections, not client-side.

## WebView panels: hbs + css + webview.js

Every WebView panel is assembled from three sibling files, all bundled as plain strings by esbuild (`.hbs`/`.css` via the `text` loader, `.webview.js` via the `webview-script-text` plugin; type declarations in `src/templates.d.ts`):

1. `{name}Panel.hbs` — Handlebars template, markup only. Inject the other two with `<style>{{{style}}}</style>` and `<script>{{{script}}}</script>` (add `nonce="{{nonce}}"` when the panel sets a CSP). Never hard-code CSS or JS in a template.
2. `{name}Panel.css` — stylesheet, VS Code theme variables only (`var(--vscode-...)`). Group rules by component behind three-line banner comments so related styles read as a block and stand out in the minimap:

   ```css
   /* ==================================================================
      TOOLBAR
      ================================================================== */
   ```

3. `{name}Panel.webview.js` — browser-side script (classic script, not a module). The `.webview.js` suffix is required — esbuild and eslint match on it.

In the panel's `.ts`:

```ts
import { renderTemplate } from '../../shared/index.js';
import template from './{name}Panel.hbs';
import style from './{name}Panel.css';
import script from './{name}Panel.webview.js';

panel.webview.html = renderTemplate(template, { style, script /*, ...values */ });
```

- Handlebars escapes `{{value}}`; use `{{{value}}}` only for trusted HTML/CSS/JS/JSON fragments.
- The `.webview.js` file must stay valid static JavaScript — no Handlebars placeholders inside it. To pass data from the extension host, render it into a JSON script tag in the template (`<script id="init-data" type="application/json">{{{initJson}}}</script>`) and read it with `JSON.parse(document.getElementById('init-data').textContent)`. See `assetsPanel` for the canonical example.
- Formatting/linting runs via lint-staged on commit: prettier formats `.hbs` with the HTML parser and `embeddedLanguageFormatting: off` (embedded formatting would mangle `{{{...}}}` inside `<script>` tags — keep it off), and `.webview.js` files have their own eslint block in `eslint.config.mjs`.

## Testing changes

```bash
npx tsc --noEmit   # type check
node esbuild.js    # build
# F5 to launch Extension Development Host
```

## When adding a new sidebar section

1. Create `src/sidebar/{name}/{name}Section.ts` extending `SidebarSection`
2. Create the tree data provider in the same folder
3. Export from `src/sidebar/{name}/index.ts`
4. Register in `src/extension.ts` activate()
5. Add view ID to `package.json` under `contributes.views.earthengine`
6. Add commands to `package.json` under `contributes.commands`
7. Add menu entries to `package.json` under `contributes.menus`

## When adding a new editor panel

1. Create `src/editor/{name}/{name}Panel.ts` (function or EditorPanel subclass)
2. Create the WebView files next to it: `{name}Panel.hbs`, `{name}Panel.css`, `{name}Panel.webview.js` (see "WebView panels" above)
3. Export from `src/editor/{name}/index.ts`
4. Import and call from the relevant SidebarSection
