/** @module lint-staged configuration */
// prettier and eslint receive the staged file list.
// tsc always runs on the full project (it does not accept individual file args).
// `!(*.webview).js` excludes WebView client scripts, which have their own entry.
module.exports = {
  'src/**/*.ts': ['prettier --write', 'eslint --max-warnings=0', () => 'tsc --noEmit'],
  'src/**/*.webview.js': ['prettier --write', 'eslint --max-warnings=0'],
  'src/**/*.{css,hbs}': ['prettier --write'],
  '!(*.webview).{js,mjs}': ['prettier --write'],
  '*.{json,md}': ['prettier --write'],
};
