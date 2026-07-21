---
applyTo: "**"
---

# Earth Engine VS Code Extension — Copilot Instructions

## Project structure

This is a VS Code extension for Google Earth Engine. Read `.github/ARCHITECTURE.md` for the full architecture overview.

## Key rules

- **OOP**: every sidebar panel is a `SidebarSection` subclass, every editor panel is an `EditorPanel` subclass. Do not add free-floating command registrations in `extension.ts` — create or extend a Section class.
- **Shared code**: HTTP utilities go in `src/shared/httpClient.ts`, HTML/WebView utilities go in `src/shared/webviewUtils.ts`. Never duplicate these.
- **Imports**: always use `.js` extensions in import paths.
- **No emojis**: use VS Code ThemeIcon codicons in tree views, inline SVG in WebViews.
- **Comments**: add `/** @module */` headers on new files, `// ── Section ──` separators in long files, JSDoc on public APIs.
- **package.json**: be careful with JSON structure — orphan fragments are a recurring issue. Validate after edits.
- **Lazy loading pattern**: tree views return spinner placeholders immediately, load in background, then fire `_onDidChangeTreeData`. See `assetsTreeDataProvider.ts` for the canonical example.
- **Pagination**: server-side (API pageToken) for large collections, not client-side.

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
2. Export from `src/editor/{name}/index.ts`
3. Import and call from the relevant SidebarSection
