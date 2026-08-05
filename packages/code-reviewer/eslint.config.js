import tseslint from "typescript-eslint";

// Compensating lint gate for this package: the root repo's ESLint ignores
// packages/code-reviewer/** (own tsconfig/module graph), so this config is the
// package's lint story. Typed rules run against the package's own tsconfig.
export default tseslint.config({
  files: ["src/**/*.ts"],
  extends: [...tseslint.configs.recommendedTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
