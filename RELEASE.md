# Release Process

This document describes how to build, package, and publish the Earth Engine VS Code Extension to the VS Code Marketplace.

## Prerequisites

- `vsce` (VS Code Extension CLI): `npm install -g @vscode/vsce`
- A Personal Access Token (PAT) for the Azure DevOps publisher account with **Marketplace (publish)** scope
- A `publisher` field set in `package.json`

## Steps

### 1. Prepare the release

1. Decide the next version following [Semantic Versioning](https://semver.org/):
   - **patch** (`0.0.x`) — bug fixes
   - **minor** (`0.x.0`) — new features, backwards compatible
   - **major** (`x.0.0`) — breaking changes

2. Update `CHANGELOG.md`:
   - Rename `## [Unreleased]` to `## [x.y.z] — YYYY-MM-DD`
   - Add a new empty `## [Unreleased]` section at the top

3. Bump the version in `package.json`:
   ```bash
   npm version patch   # or minor / major
   ```
   This also creates a git tag (`vx.y.z`).

### 2. Build and verify

```bash
npm run compile       # type-check + lint + build
npm run test          # run the test suite
```

Verify the packaged output manually:

```bash
vsce package
# Produces earthengine-x.y.z.vsix
```

Install the `.vsix` locally to smoke-test before publishing:

```bash
code --install-extension earthengine-x.y.z.vsix
```

### 3. Publish

```bash
vsce publish
```

Or publish a pre-built package:

```bash
vsce publish --packagePath earthengine-x.y.z.vsix
```

### 4. Tag and push

```bash
git push origin main --tags
```

## Files included in the package

`vsce` respects `.vscodeignore`. Ensure the following are excluded:

```
.devcontainer/
.github/
src/
out/
python/
*.vsix
tsconfig.json
esbuild.js
eslint.config.mjs
```

Ensure `dist/extension.js` and `resources/` are **not** ignored.

## Versioning policy

| Change type | Version bump |
|---|---|
| Bug fix | patch |
| New sidebar section or command | minor |
| Breaking change to settings or activation | major |
| Dependency security update | patch |
