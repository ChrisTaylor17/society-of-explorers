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
  ]),
  {
    files: ["**/*.d.ts"],
    rules: {
      // Ambient declarations describe optional external SDKs; runtime code stays strict.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
