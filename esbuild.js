/**
 * @module esbuild
 * Build script: bundles the extension with esbuild, inlining WebView templates,
 * stylesheets and client scripts as text (see the loader config and the
 * webview-script-text plugin).
 */

const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * WebView client scripts (`*.webview.js`) are inlined into panel HTML as text.
 * Each entry point may import component modules from a sibling `webview/`
 * folder, so we run a nested esbuild bundle (IIFE, browser platform) before
 * returning the result as text.  The `metafile` is used to tell the outer
 * watcher about every input file so that changes to component modules also
 * trigger a rebuild.
 *
 * @type {import('esbuild').Plugin}
 */
const webviewScriptTextPlugin = {
  name: 'webview-script-text',

  setup(build) {
    build.onLoad({ filter: /\.webview\.[jt]s$/ }, async (args) => {
      const result = await esbuild.build({
        entryPoints: [args.path],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        write: false,
        minify: production,
        sourcemap: false,
        metafile: true,
        plugins: [sveltePlugin({ compilerOptions: { css: 'injected' } })],
      });
      return {
        contents: result.outputFiles[0].text,
        loader: 'text',
        // Propagate all bundled inputs so the outer watcher re-runs when any
        // component file changes.
        watchFiles: Object.keys(result.metafile.inputs),
      };
    });
  },
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    // WebView templates and stylesheets are imported as plain strings
    loader: { '.hbs': 'text', '.css': 'text' },
    logLevel: 'silent',
    plugins: [
      webviewScriptTextPlugin,
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
