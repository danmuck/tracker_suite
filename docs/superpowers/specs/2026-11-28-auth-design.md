# Auth: accounts, sign-in, recovery, per-user data — Design

Date: 2026-11-28 · Status: draft for approval

## Intent

Tracker Suite has no login. "My data" is one shared MongoDB dataset: no record has an owner, there are no sessions or cookies, writes outside edgectl have no cross-site check, and the server build sends no security headers.

The owner wants to move from the static demo to a live deployment with a hosted MongoDB, where the owner and a few invited people each sign in and see only their own data. Security is the first priority. Sign in with Apple follows once password sign-in works.

## Goals

- The owner plus invited people can sign in; each sees and changes only their own records, in every module.
- Ownership is enforced in one place, not per handler. A handler that forgets a filter cannot leak.
- A lost password is recoverable without email: saved one-time recovery codes, or a reset link the admin creates and passes on.
- A stolen database copy yields no usable passwords, session tokens, invite or reset links, or recovery codes.
- Browser data mode and the static demo keep working with no account.
- Stored data leaves room for a second sign-in step and for Apple without a migration.

## Non-goals

- Public sign-up, email sending of any kind, authenticator codes or passkeys (later).
- Sharing records between users.
- Auth in the static demo: it ships no API and stays as it is.
- Syncing browser data into an account.

## Anti-goals

- Any request that reads or changes another person's records.
- Any answer that tells a stranger whether an email address has an account.
- A secret, token, password or recovery code in a log, a URL sent to the server, or `NEXT_PUBLIC_*`.
- A network endpoint that can create the first admin.

## Constraints

- Handlers (`src/lib/<module>/api/`) run in the browser too and take a `Store`; they must not import `mongoose`, `next/server`, `src/lib/db.ts` or any `src/lib/<x>/server/`. `browser-safe-imports.test.ts` and ESLint enforce it.
- `HandlerContext` (`src/lib/data/api.ts`) has no user and handlers never see the request.
- Global singletons today: the Cash account (`runSeeds` in `src/lib/db.ts`, `ensureCashAccount`), the finance profile (`findOne({})`), Future settings (`key: "default"`). Unique across the whole database today: `LinkGroup.slug`, `Category.name`, `FutureSettings.key`, `Scratchpad.projectId`.
- Finance owns the Mongoose model name `Account` and the collection `accounts`.
- The demo build exports only `.tsx` files: route files and `src/proxy.ts` do not exist there.
- Golden parity transcripts (`scripts/*-parity`) record handler output for Finance, Projects and Figure.
- Never hand-test against the live database (`test`); use `tracker_scratch` on port 3031.

## Approaches

1. **Built in this repo on small known pieces** (chosen by the owner). Argon2id passwords, opaque server-side sessions in MongoDB, hand-written `/api/auth/*` routes shaped like edgectl's. The owner's choices (invite-only, no email, recovery codes plus admin reset) are the parts a library does not cover; what remains is small. The cost: every line is ours to test and review.
2. **Better Auth.** Ready-made password sign-in, MongoDB adapter and Apple. Rejected: invite-only and code-based recovery mean working around it, and it brings its own schema and a large dependency into the most sensitive code.
3. **Auth.js or a hosted service.** Ruled out: Auth.js treats password sign-in as second-class and has no recovery; a hosted service would hold the user database, which the owner wants to own.

For ownership, one approach was considered seriously: a store wrapper applied once per request. Adding a filter in every handler was rejected for the reason the browser-data spec gave: a leak if any query misses it.

## Decisions

Made by the owner:

- Who signs in: the owner plus invited people, each with private data. No public sign-up.
- Recovery without email: recovery codes, plus admin-issued reset links.
- Password only in the first version.
- Built in the repo, not on an auth library.
- Apple after everything else works.

Calls made by the designer (not decided by the owner):

- The sign-in name is an email address, though no mail is sent. It is unique, familiar, and what Apple will report later.
- Sessions end after 14 days without use and 60 days in total.
- Passwords: 12 to 128 characters, no composition rules, refused if on a bundled list of common passwords.
- Invite links last 72 hours; reset links 1 hour.
- Pages are not gated in `src/proxy.ts`: they hold no data, and every API answer is gated.
- edgectl routes require an admin session on top of their existing guards.
- Local development needs a sign-in too once this lands.
- Auth is shared infrastructure like `src/lib/data`, not a module in `src/lib/modules.ts`.
- Invites create members only. An admin is made only by `create-admin` on the server, because admin also means edgectl operator.
- An admin cannot disable themselves, and the last enabled admin cannot be disabled.
- Any password recovery or reset replaces the person's recovery codes with a new set, shown once. Disabling a person ends their sessions and cancels their unused reset links.
- "I saved these" for recovery codes is enforced by the page, not the server. Someone who closes the tab can regenerate codes from the account page, or ask the admin for a reset link.
- A signed-in member gets 403 from edgectl routes and does not see the module.
- The HTTP parity runners keep working: they sign in first.

