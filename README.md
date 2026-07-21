# earthengine

Earth Engine Code Editor functionalities brought to VS Code.

## Development Setup

This project uses a **Dev Container** for development. This ensures a consistent environment with all dependencies pre-installed.

### Prerequisites

- [VS Code](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/) (running)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Getting Started

1. Clone the repository
2. Open the folder in VS Code
3. When prompted "Reopen in Container", click **Reopen in Container**
   - Alternatively: open the Command Palette (`Ctrl+Shift+P`) → `Dev Containers: Reopen in Container`
4. Wait for the container to build and `npm install` to complete (runs automatically via `postCreateCommand`)
5. The watch tasks start automatically — you're ready to develop

### Running the Extension

- Press `F5` to launch a new VS Code window (Extension Development Host) with the extension loaded
- The default build task (`Ctrl+Shift+B`) runs both `watch:esbuild` and `watch:tsc` in parallel for live compilation

### Useful Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Full build (type-check + lint + esbuild) |
| `npm run lint` | Run ESLint on `src/` |
| `npm run test` | Run tests |
| `npm run package` | Production build for publishing |

## Extension Settings

*Coming soon.*

## Release Notes

### 0.0.1

Initial development setup.
