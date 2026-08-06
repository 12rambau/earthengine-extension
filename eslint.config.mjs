import typescriptEslint from 'typescript-eslint';
import sveltePlugin from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default [
  {
    files: ['**/*.ts'],

    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
    },

    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },

    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],

      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      semi: 'warn',
    },
  },
  {
    // WebView entry points: classic-looking scripts that are now ES module entry
    // points bundled to IIFE by the webview-script-text esbuild plugin.
    files: ['src/**/*.webview.js'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },

    rules: {
      curly: 'warn',
      // `== null` / `!= null` intentionally cover both null and undefined
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-throw-literal': 'warn',
      semi: 'warn',
    },
  },
  {
    // WebView component modules: ES modules imported by *.webview.js entry points
    // and bundled by the nested esbuild step inside webview-script-text.
    files: ['src/**/webview/**/*.js'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },

    rules: {
      curly: 'warn',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-throw-literal': 'warn',
      semi: 'warn',
    },
  },
  {
    files: ['**/*.svelte'],

    plugins: {
      svelte: sveltePlugin,
    },

    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: typescriptEslint.parser,
      },
    },

    rules: {
      ...sveltePlugin.configs.recommended.rules,
      curly: 'warn',
      eqeqeq: 'warn',
      semi: 'warn',
    },
  },
];
