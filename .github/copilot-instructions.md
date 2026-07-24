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
