/** @module lint-staged configuration */
// ESLint receives the staged file list; tsc always runs on the full project.
module.exports = {
  'src/**/*.ts': [
    'eslint --max-warnings=0',
    () => 'tsc --noEmit',
  ],
};
