/** @module lint-staged configuration */
// prettier and eslint receive the staged file list.
// tsc always runs on the full project (it does not accept individual file args).
module.exports = {
  'src/**/*.ts': ['prettier --write', 'eslint --max-warnings=0', () => 'tsc --noEmit'],
  '*.{js,mjs,json,md}': ['prettier --write'],
};
