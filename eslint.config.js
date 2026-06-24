/* eslint-disable @typescript-eslint/no-deprecated -- tseslint.config() is the only way to use extends; core defineConfig has incompatible API */
import { includeIgnoreFile } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import pluginReact from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = tseslint.config({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

const reactConfig = tseslint.config({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [pluginReact.configs.flat.recommended],
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  plugins: {
    "react-hooks": eslintPluginReactHooks,
    "react-compiler": reactCompiler,
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...eslintPluginReactHooks.configs.recommended.rules,
    "react/react-in-jsx-scope": "off",
    "react-compiler/react-compiler": "error",
  },
});

// Root config files (astro.config.mjs, etc.) run under Node at build time, so
// `process` and friends are valid globals there. ESLint's recommended `no-undef`
// otherwise errors on `process.env` reads — e.g. Sentry sourceMapsUploadOptions,
// which pulls org/project/authToken from the CI build env.
const nodeConfigFilesConfig = tseslint.config({
  files: ["*.config.{js,mjs,cjs,ts}"],
  languageOptions: {
    globals: {
      process: "readonly",
      console: "readonly",
      __dirname: "readonly",
      module: "writable",
      require: "readonly",
    },
  },
});

const astroConfig = tseslint.config({
  files: ["**/*.astro"],
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
    // astro-eslint-parser wraps frontmatter in an implicit function whose
    // top-level `return` (e.g. `return Astro.redirect(...)` guards) has no
    // parent node, which crashes this typed rule's checkReturnStatement.
    // The frontmatter runs server-side once per request, so the void-return
    // misuse this rule guards against does not apply to .astro files.
    "@typescript-eslint/no-misused-promises": "off",
  },
});

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  // Supabase Edge Functions run under Deno (URL imports, `Deno.*` globals, a
  // deno.json import map) — they are not part of the Astro/tsc project graph.
  // Linting them with the typed projectService would error; they have their own
  // runtime. Excluded from tsconfig too (see tsconfig.json "exclude").
  { ignores: ["supabase/functions/**"] },
  // Generated esbuild IIFE bundles (e.g. the committed A/B tuning-harness build
  // artifact) are machine-emitted, not authored — linting them is noise.
  { ignores: ["**/*.iife.js"] },
  baseConfig,
  nodeConfigFilesConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  ...eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  eslintPluginPrettier,
);
