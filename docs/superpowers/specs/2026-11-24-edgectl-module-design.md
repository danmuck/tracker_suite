# edgectl module (GUI for a local edgectl lab) — v1

## Context
edgectl is a separate Go orchestration system (`/Users/danmuck/local/edgectl`). Tracker Suite gets an **edgectl** module that is the operator's GUI for it, local-only for now.

- Roles, used with these exact words in the UI: **Mirage** (orchestrator, single point of truth), **Ghost** (execution node), **Seed** (service interface on a Ghost). An `issue` goes in, a `report` comes out. There is one operator.
- Mirage serves `api/v1`: HTTP JSON over HTTPS with mutual TLS. The contract is `docs/architecture/definitions/api_v1.toml` in the edgectl repo; it fixes every endpoint, the response envelope `{ok, request_id, trace_id, timestamp_ms, data | error{class, code, message, retryable}}` and all snake_case shapes.
- Goals: see Mirage, its Ghosts and their Seeds; run a command on a Ghost and read its output; follow intents and reports; add or attach a Ghost.
- Non-goals: dependency proposals, remote Ghost deploy, metrics, sign-in, a public-facing form of this module, the static demo.
- Anti-goal: the browser reaching Mirage or seeing the operator certificate.

## Approaches considered
1. **Tracker Suite's server is the `api/v1` client (chosen).** Pages call `/api/edgectl/**`; those routes hold the operator certificate and call Mirage. The certificate never leaves the server, and it matches the contract ("for a web GUI this is the GUI's server, never the browser").
2. Browser calls Mirage directly. Ruled out: Mirage sends no cross-origin headers and a browser would need the operator certificate installed.
3. A bridge process next to Tracker Suite. One more thing to run, for no gain over 1.

## Decisions
Made before this spec (by the user, via the edgectl work):
- Approach 1. Live updates by polling with SWR `refreshInterval`: about 5 s for status, intents and reports; about 15 s for Ghosts and Seeds, because each of those calls makes Mirage probe every Ghost. No EventSource or WebSocket.
- The module ships with `browserData: false`, so it is hidden in browser data mode and in the public static build.
- "Add a Ghost" is built even though `POST /api/v1/ghosts/spawn-local` fails unless a certificate for the new Ghost already exists (only edgectl operator tooling issues certificates). The dialog says so and shows Mirage's error message.

