/** @module lint-staged configuration */
// prettier and eslint receive the staged file list.
// tsc always runs on the full project (it does not accept individual file args).
module.exports = {
  'src/**/*.ts': ['prettier --write', 'eslint --max-warnings=0', () => 'tsc --noEmit'],
  'src/**/*.css': ['prettier --write'],
  '*.{js,mjs}': ['prettier --write'],
  '*.{json,md}': ['prettier --write'],
};
