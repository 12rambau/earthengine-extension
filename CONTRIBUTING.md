# Contributing

Thank you for your interest in contributing to the Earth Engine VS Code Extension.

## Prerequisites

- [VS Code](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/) (running)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

## Development Setup

1. Fork and clone the repository
2. Open the folder in VS Code and reopen in the Dev Container when prompted
3. The container automatically runs `npm install` — no manual step needed
4. Press `F5` to launch an **Extension Development Host** window with the extension loaded

The default build task (`Ctrl+Shift+B`) runs `watch:esbuild` and `watch:tsc` in parallel for live compilation.

## Project Architecture

The extension follows a strict OOP structure:

- Every sidebar panel is a **`SidebarSection`** subclass (`src/sidebar/`)
- Every editor panel is an **`EditorPanel`** subclass (`src/editor/`)
- Shared HTTP utilities live in `src/shared/httpClient.ts`
- Shared WebView utilities live in `src/shared/webviewUtils.ts`

Do **not** add free-floating command registrations in `extension.ts` — create or extend a Section class instead.

### Adding a sidebar section

1. Create `src/sidebar/{name}/{name}Section.ts` extending `SidebarSection`
2. Create the tree data provider in the same folder
3. Export from `src/sidebar/{name}/index.ts`
4. Register in `src/extension.ts` `activate()`
5. Add view ID to `package.json` under `contributes.views.earthengine`
6. Add commands and menu entries to `package.json`

## Coding Conventions

- **Imports**: always use `.js` extensions in import paths (required by ESM)
- **Icons**: VS Code ThemeIcon codicons in tree views, inline SVG in WebViews — no emojis
- **Colors**: use `ThemeColor` tokens, never hardcoded hex values
- **Comments**: `/** @module */` header on new files, `// ── Section ──` separators in long files, JSDoc on public APIs
- **Lazy loading**: tree views return spinner placeholders immediately and load in background — see `assetsTreeDataProvider.ts` for the canonical pattern
- **Pagination**: server-side (`pageToken`) for large collections, not client-side

## Scripts

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `npm run compile`     | Full build (type-check + lint + esbuild)    |
| `npm run check-types` | TypeScript type-check only (`tsc --noEmit`) |
| `npm run lint`        | ESLint on `src/`                            |
| `npm run test`        | Run the test suite                          |
| `npm run package`     | Production build (used before publishing)   |

Always run `npm run check-types` before opening a pull request.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Validate JSON structure in `package.json` after any edits (orphan fragments are a recurring issue)
- Update `CHANGELOG.md` under `[Unreleased]` with a short description of your change
- Ensure `npm run compile` passes with no errors before requesting review