Builder's calls:
- **Not a store-backed module.** It has no collections and is not added to `CONVERTED_MODULES`, `allRoutes` or `COLLECTIONS`. Its `route.ts` files are plain handlers; `serve()` is not used because it always connects to MongoDB.
- **Connection state is data, not an error.** `GET /api/edgectl/status` always answers 200 with `{state: "ok", status}`, `{state: "not_configured", message}`, `{state: "unreachable", message}` or `{state: "error", message}`. Every page sits inside a `MirageGate` that polls it and shows a clear empty state for the last three, so nothing else polls a Mirage that is down. Reason: the shared `fetcher` keeps only the HTTP status of a failed GET, not its message.
- Other routes answer errors as `{error, kind, code, class, retryable}`: 503 not configured, 504 Mirage unreachable, 502 unexpected response, otherwise Mirage's own status and message.
- **The intents list is filled in by the server.** `api/v1` lists only ids, so `GET /api/edgectl/intents` reads each snapshot (in memory in Mirage, no Ghost probe) and returns one summary per intent.
- `routing`, `services` and `reconcile` (all intents) are not used by any page and get no route.
- **Run a command** builds a one-stage, one-command `issue` the way the edgectl lab menu does: `intent_id` `intent.gui.<ms>.<4 hex>`, `target_scope` `ghost:<ghost_id>`, objective `<seed> <operation>`, stage `stage.1`, `blocking: true`, no `actor` (Mirage binds it to the certificate). A command template with an empty `seed_selector` uses its Seed's id. Optional arguments left empty are not sent.
- After submit the dialog reconciles until `completion_state` is no longer `in_progress`, at most 10 calls, 500 ms apart. Each call runs one pending command. If it is still in progress it says so and links to the intent.
- Output with `output_encoding: "base64"` is never decoded to text: the page shows its size and the raw base64 behind a disclosure.
- Ids placed in a Mirage path are checked (no `/`, `\`, `?`, `#`, whitespace or control characters; not `.` or `..`; 256 characters at most) and percent-encoded.
- Data from Mirage is parsed with the Zod schemas before it is passed on; `null` lists and maps are read as empty.
- New accent variable `--module-edgectl` in `globals.css` (every `--chart-N` is taken).

## Configuration (server env)
`EDGECTL_API_URL` (e.g. `https://127.0.0.1:7021/api/v1`), `EDGECTL_CLIENT_CERT`, `EDGECTL_CLIENT_KEY`, `EDGECTL_CA` (file paths). The three files are read on every request, because a lab regenerates them on each start. Any unset variable or unreadable file means "not configured".

## Server (`src/lib/edgectl/server/`, `src/app/api/edgectl/`)
- `server/client.ts`: `mirageRequest(method, path, {body, schema, timeoutMs})` over `node:https` with client certificate, key and CA; unwraps the envelope; throws `MirageError` with `kind` (`not_configured | unreachable | api | bad_response`), `status`, `code`, `errorClass`, `retryable`, `requestId`. No connection reuse.
- `server/respond.ts`: turns a result or a `MirageError` into the route's JSON response.
- Routes: `status` GET; `ghosts` GET; `ghosts/attach` POST; `ghosts/spawn-local` POST; `seeds` GET; `intents` GET, POST; `intents/[intentId]` GET; `intents/[intentId]/reconcile` POST; `reports` GET (`limit`); `executions/[commandId]` GET.
- `src/lib/edgectl/server/**` is server-only. `browser-safe-imports.test.ts` and ESLint forbid browser-reachable code from importing any `src/lib/<module>/server/` folder.

## Client
- `src/types/edgectl/`: one interface per contract shape. `src/lib/edgectl/validators.ts`: Zod schemas for the same shapes and for request bodies.
- `src/lib/edgectl/issue.ts`: `runnableCommands`, `buildIssue`, `reconcileUntilSettled` (pure). `output.ts`: text or binary view of a `seed_result`. `paths.ts`: `intentHref`, `intentIdParam`. `format.ts`: times.
- `src/hooks/edgectl/`: `use-mirage`, `use-ghosts`, `use-seeds`, `use-intents`, `use-reports`, `use-execution`, all on the shared `fetcher` / `send`.

## UI (`src/app/(app)/edgectl/`, `src/components/edgectl/`)
- **Overview** (`/edgectl`): Mirage id and phase, Ghost count, active intents, report count; latest reports; Run a command.
- **Ghosts**: table of Ghost id, connected, address, Seeds, last event, events (not `registered_at_ms`: Mirage sets it anew on every read); **Add a Ghost** and **Attach** dialogs.
- **Seeds**: per Ghost, per Seed: operations and command templates with their arguments. A Ghost whose catalog could not be read shows its error.
- **Intents**: list with objective, target, commands, pending count, last completion state. **Intent** (`/edgectl/intent?id=`): the `issue` stages and commands, per-command state, attempts and last error, output for each command, its `report`s, and **Reconcile**.
- **Run a command** dialog: Ghost → command template → arguments → submit → output.
- **Activity**: report history.
- Home dashboard card: Mirage id and phase, Ghosts, active intents, reports; or the connection problem.
- Mirage keeps state in memory, so every list has an empty state.

## Known limits
- "Add a Ghost" needs a certificate issued out of band first (see Decisions).
- Mirage's error messages can contain file paths from the Mirage host. Fine for one local operator; review before any public exposure.
- The `/edgectl` pages are still exported by `npm run build:static` (every `.tsx` page is); there they show "Not available in browser data mode" and the module is absent from the sidebar and dashboard. No API route or server code is exported.

- `GET /api/v1/reports` repeats a report each time its intent is reconciled again; Activity shows them as Mirage returns them.

## Verification
`npm test`, `npm run lint` (no new findings), `npm run build`, `npm run build:static` (module absent from navigation). Then, with a lab running and the scratch server on port 3031 with the four `EDGECTL_*` variables: Overview shows `mirage.lab`; a `seed.kv` put then get on `ghost.local` shows its output; the report appears in Activity; stopping the lab gives "Mirage unreachable".
