---
applyTo: '**/*.ts'
---

# TypeScript conventions

- **Imports**: always use `.js` extensions in import paths (the project uses Node16 module resolution).
- **Module header**: every file starts with a `/** @module <name> */` header — a one-line summary, optionally followed by a longer description. Barrels (`index.ts`) get a one-liner naming what they re-export.
- **One class per file**: define each class in its own file, named (lowerCamelCase) after the class, so the filesystem alone reveals which components exist. A tree data provider and its tree item live in separate files (e.g. `tasksTreeDataProvider.ts` + `taskTreeItem.ts`); never two classes in one file. Constants/helpers owned by a class (its icon map, tooltip builder) live in that class's file and are exported when the provider also needs them.
- **JSDoc** on public APIs (exported functions, classes, and their methods).
- **Section separators**: divide long files with a three-line banner comment — a `=` bar, the UPPERCASE section name, another bar — using `//` line comments, indented to match the surrounding code for in-class / in-function sections:

  ```ts
  // ==================================================================
  // PUBLIC API
  // ==================================================================
  ```

- **Naming**: imports are camelCase or PascalCase (enforced by eslint's `naming-convention` rule).
