---
applyTo: '**/*.hbs'
---

# Handlebars template conventions (WebView markup)

- **Markup only** — no hardcoded CSS or JS. Inject the sibling stylesheet and script with `<style>{{{style}}}</style>` and `<script>{{{script}}}</script>` (add `nonce="{{nonce}}"` when the panel sets a CSP). Templates are bundled as text by esbuild's `.hbs` `text` loader.
- **Escaping**: Handlebars escapes `{{value}}`; use `{{{value}}}` (triple-stash) only for trusted HTML/CSS/JS/JSON fragments.
- **Host → script data**: pass data through a JSON script tag the client script reads, e.g. `<script id="init-data" type="application/json">{{{initJson}}}</script>`.
- **Formatting**: prettier formats `.hbs` with the HTML parser and `embeddedLanguageFormatting: off` — keep it off, otherwise embedded formatting mangles `{{{...}}}` inside `<script>` tags.
