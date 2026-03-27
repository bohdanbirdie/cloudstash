import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import { livestoreDevtoolsPlugin } from "@livestore/devtools-vite";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    quoteProps: "as-needed",
    jsxSingleQuote: false,
    trailingComma: "es5",
    bracketSpacing: true,
    bracketSameLine: false,
    arrowParens: "always",
    endOfLine: "lf",
    experimentalSortPackageJson: true,
    experimentalSortImports: {
      ignoreCase: true,
      newlinesBetween: true,
      order: "asc",
    },
    ignorePatterns: [
      "dist",
      "node_modules",
      "**/*.d.ts",
      "**/*.gen.ts",
      "src/routeTree.gen.ts",
      "coverage",
      "readonly-llm-lookup",
    ],
  },
  lint: {
    plugins: [
      "eslint",
      "typescript",
      "unicorn",
      "oxc",
      "import",
      "jsdoc",
      "node",
      "promise",
      "react",
      "react-perf",
      "jsx-a11y",
    ],
    env: { browser: true },
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "off",
      restriction: "off",
      pedantic: "off",
      style: "off",
    },
    ignorePatterns: ["readonly-llm-lookup"],
    rules: {
      "no-await-in-loop": "off",
      "max-lines-per-function": "off",
      "no-implicit-coercion": "off",
      "no-magic-numbers": "off",
      "no-console": "off",
      "no-ternary": "off",
      "no-undefined": "off",
      "max-lines": "off",
      "id-length": "off",
      "func-style": "off",
      "arrow-body-style": ["error", "as-needed"],
      "max-depth": "off",
      "max-params": "off",
      "max-statements": "off",
      "capitalized-comments": "off",
      "new-cap": "off",
      "no-continue": "off",
      "init-declarations": "off",
      "sort-imports": "off",
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      "no-new": "off",
      "no-this-alias": "off",

      "import/no-relative-parent-imports": "off",
      "import/no-default-export": "off",
      "import/exports-last": "off",
      "import/no-named-export": "off",
      "import/max-dependencies": "off",
      "import/no-unresolved": "off",
      "import/extensions": "off",
      "import/no-namespace": "off",
      "import/no-anonymous-default-export": "off",
      "import/prefer-default-export": "off",
      "import/group-exports": "off",
      "import/no-commonjs": "off",
      "import/unambiguous": "off",
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import/no-dynamic-require": "off",
      "import/no-unassigned-import": "off",
      "import/no-nodejs-modules": "off",
      "import/default": "off",

      "jsdoc/require-param": "off",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-returns-type": "off",

      "unicorn/explicit-length-check": "off",
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-process-exit": "off",
      "unicorn/prefer-global-this": "off",
      "unicorn/no-null": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/prefer-string-raw": "off",

      "typescript/explicit-module-boundary-types": "off",
      "typescript/no-require-imports": "off",
      "typescript/explicit-function-return-type": "off",
      "typescript/no-var-requires": "off",
      "typescript/require-await": "off",
      "typescript/no-unsafe-type-assertion": "off",

      "node/no-process-env": "off",

      "oxc/no-map-spread": "off",
      "oxc/no-async-await": "off",
      "oxc/no-rest-spread-properties": "off",
      "oxc/no-optional-chaining": "off",

      "promise/catch-or-return": "off",
      "promise/always-return": "off",

      "react/only-export-components": "off",
      "react/jsx-boolean-value": "off",
      "react/react-in-jsx-scope": "off",
      "react/jsx-filename-extension": "off",
      "react/no-unknown-property": "off",
      "react/jsx-props-no-spreading": "off",
      "react/jsx-max-depth": "off",
      "react/no-multi-comp": "off",
      "react_perf/jsx-no-jsx-as-prop": "off",
      "react_perf/jsx-no-new-object-as-prop": "off",
      "react_perf/jsx-no-new-array-as-prop": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/anchor-is-valid": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/img-redundant-alt": "off",
      "jsx-a11y/label-has-associated-control": "off",

      "require-hook": "off",
      "consistent-function-scoping": "off",
    },
    options: {
      typeAware: true,
    },
    overrides: [
      {
        files: [
          "**/*.{test,spec}.{ts,tsx,js,jsx}",
          "**/__tests__/**/*.{ts,tsx,js,jsx}",
        ],
        rules: {
          "no-empty-function": "off",
          "promise/prefer-await-to-then": "off",
          "typescript/no-unsafe-type-assertion": "off",
        },
      },
    ],
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Stub @react-email/code-block to avoid prismjs (browser-only) in Workers
      "@react-email/code-block": path.resolve(
        __dirname,
        "src/cf-worker/email/stubs/code-block.ts"
      ),
    },
  },
  optimizeDeps: {
    // TODO remove once fixed https://github.com/vitejs/vite/issues/8427
    exclude: ["@livestore/wa-sqlite"],
    include: ["@lexical/code"],
  },
  plugins: [
    cloudflare(),
    TanStackRouterVite(),
    tailwindcss(),
    viteReact(),
    livestoreDevtoolsPlugin({ schemaPath: "./src/livestore/schema.ts" }),
  ],
  server: {
    allowedHosts: [".trycloudflare.com"],
    fs: { strict: false },
    port: Number(process.env.PORT) || 3000,
  },
  worker: {
    format: "es",
  },
});
