import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/.vercel/**",
    "**/next-env.d.ts",
    // Vendored dependency sources and fixtures should not block first-party linting.
    "lib/openzeppelin-contracts/**",
    // Preserved cross-project handoff snapshots are evidence, not this app build.
    "platforms/source/**",
  ]),
  {
    files: ["**/*.cjs", "platforms/native/metro.config.js"],
    rules: {
      // Node and Metro load these configuration/verification modules as CommonJS.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["tests/**/*", "verification/web/**/*", "platforms/tests/**/*"],
    rules: {
      // Adversarial fixtures intentionally accept malformed values and dynamically
      // load real modules. These exceptions never apply to application code.
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-assign-module-variable": "off",
    },
  },
  {
    files: ["platforms/tests/native-fellowship-entry.tsx"],
    rules: {
      // This browser-only probe stores callbacks for deliberately stale replays.
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
  {
    files: ["tests/growth/g5-stripe-webhook.test.ts"],
    rules: {
      // Bun module replacement is required before importing the actual handler.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      // Ambient declarations describe optional external SDKs; runtime code stays strict.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
