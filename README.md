# tracker_suite

Personal site and workspace for **dan muck.** — a public landing page with a
set of private modules behind it.

- **Public mode** serves only the landing page (portfolio, about, contact).
- **Local mode** adds the workspace: a panel per module on the landing page
  with live totals, plus the modules themselves under their own routes.

## Running

```bash
cp .env.example .env.local   # SUITE_MODE and MONGODB_URI
npm install
npm run dev                  # http://localhost:3030
```

| `SUITE_MODE` | Result |
| --- | --- |
| `local` | Modules and their data APIs are served. Needs `MONGODB_URI`. |
| `public` | Landing page only. Every module route answers 404. |
| unset | `local` under `next dev`, `public` in a production build. |

A production build therefore exposes nothing private unless it opts in. To
host the full suite on your own machine with `npm run build && npm start`, set
`SUITE_MODE=local` in `.env.local`. The module APIs have no authentication, so
only use local mode on a machine or network you trust.

The gate is enforced in three places: `src/proxy.ts` (404 for module pages and
APIs), the suite layout (`notFound()`), and `connectDB()` (refuses to open a
database connection outside local mode).

`GET /api/health` reports liveness, and in local mode database reachability
(503 when the database is down).

## Layout

```
src/config/site.ts       landing page copy, links, skills, projects
src/config/modules.ts    module registry: routes, API prefix, navigation
src/lib/suite-mode.ts    local / public switch
src/proxy.ts             blocks module routes in public mode
src/app/(site)/          landing page
src/app/(suite)/         module pages, inside the sidebar shell
src/app/api/<module>/    module APIs
src/components/site/     landing page sections and the workspace panel
src/components/brand/    wordmark
```

### Editing the landing page

All copy lives in `src/config/site.ts`. Colors are tokens in
`src/app/globals.css`; `--brand` is the yellow accent.

### Adding a module

1. Add an entry to `src/config/modules.ts`. Its `basePath` and `apiPrefix` are
   gated automatically and its `nav` appears in the sidebar and on the
   workspace panel.
2. Put pages under `src/app/(suite)/<module>/` and APIs under
   `src/app/api/<module>/`.
3. Optionally register a live summary for the workspace panel in the
   `summaries` map in `src/components/site/workspace.tsx`.

## Modules

**Finance** (`/finance`) — accounts, transactions with recurrence and
transfers, balance projections with alerts, and reports. Data is stored in
MongoDB.
