/**
 * @module esbuild
 * Build script: bundles the extension with esbuild, inlining WebView templates,
 * stylesheets and client scripts as text (see the loader config and the
 * webview-script-text plugin).
 */

const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * WebView client scripts (`*.webview.js`) are inlined into panel HTML, so
 * they are bundled as plain text instead of being parsed as modules.
 * The `.js` loader cannot be overridden globally without breaking normal
 * module resolution, hence this targeted plugin.
 *
 * @type {import('esbuild').Plugin}
 */
const webviewScriptTextPlugin = {
  name: 'webview-script-text',

  setup(build) {
    build.onLoad({ filter: /\.webview\.js$/ }, async (args) => ({
      contents: await fs.promises.readFile(args.path, 'utf8'),
      loader: 'text',
    }));
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
