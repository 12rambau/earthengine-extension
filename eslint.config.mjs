import typescriptEslint from 'typescript-eslint';

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
    // WebView client scripts: classic browser scripts inlined into panel HTML
    files: ['src/**/*.webview.js'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
    },

    rules: {
      curly: 'warn',
      // `== null` / `!= null` intentionally cover both null and undefined
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-throw-literal': 'warn',
      semi: 'warn',
    },
  },
];
