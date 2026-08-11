import tseslint from "typescript-eslint";

// Compensating lint gate for this package: the root repo's ESLint ignores
// packages/code-reviewer/** (own tsconfig/module graph), so this config is the
// package's lint story. Typed rules run against the package's own tsconfig.
export default tseslint.config(
  // Eval fixtures are DATA, not package source — deliberately-flawed files
  // served to the finder, which must stay byte-for-byte identical to the diff
  // that names them (mirrors the tsconfig "exclude"). Linting them would
  // pressure an author into "fixing" a planted flaw and silently break the
  // diff<->disk contract. Same rule as the generated-bundle lesson: never
  // hand-fix lint errors inside a machine- or fixture-authored artifact.
  { ignores: ["evals/fixtures/**"] },
  {
    files: ["src/**/*.ts", "evals/**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
