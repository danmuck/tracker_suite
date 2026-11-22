# tracker_suite

Personal site and workspace for **dan muck.** The front page is a portfolio with a
live workspace in it; behind it sit the modules (Finance, Figure, Future, Projects,
Links).

The same code runs two ways:

| | Hosted (public) | Local |
| --- | --- | --- |
| Command | `npm run build:static` | `npm run dev` |
| Runs as | static files, no server | Next.js server on port 3030 |
| Data | sample data in the visitor's browser | your MongoDB ("My data"), or browser data |
| Modules | every module that supports browser data | every module |

Nothing is hidden in the hosted build: each module works there against browser
storage. Locally the data source switch in the top bar moves between your database
and browser data.

## Running locally

```bash
npm ci
echo 'MONGODB_URI=mongodb://127.0.0.1:27017/tracker_suite' > .env.local
npm run dev
```

## Publishing

`npm run deploy:static` builds, checks, deploys and verifies the public site. See
[docs/deploy-static.md](docs/deploy-static.md).

## Where things live

```
src/lib/site.ts              landing page copy, links, skills, project list
src/lib/modules.ts           module registry: routes, navigation, accent color
src/app/(site)/              landing page (top bar, full width)
src/app/(app)/               module pages (sidebar shell)
src/components/site/         landing page sections, including the workspace
src/components/dashboard/    one live card per module, shown in the workspace
src/components/brand/        the "dan muck." wordmark
src/lib/data/                data layer: server database or browser storage
```

To change what the front page says, edit `src/lib/site.ts`. The yellow accent is
`--brand` in `src/app/globals.css`.

## Checks

```bash
npm test
npm run lint
```
