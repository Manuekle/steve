import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * The project had no linter at all — no ESLint, no Biome, no lint step in CI.
 *
 * Deliberately the narrow version. `next/core-web-vitals` plus the TypeScript
 * set is what Next itself ships, and its rules catch what `tsc` cannot: a hook
 * with a wrong dependency list, an `<a>` where a `<Link>` belongs, an `<img>`
 * that should be `next/image`, an unused import left behind by a refactor.
 * Nothing stylistic — this codebase is already consistent, and a formatter
 * argument is not what a lint step is for.
 *
 * `no-console` stays off: server-side `console.error` is how this app reports
 * to the operator's journal, and lib/api-error.ts depends on it.
 */
export default [
  {
    ignores: [
      ".next/**",
      ".output/**",
      ".eve/**",
      ".vercel/**",
      ".pnpm-store/**",
      "node_modules/**",
      "next-env.d.ts",
      ".claude/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // `any` crosses a few library boundaries whose types do not line up.
      // Worth seeing, not worth failing a build over.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // eslint-plugin-react-hooks v7 ships the React Compiler's rule set.
      // These are advisory for an app that does not run the compiler: they
      // flag patterns that block memoization, not defects. There are ~100 of
      // them across this UI, and turning that into a refactor is a project,
      // not a lint pass — so they report and do not block. Revisit as a whole
      // if and when the compiler goes on.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
    },
  },
];
