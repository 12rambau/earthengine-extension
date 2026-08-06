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