## Design

### A. Ownership

**Scoped store.** New pure file `src/lib/data/scoped-store.ts` exports `scopedStore(store: Store, ownerId: string): Store`. It wraps every `Collection` method of `src/lib/data/store.ts`:

| Method | Behaviour |
|---|---|
| `findOne`, `find`, `count`, `exists`, `distinct`, `updateMany`, `deleteMany`, each `batchUpdate` op | `ownerId` is added to the filter |
| `findById`, `updateById`, `deleteById` | act only when a record with that `_id` and `ownerId` exists; otherwise answer as "not found" |
| `insert`, `insertMany` | every record is stamped with `ownerId` |
| `updateOne` | `ownerId` added to the filter; with `upsert`, also stamped on insert |

A filter, update or inserted record that names `ownerId` throws. `ownerId` is removed from every record returned, so handler output is byte-for-byte what it is today and the parity transcripts stay valid.

**Wiring.** `serve()` in `src/lib/data/serve.ts` passes `scopedStore(mongoStore, session.userId)` to the handler. Handlers and `HandlerContext` do not change. Browser data mode is not wrapped: that data already belongs to one browser.

**Singletons.** Through the wrapper, `findOne({})`, `key: "default"` and `ensureCashAccount` each resolve per owner. The global Cash seed (`runSeeds`) is removed from `src/lib/db.ts`.

Two races need a database rule, because `serve()` builds a new scoped store per request and `ensureCashAccount` (`src/lib/finance/api/docs.ts`) guards concurrent inserts with a `WeakMap` keyed on the store object:

- Cash: a partial unique index on `accounts`, `{ownerId}` where `isCash: true`. `ensureCashAccount` treats `ConflictError` as "someone else just created it" and reads again.
- Finance profile: a unique index `{ownerId}` on `financeprofiles`; the upsert in `src/lib/finance/api/profile.ts` retries once on `ConflictError`.

These are the only handler changes. The browser store is unaffected: its requests already run one at a time.

