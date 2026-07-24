/**
 * WebView templates and stylesheets are bundled as plain strings
 * by the esbuild `text` loader (see esbuild.js).
 */
declare module '*.hbs' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.webview.js' {
  const content: string;
  export default content;
}
