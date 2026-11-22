import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Modules stay independent: code inside one module may not import from another.
// Only the home dashboard (src/components/dashboard, src/lib/dashboard, src/app/(app)/dashboard/page.tsx)
// reads across modules, and it is not listed here.
const MODULE_API_DIRS = {
  finance: ["accounts", "categories", "finance-profile", "projections", "summary", "transactions"],
  figure: ["figure"],
  future: ["future"],
  projects: ["projects", "tasks"],
  links: ["links", "link-groups"],
};
const MODULE_IDS = Object.keys(MODULE_API_DIRS);

const modulePattern = (id) => ({
  regex: `^@/(models|hooks|components|lib|types)/(${MODULE_IDS.filter((m) => m !== id).join("|")})/`,
  message: `The ${id} module may not import from another module. Cross-module code belongs in the dashboard.`,
});

// Modules whose data runs through the store adapter, so all of their src/lib code can reach the browser.
const CONVERTED_MODULES = ["links", "future", "finance", "projects", "figure"];

// Code that can run in the browser (browser data mode, the demo) must not pull in server-only code.
const BROWSER_REACHABLE = [
  "src/lib/data/**",
  "src/lib/*/api/**",
  "src/lib/demo/**",
  "src/hooks/**",
  "src/components/**",
  "src/app/(app)/**",
  "src/app/(site)/**",
  ...CONVERTED_MODULES.map((id) => `src/lib/${id}/**`),
];
// The server-only modules and their tests (which import them directly) are exempt.
const SERVER_ONLY_DATA = [
  "src/lib/data/mongo-store.ts",
  "src/lib/data/mongo-store.test.ts",
  "src/lib/data/serve.ts",
];
const browserPatterns = [
  {
    regex: "^(mongoose|next/server|@/lib/db|@/lib/api-helpers)$",
    message: "Browser-reachable code may not import server-only code.",
  },
  {
    // mongo-store and serve in the data folder: ./serve, ../serve, ../data/mongo-store, @/lib/data/serve,
    // with or without .ts/.js. A module that merely ends in "serve" does not match.
    regex: "^(\\.\\.?/|.*/data/)(mongo-store|serve)(\\.(ts|js))?$",
    message: "Browser-reachable code may not import server-only code.",
  },
  { regex: "^@/models/", message: "Browser-reachable code may not import Mongoose models." },
];

const restrict = (patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const browserBoundary = {
  files: BROWSER_REACHABLE,
  ignores: SERVER_ONLY_DATA,
  rules: restrict(browserPatterns),
};

const moduleBoundaries = MODULE_IDS.map((id) => ({
  files: [
    `src/{models,hooks,components,lib,types}/${id}/**`,
    `src/app/(app)/${id}/**`,
    ...MODULE_API_DIRS[id].map((dir) => `src/app/api/${dir}/**`),
  ],
  rules: restrict([modulePattern(id)]),
}));

// Flat config does not merge rule options: a later block's no-restricted-imports replaces an
// earlier one. Files under both a module and a browser-reachable folder get both lists here, last.
const moduleBrowserBoundaries = MODULE_IDS.map((id) => ({
  files: [
    `src/{hooks,components}/${id}/**`,
    `src/lib/${id}/api/**`,
    `src/app/(app)/${id}/**`,
    ...(CONVERTED_MODULES.includes(id) ? [`src/lib/${id}/**`] : []),
  ],
  rules: restrict([modulePattern(id), ...browserPatterns]),
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  browserBoundary,
  ...moduleBoundaries,
  ...moduleBrowserBoundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Separate Next build folders (e.g. NEXT_DIST_DIR=.next-scratch).
    ".next-*/**",
  ]),
]);

export default eslintConfig;
