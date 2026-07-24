---
applyTo: '**/*.css'
---

# CSS conventions (WebView stylesheets)

- **Theme variables only**: every color is a VS Code theme token (`var(--vscode-...)`). No hardcoded hex/rgb literals, and no literal fallbacks (`var(--x, #hex)`) — workbench tokens are always defined in a webview, so bare `var(--x)` is correct. Use `var(--vscode-widget-shadow)` for `box-shadow`. The one unavoidable exception is a color baked inside a `url("data:image/svg+xml,...")` — `var()` cannot reach into a data URI, so keep a theme-neutral gray there.
- **Section separators**: group rules by component behind a three-line banner comment (a `=` bar, the UPPERCASE section name, another bar) so related styles read as a block and stand out in the minimap:

  ```css
  /* ==================================================================
     TOOLBAR
     ================================================================== */
  ```
