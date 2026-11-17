import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Modules stay independent: code inside one module may not import from another.
// Only the home dashboard (src/components/dashboard, src/lib/dashboard, src/app/(app)/page.tsx)
// reads across modules, and it is not listed here.
const MODULE_API_DIRS = {
  finance: ["accounts", "categories", "finance-profile", "projections", "summary", "transactions"],
  figure: ["figure"],
  future: ["future"],
  projects: ["projects", "tasks"],
  links: ["links", "link-groups"],
};
const MODULE_IDS = Object.keys(MODULE_API_DIRS);

const moduleBoundaries = MODULE_IDS.map((id) => ({
  files: [
    `src/{models,hooks,components,lib,types}/${id}/**`,
    `src/app/(app)/${id}/**`,
    ...MODULE_API_DIRS[id].map((dir) => `src/app/api/${dir}/**`),
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: `^@/(models|hooks|components|lib|types)/(${MODULE_IDS.filter((m) => m !== id).join("|")})/`,
            message: `The ${id} module may not import from another module. Cross-module code belongs in the dashboard.`,
          },
        ],
      },
    ],
  },
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...moduleBoundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