**Schemas.** All 17 models in `src/models/**` gain an indexed `ownerId` (string: the user's id). It is optional in stage 1 and becomes required in the stage 2 commit that switches `serve()`, so the app keeps working between stages. Unique indexes become `{ownerId, slug}`, `{ownerId, name}`, `{ownerId, key}`, `{ownerId, projectId}`. Other compound indexes get `ownerId` as their first key. Mongoose adds new indexes but never drops old ones: `claim-data` drops `slug_1`, `name_1`, `key_1`, `projectId_1`. `COLLECTIONS` in `store.ts` is unchanged. The browser store's uniqueness check compares only records with the same `ownerId`; in browser data mode no record has one, so nothing changes there, and the in-process isolation tests can cover two owners.

**Tests.**
- Unit tests of `scopedStore` over `BrowserStore` with in-memory storage: each method, the throw on `ownerId`, the stripping.
- Isolation (in `npm test`): for each module's route table, owner A creates records through `dispatch` on a scoped `BrowserStore`; owner B then lists, reads by id, updates, deletes and counts, and must see nothing of A's and change nothing of A's.
- Isolation over MongoDB (outside `npm test`, like the HTTP parity runners): `scripts/auth-isolation/run.ts` runs `scopedStore(mongoStore, …)` against a `tracker_isolation` database only. It repeats the checks above and adds what only the real indexes can show: the same slug, category name and settings key allowed across owners, and many parallel first requests producing exactly one Cash account and one finance profile per owner.
- Guard: `serve.ts` is the only non-test file that names `mongoStore` besides `mongo-store.ts`, and it passes it through `scopedStore`.

**Migration.** `scripts/auth/claim-data.ts <admin email>`: gives every record without `ownerId` to that admin, drops the four old single-field unique indexes, then syncs indexes. Prints what it would do unless `--apply`. It refuses any database not named on the command line. Order of use: scratch database first; the live `test` database only after a `mongodump` and the owner's explicit go-ahead. On any database, the order is: stop the app, `create-admin`, `claim-data --apply`, then start the stage 2 build.

### B. Accounts and sessions

All of this is server-only, in `src/lib/auth/server/`, with Mongoose models in `src/models/auth/`.

| Model | Holds |
|---|---|
| `AuthUser` | `email` (lowercase, unique), `name`, `passwordHash`, `role` (`admin` or `member`), `disabledAt`, `passwordChangedAt`, `recoveryCodes` (`[{hash, usedAt}]`), `appleSub` (sparse unique, unused for now), `secondStep` (empty for now) |
| `AuthSession` | `tokenHash` (unique), `userId`, `createdAt`, `lastUsedAt`, `reauthAt`, `expiresAt` (TTL index), `userAgent`, `address` |
| `AuthToken` | `kind` (`invite` or `reset`), `tokenHash` (unique), `email`, `name`, `role`, `userId`, `createdBy`, `expiresAt` (TTL index), `usedAt` |
| `AuthThrottle` | `key`, `count`, `windowStart`, `expiresAt` (TTL index) |
| `AuthEvent` | `kind`, `userId`, `email`, `address`, `userAgent`, `at` (TTL 180 days) |

**Passwords.** Argon2id with OWASP's current minimum parameters or stronger. Implementation: `@node-rs/argon2` (Node 24.1, in use here, has no built-in Argon2). Parameters are stored inside the hash so they can be raised later, and a successful sign-in rehashes an older hash. When the email is unknown a dummy hash is still verified, so timing does not reveal accounts. Every sign-in failure gives the same message and status.

**Sessions.** A token is 32 random bytes, base64url. Only its SHA-256 is stored. The cookie is `__Host-ts_session` in production and `ts_session` in local development over plain HTTP, with `HttpOnly; Secure; SameSite=Lax; Path=/` (`Secure` left off only in local development). A new token is issued at sign-in and on password change. Changing or recovering a password ends every other session. There is no signing secret: nothing to rotate or leak. People can list and end their own sessions.

**Recent sign-in.** Changing the password, regenerating recovery codes, creating an invite or a reset link, disabling a person: each needs the password entered again within the last 10 minutes (`reauthAt`).

**Invites.** An admin enters an email and a name and gets a link valid 72 hours, single use. The token is in the URL fragment (`/invite#<token>`), so it is never sent to the server in a URL, logged, or passed in `Referer`; the page reads it and POSTs it. Stored hashed. The invited person sets a password, is shown 10 recovery codes once, and confirms they saved them before the account is usable.

**Recovery.**
- Recovery code: email + one code + new password. A code is 80 random bits shown as groups of base32 characters, stored as SHA-256, single use. Success ends all sessions.
- Admin reset: the admin creates a reset link for a person (`/reset#<token>`, 1 hour, single use, stored hashed) and passes it on by whatever means they trust. The admin never sees a password.
- Codes can be regenerated from the account page; that invalidates the old set.

**First admin and last resort.** `scripts/auth/create-admin.ts` and `scripts/auth/reset-password.ts` run on the server against a named database and read the password from the terminal without echo. `create-admin` prints the recovery codes once.

**Throttling.** Counted in `AuthThrottle`, per email and per client address, for sign-in, recovery, invite acceptance and reset use. Past the limit, requests are refused with 429 and a wait time that grows; an account is never locked outright, so a stranger cannot lock someone out for long. Limits are constants in one file. The client address is taken from the header named in `AUTH_TRUSTED_PROXY_HEADER` when set, otherwise it is not used (per-email limits still apply).

**Audit.** `AuthEvent` records sign-in success and failure, sign-out, recovery, reset, invite created and accepted, session ended, person disabled. Never a password, token or code. Admins see the list on the account page.

### C. Request path

**Routes.** Written by hand under `src/app/api/auth/**`. They do not use `serve()` and are not in `allRoutes` or `CONVERTED_MODULES`, so `routes-match-files.test.ts` is unaffected. Every response carries `Cache-Control: no-store`.

| Route | Who | Does |
|---|---|---|
| `GET session` | anyone | 200 with `{user: {id, email, name, role} or null}` |
| `POST sign-in`, `POST sign-out` | anyone / signed in | start or end a session |
| `POST invite/accept` | invite token | set password, create the person, return recovery codes, start a session |
| `POST recover` | email + code | set a new password |
| `POST reset/use` | reset token | set a new password |
| `POST reauth` | signed in | confirm the password, set `reauthAt` |
| `POST password`, `POST recovery-codes` | signed in, recent | change password; regenerate codes |
| `GET sessions`, `DELETE sessions/[id]` | signed in | list own sessions; end one |
| `GET users`, `POST users/[id]/disable`, `POST users/[id]/enable` | admin | manage people |
| `GET invites`, `POST invites`, `DELETE invites/[id]` | admin, recent for POST | manage invites |
| `POST resets` | admin, recent | create a reset link for a person |
| `GET events` | admin | recent audit entries |

Input is validated with Zod in `src/lib/auth/validators.ts` (browser-safe, shared with the forms).

**Same-origin check.** `src/lib/auth/server/same-origin.ts` holds the generic part of edgectl's `crossSiteProblem`: `Sec-Fetch-Site` must be `same-origin` when present, `Origin` must match `Host` when present, a body, when there is one, must be declared as JSON (three existing POSTs send none). Unlike edgectl's, a request with neither header and a session cookie is refused. Every auth POST and DELETE calls it, and `serve()` calls it for every non-GET, closing today's gap on module writes. edgectl keeps its own guard unchanged.

**`serve()` order.** Demo guard, same-origin check (non-GET), `connectDB`, session lookup, then the handler with the scoped store. No session, an expired one, or a disabled person: 401 `{error: "Sign in required"}`.

**edgectl.** `src/lib/edgectl/server/respond.ts` gains a check that the request has an admin session; every edgectl route calls it. No session: 401. A member: 403, including `GET /api/edgectl/status` (its "always 200" contract holds for admins). The sidebar and dashboard hide edgectl from members. Loopback and cross-site guards stay as they are.

**Parity runners.** `scripts/*-parity/run.ts` sign in before replaying and send `Origin`. Each parity database gets an admin from `create-admin` after a reset.

**Client.** `src/hooks/request.ts`: in server mode a 401 sends the browser to `/login?next=<current path>`; `fetcher` keeps the server's error message. It also gains `serverFetcher` / `serverSend`, which always call the server whatever the data source: auth has no browser-mode twin, and the header needs the session in browser mode too. `fetch(` still appears only in this file. `next` is honoured only when it is a path on this site (starts with a single `/`). Requests stay same-origin, so the cookie travels with no extra option.

### D. UI

- A new route group `src/app/(auth)/` with `/login`, `/invite`, `/recover`, `/reset` and `/account`. `/account` has: change password, recovery codes, sessions; for admins also people, invites, reset links, recent events. Components in `src/components/auth/`, hook `src/hooks/auth/use-session.ts` (SWR on `/api/auth/session` through `serverFetcher`).
- In the demo build (`IS_DEMO`) these pages render a short "not available in the demo" state and the header shows no sign-in control.
- `src/components/site/site-header.tsx`: a user menu beside `ThemeToggle` (name, Account, Sign out); signed out, a Sign in link.
- `DataSourceSwitch`: choosing My data while signed out goes to `/login`.
- Forms follow `src/components/links/link-form.tsx`: controlled inputs, inline errors, spinner while saving. Recovery codes are shown once with a copy button and a "I saved these" checkbox that enables Continue.

```
Sign in                       Your recovery codes
┌──────────────────────┐      ┌──────────────────────────┐
│ Email    [         ] │      │ Save these now. Each one │
│ Password [         ] │      │ works once.              │
│        [ Sign in ]   │      │  ABCD-EFGH-JKLM-NPQR     │
│ Forgot your password?│      │  … 9 more                │
└──────────────────────┘      │ [Copy]  ☐ I saved these  │
                              │             [ Continue ] │
                              └──────────────────────────┘
```

## Stages

Each stage gets its own plan in `docs/superpowers/plans/` and lands on `dev`.

1. **Ownership.** Scoped store and its tests, optional `ownerId` and the new indexes on the schemas, the two race fixes, both isolation tests, the `AuthUser` model with password hashing, `create-admin` and `claim-data`. `serve()` is not switched yet, so the app keeps working as today.
2. **Accounts.** The other models, `src/lib/auth/server/`, routes, the `serve()` switch with `ownerId` required, edgectl admin check, scripts, pages, user menu, 401 handling. Ends with a security review of the branch.
3. **Live deployment.** Security headers and a CSP for the server build in `next.config.ts`, checking required env at startup, a hosted MongoDB (TLS, a database user limited to one database, network allowlist, backups), the trusted proxy setting, `docs/deploy-live.md`. Where to host is the owner's choice, asked at that point.
4. **Sign in with Apple.** Its own short design. Links to an already invited person by Apple's stable user id; never creates a person. Needs an Apple Developer membership.

## Left to the builder

- Exact Argon2id parameters and which implementation, within the rule above.
- Throttle limits and wait times.
- File layout inside `src/lib/auth/server/` and `src/components/auth/`.
- The source and size of the common-password list.
- Wording of messages, within "never reveal whether an account exists".

## Verification

- `npm test` and `npm run lint`: all existing guards and the three parity replays pass unchanged.
- Scratch server: `MONGODB_URI=mongodb://localhost:27017/tracker_scratch NEXT_DIST_DIR=.next-scratch npx next dev -p 3031`. Run `claim-data` and `create-admin` there, then in a browser: sign in, invite a second person, accept in a separate browser profile, confirm each sees only their own data in every module, recover with a code, use an admin reset link, end a session from the account page.
- With `curl`: a write with no cookie gets 401; a write with another site's `Origin` gets 403; repeated wrong passwords get 429; a known and an unknown email get the same answer.
- `npm run build:static` passes its checks (no `out/api`, no secrets in `out/`).
