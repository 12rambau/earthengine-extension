# Release Process

This document describes how to release the Earth Engine VS Code Extension to the VS Code Marketplace.

The release process is automated via [`release-it`](https://github.com/release-it/release-it) locally and a GitHub Actions pipeline triggered by a GitHub Release publication.

## Prerequisites

- A Personal Access Token (PAT) for Azure DevOps with **Marketplace (publish)** scope, stored as a GitHub secret named `VSCE_PAT`
- All commits on `main` following the [Conventional Commits](https://conventionalcommits.org) spec (enforced by the `commit-msg` hook)

## Steps

### 1. Run `release-it`

```bash
npm run release
```

This will:

- Analyse conventional commits since the last tag to determine the version bump (patch / minor / major)
- Prompt for confirmation
- Update `CHANGELOG.md`
- Bump `version` in `package.json`
- Create a commit `chore(release): vx.y.z`
- Create a git tag `vx.y.z`
- Push the commit and tag to GitHub

### 2. Create the GitHub Release

1. Go to **GitHub → Releases → Draft a new release**
2. Select the tag just pushed (e.g. `v0.2.0`)
3. Click **Generate release notes** — PR titles are pulled automatically
4. Check **Set as pre-release** if this is a beta
5. Click **Publish release**

### 3. CI publishes automatically

Publishing the GitHub Release triggers the `.github/workflows/release.yml` pipeline which:

- Builds the `.vsix` (with `--pre-release` flag if the GitHub Release is marked as pre-release)
- Publishes to the VS Code Marketplace using the `VSCE_PAT` secret

No manual `vsce` command is needed.

---

## Renewing the VSCE_PAT

The PAT expires after 1 year. To renew:

1. Go to [dev.azure.com](https://dev.azure.com) → your account → **Personal access tokens**
2. Create a new token: **Organization: All**, **Scope: Marketplace → Manage**
3. Update the secret in **GitHub → Settings → Secrets → Actions → `VSCE_PAT`**

## Versioning policy

`release-it` determines the bump automatically from conventional commit types. For reference:

| Commit type                    | Version bump      |
| ------------------------------ | ----------------- |
| `fix:`                         | patch             |
| `feat:`                        | minor             |
| `feat!:` or `BREAKING CHANGE:` | major             |
| `chore:`, `docs:`, `style:`    | none (no release) |
