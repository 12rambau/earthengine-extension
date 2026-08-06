---
applyTo: '**/*.svelte'
---

# Svelte conventions (WebView components)

Covers panel root components (`src/editor/**/*.svelte`, `src/panel/**/*.svelte`) and shared components (`src/shared/*.svelte`).

## Build pipeline

Each root `.svelte` file is imported by a host `.ts` file as a text string:

```ts
import script from './MyPanel.svelte';
```

The `webview-script-text` esbuild plugin intercepts this import, generates a virtual `mount()` bootstrap, bundles the component tree (including all Svelte imports and `src/shared/*.svelte` dependencies) into a single IIFE, and returns the result as text. The host injects that text into a `<script>` tag in the WebView HTML shell.

## File structure

A Svelte-based editor panel consists of exactly **two files**:

```
src/editor/{name}/
├── {Name}.svelte          ← browser-side: template + logic + styles
└── {name}Panel.ts         ← host-side: creates the WebView, fetches data, handles messages
```

Shared reusable components live in `src/shared/`:

```
src/shared/
├── Pagination.svelte
├── ColumnPicker.svelte
└── vscode.ts              ← acquireVsCodeApi() + getInitData() helpers
```

## Component header

Every `.svelte` file starts with a one-line HTML comment describing what the component does:

```svelte
<!-- MyPanel: brief description of purpose -->
```

No `@module` JSDoc — the HTML comment is the header.

## Script block

- Use **Svelte 5 runes** exclusively: `$state`, `$derived`, `$derived.by`, `$props`, `$bindable`. Do not use Svelte 4 `export let`, `$:` reactive statements, or the `on:` event directive.
- Declare all mutable state with `$state` at the top of `<script>`.
- Use `$derived` / `$derived.by` for computed values — no manual recalculation in event handlers.
- Event handlers use the Svelte 5 `onclick={handler}` attribute syntax, not `on:click`.
- Import shared helpers from `../../shared/vscode.ts`:

  ```js
  import { vscode, getInitData } from '../../shared/vscode.ts';
  ```

- Call `getInitData()` once at module level and store in `const data`.
- Register `window.addEventListener('message', ...)` at module level (not inside `onMount`) — the panel receives messages immediately after mount.

## Script block structure and comments

Divide the `<script>` block into named sections with a two-line `//` banner whenever a component is long enough that sections aid orientation. Use these standard section names:

```js
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let foo = $state(0);

// ----------------------------------------------------------------
// DERIVED
// ----------------------------------------------------------------
let bar = $derived(foo * 2);

// ----------------------------------------------------------------
// MESSAGES
// ----------------------------------------------------------------
window.addEventListener('message', (e) => { ... });

// ----------------------------------------------------------------
// ACTIONS
// ----------------------------------------------------------------
function cancelTask(name) { ... }

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function formatTime(t) { ... }
```

Rules:

- **Always** use section banners in components with more than ~40 lines in `<script>`.
- Omit a section if it has no content (e.g., no HELPERS).
- A single inline `//` comment is enough for non-obvious $derived expressions.
- Constants (column definitions, tab lists) go above STATE, no banner needed.

## Template comments

Use `<!-- SECTION NAME -->` comments to label major layout blocks in the template, especially in panels with sidebars, tab panels, or complex tables:

```svelte
<!-- SIDEBAR -->
<aside class="sidebar">...</aside>

<!-- TABS -->
<nav class="tabs">...</nav>

<!-- TAB: description -->
<section class="tab-panel" ...>...</section>
```

Keep template comments on their own line, directly above the element they label.

## init-data bridge

The host `.ts` serialises data into a `<script id="init-data" type="application/json">` tag. The Svelte component reads it via `getInitData()`. Keep all data the component needs at load time in this JSON object; use `postMessage` only for async updates after the panel is visible.

## postMessage protocol

- Send to host: `vscode.postMessage({ type: '...', ...payload })`.
- Receive from host: handle in the `window.addEventListener('message', ...)` callback.
- Update reactive state directly in the message handler — Svelte will re-render only what changed.

## Styles

- All styles live in a `<style>` block at the bottom of the `.svelte` file. No separate `.css` file.
- Wrap the entire style block in `:global { }` because panels use `{@html ...}` to inject server-rendered HTML (tables, descriptions) that Svelte cannot scope:

  ```svelte
  <style>
    :global {
      .my-class { ... }
    }
  </style>
  ```

- Follow the same CSS conventions as `css.instructions.md`: VS Code theme variables only, section banners for grouping.
- The host CSP uses `style-src 'unsafe-inline'` to allow Svelte's injected `<style>` tags.

## Shared components (`src/shared/*.svelte`)

- Use `$props()` with `$bindable()` for two-way bindings:

  ```js
  let { value = $bindable(), onChange } = $props();
  ```

- Do **not** wrap shared component styles in `:global` — use normal Svelte scoping so styles don't leak.
- Export nothing from the script block; props are the public API.

## {@html} safety

`{@html ...}` is used for server-pre-rendered content (description HTML from `marked`, properties tables). This content is built by the host `.ts` using `escapeHtml()` on user-provided values. Do not use `{@html}` for any string that originates from a `postMessage` payload without escaping.
