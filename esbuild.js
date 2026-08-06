/**
 * @module esbuild
 * Build script: bundles the extension with esbuild, inlining WebView templates,
 * stylesheets and client scripts as text (see the loader config and the
 * webview-script-text plugin).
 */

const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Svelte root components are bundled into a self-contained IIFE and returned
 * as a text string so the host can inline them in the WebView HTML shell.
 *
 * A virtual bootstrap (`mount(App, ...)`) is generated on-the-fly so the
 * component file itself needs no bootstrap wrapper.
 *
 * @type {import('esbuild').Plugin}
 */
const webviewScriptTextPlugin = {
  name: 'webview-script-text',

  setup(build) {
    build.onLoad({ filter: /\.(svelte|webview\.[jt]s)$/ }, async (args) => {
      let buildOptions;
      if (args.path.endsWith('.svelte')) {
        // Generate a mount bootstrap so the component file needs no wrapper.
        const bootstrap = [
          `import { mount } from 'svelte';`,
          `import App from ${JSON.stringify(args.path)};`,
          `mount(App, { target: document.getElementById('app') });`,
        ].join('\n');
        buildOptions = {
          stdin: { contents: bootstrap, resolveDir: path.dirname(args.path), loader: 'js' },
        };
      } else {
        buildOptions = { entryPoints: [args.path] };
      }
      const result = await esbuild.build({
        ...buildOptions,
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
    loader: { '.css': 'text' },
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
