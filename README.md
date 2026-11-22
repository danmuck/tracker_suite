# dan muck.

My personal site and the productivity app I use every day, in one Next.js project. The front page is a landing page; the app and its dashboard live at `/dashboard`. The app has five modules: Finance, Figure (fitness and diet), Future (apartment tracker), Projects and Links.

## Two ways to run it

| | Local server | Public site |
|---|---|---|
| Data | MongoDB ("My data"), or browser storage if you switch | Sample data stored in the visitor's browser |
| Build | `npm run dev` / `npm run build` | `npm run build:static` |
| Server | Next.js with API routes | Static files only, no server and no database |

Both run the same pages and the same module code. The app header's data switch chooses between "My data" and "Browser data" on the local server; the public build is locked to browser data.

## Local setup

You need Node.js and a local MongoDB.

```bash
npm install
```

Create `.env.local`:

```bash
MONGODB_URI=mongodb://localhost:27017/tracker
```

Then:

```bash
npm run dev    # http://localhost:3030
npm test       # unit tests for the pure library code
npm run lint
```

## Publishing

```bash
npm run build:static     # writes the static site to out/
npm run preview:static   # serves out/ on http://localhost:8788
npm run deploy:static    # checks, builds and deploys
```

The full steps, including one-time hosting setup, are in [docs/deploy-static.md](docs/deploy-static.md).

## Where things live

- `src/app/(site)/`: the landing page at `/`
- `src/app/(app)/dashboard/`: the dashboard, one card per module
- `src/app/(app)/<module>/`: module pages, inside the sidebar shell
- `src/app/api/`: API routes (local server only)
- `src/lib/site.ts`: all landing-page copy
- `src/components/site/`, `src/components/brand/`: landing sections and the wordmark
- `src/components/dashboard/`, `src/lib/dashboard/`: the module cards on the dashboard
- `src/{models,hooks,components,lib,types}/<module>/`: each module's own code
- `src/lib/data/`: the storage layer shared by MongoDB and browser data
- `src/lib/modules.ts`: the module registry
