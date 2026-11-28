# Auth Stage 2: Accounts and Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People sign in, every API answer is tied to a session, and each person sees only their own records. Invites, recovery codes, admin reset links and an account page complete the first usable version.

**Architecture:** Hand-written routes under `src/app/api/auth/**` call server-only code in `src/lib/auth/server/`. Sessions are opaque random tokens stored hashed in MongoDB and carried in an `HttpOnly` cookie. `serve()` checks the request's origin and session, then hands each handler `scopedStore(mongoStore, userId)` from stage 1, so no handler changes.

**Tech Stack:** Next.js 16 route handlers, Mongoose 9, Zod 4, SWR, `@node-rs/argon2`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-28-auth-design.md` (sections B, C, D, "Stage 1 outcome and what stage 2 must carry").

## Global Constraints

- **Branch.** This stage makes every API route answer 401 without a session and makes `ownerId` required. The owner's own `npm run dev` on `dev` runs against the live `test` database, which has no admin and unclaimed data. So this stage is built on a branch `auth-stage-2` (in a worktree), and merged to `dev` only when the owner is ready to run `create-admin` and `claim-data --apply` on `test`. Never merge it yourself.
- **Databases.** Allowed: `tracker_scratch`, `tracker_isolation`, `tracker_parity`, and a new `tracker_authflows`, all on `mongodb://localhost:27017`. Never connect to `test`, not even read-only or as a dry run.
- `npx tsc --noEmit` prints nothing, `npm test` passes and `npm run lint` stays at 3 errors and 8 warnings (pre-existing) after every task. The test runner does not type-check.
- Server-only code lives in `src/lib/auth/server/`; nothing reachable from the browser imports it, `mongoose`, `next/server`, `@/lib/db` or `@/models/**`. Model names start with `Auth`.
- Every auth response carries `Cache-Control: no-store`. No password, token, recovery code or hash appears in a log, an error message, a URL sent to the server, or an `AuthEvent`.
- One message and status for every sign-in failure: 401 `{ error: "Email or password is incorrect" }`. One for recovery: 400 `{ error: "That email and code do not match" }`. One for a bad invite or reset token: 400 `{ error: "This link is not valid or has expired" }`. Unknown email, wrong secret and disabled account are indistinguishable, including in timing (`dummyHash()`).
- Exact values: session token 32 random bytes, base64url; stored as SHA-256 hex. Cookie `__Host-ts_session` when `NODE_ENV === "production"`, else `ts_session`; `HttpOnly; SameSite=Lax; Path=/`; `Secure` in production only. Idle limit 14 days, hard limit 60 days, `lastUsedAt` written at most once per 5 minutes. Recent sign-in window 10 minutes. Invite 72 hours, reset link 1 hour. Throttle: 5 failures per 15 minutes per email and 20 per client address; past the limit answer 429 with `Retry-After`, starting at 60 seconds and doubling per further attempt up to 3600. Password input longer than 512 characters is refused before any hashing. At most 2 Argon2 operations run at once.
- The owner id passed to `scopedStore` is always `String(user._id)`. `strictQuery` is never set to true.
- Copy: "Sign in", "Sign out", "Account", "Recovery codes", "Invite", "Reset link", "People". Never "login" or "log in" in visible text.

## Review Focus

1. A request with a valid cookie but another site's `Origin`, or no `Origin` and no `Sec-Fetch-Site`: refused with 403 on every non-GET, auth and module routes alike. (Tasks 2, 6, 10)
2. Two sign-in attempts, one for a real email with a wrong password and one for an unknown email: identical status, body and headers, and both spend one Argon2 verify. (Tasks 4, 10)
3. The same recovery code or the same invite/reset link used twice at the same moment: exactly one succeeds. (Tasks 5, 10)
4. A session that outlives its account: a disabled person's next request is 401, and their sessions and unused reset links are gone. (Tasks 3, 5, 10)
5. `?next=` on the sign-in page set to `//evil.example`, `/\evil.example`, `https://evil.example` or `javascript:…`: the page goes to `/dashboard` instead. (Task 7)

---

### Task 1: Session, token, throttle and event models

**Files:** Create `src/models/auth/AuthSession.ts`, `AuthToken.ts`, `AuthThrottle.ts`, `AuthEvent.ts`, `src/models/auth/auth-models.test.ts`.

**Interfaces — Produces** (all with the hot-reload block used in `AuthUser.ts`):
- `AuthSession`: `tokenHash` (String, required, unique), `userId` (String, required, index), `lastUsedAt` (Date, required), `reauthAt` (Date), `expiresAt` (Date, required, TTL index `expireAfterSeconds: 0`), `userAgent` (String, max 300), `address` (String), timestamps.
- `AuthToken`: `kind` (`"invite" | "reset"`, required), `tokenHash` (required, unique), `email` (lowercase, trim), `name`, `userId` (String), `createdBy` (String, required), `expiresAt` (Date, required, TTL), `usedAt` (Date), timestamps. No `role` field: invites create members only.
- `AuthThrottle`: `key` (String, required, unique), `count` (Number, default 0), `windowStart` (Date, required), `blockedUntil` (Date), `expiresAt` (Date, required, TTL).
- `AuthEvent`: `kind` (String, required), `userId` (String, index), `email` (String), `address` (String), `userAgent` (String, max 300), `at` (Date, required, TTL index `expireAfterSeconds: 15552000`).

- [ ] **Step 1:** Write the failing test: for each model (no connection), the paths, required flags, unique and TTL indexes above via `schema.path()` and `schema.indexes()`; none of the four has a path named `ownerId`, `password`, `token` or `code`.
- [ ] **Step 2:** Run it, see it fail. **Step 3:** Write the models. **Step 4:** `npm test`, `npx tsc --noEmit`, lint.
- [ ] **Step 5:** Commit `feat(auth): session, token, throttle and event models`.

### Task 2: Pure rules: tokens, cookie, session timing, same-origin, throttle, validators

**Files:** Create in `src/lib/auth/server/`: `tokens.ts`, `cookie.ts`, `session-rules.ts`, `same-origin.ts`, `throttle-rules.ts`, `client-address.ts`, `hash-gate.ts`, each with a `.test.ts`. Create `src/lib/auth/validators.ts` (+ test) and `src/lib/auth/next-path.ts` (+ test), both browser-safe.

**Interfaces — Produces:**
- `newToken(): { token: string; hash: string }`, `hashToken(token: string): string | null` (null unless 43 base64url characters).
- `sessionCookieName(env?): string`, `serializeSessionCookie(token: string, expiresAt: Date, env?): string`, `clearSessionCookie(env?): string`, `readSessionCookie(cookieHeader: string | null, env?): string | null`.
- `IDLE_MS`, `HARD_MS`, `TOUCH_MS`, `REAUTH_MS`; `sessionState(s: { createdAt: Date; lastUsedAt: Date; expiresAt: Date }, now: Date): "ok" | "expired"`; `nextExpiry(createdAt: Date, now: Date): Date` (the sooner of now + idle and createdAt + hard); `shouldTouch(lastUsedAt: Date, now: Date): boolean`; `isRecent(reauthAt: Date | undefined, now: Date): boolean`.
- `sameOriginProblem(headers: { get(name: string): string | null }, options: { body: boolean; hasSessionCookie: boolean }): { status: 403 | 415; error: string } | null`. Rules: `Sec-Fetch-Site`, when present, must be `same-origin`; `Origin`, when present, must have the same host as `Host`; when neither is present and `hasSessionCookie` is true, refuse; a body must be `application/json`.
- `throttleDecision(state: { count: number; windowStart: Date; blockedUntil?: Date } | null, limit: number, now: Date): { allowed: boolean; retryAfterSeconds: number }` and `afterFailure(state, limit, now): { count: number; windowStart: Date; blockedUntil?: Date; expiresAt: Date }` with the Global Constraints numbers; `EMAIL_LIMIT = 5`, `ADDRESS_LIMIT = 20`, `WINDOW_MS`.
- `clientAddress(headers, env?): string | null`: the first entry of the header named by `AUTH_TRUSTED_PROXY_HEADER`, else null.
- `hashGate<T>(run: () => Promise<T>): Promise<T>`: at most 2 running, FIFO.
- Zod schemas: `signInSchema {email, password}`, `inviteCreateSchema {email, name}`, `inviteAcceptSchema {token, password}`, `recoverSchema {email, code, password}`, `resetUseSchema {token, password}`, `reauthSchema {password}`, `passwordChangeSchema {currentPassword, password}`. Email trimmed, lowercased, max 254. Every password field max 512. New-password fields are further checked with `passwordProblem` in the route, not in the schema.
- `safeNextPath(next: string | null | undefined): string`: returns `next` only when it starts with a single `/`, has no `\`, no control characters and is not `//…`; else `/dashboard`.

- [ ] **Step 1:** Write failing tests covering: token shape and that `hashToken` of a made token equals its `hash`; cookie strings in production and development (exact attributes, `Max-Age`/`Expires` from `expiresAt`), parsing among other cookies, a wrong-name cookie ignored; every `sessionState`/`nextExpiry`/`shouldTouch`/`isRecent` boundary (14 days, 60 days, 5 minutes, 10 minutes, one millisecond either side); every `sameOriginProblem` row including Review Focus 1; throttle: the 5th failure allowed, the 6th refused with 60, then 120, capped at 3600, a new window after 15 minutes; `clientAddress` unset, set, list with spaces; `hashGate` never exceeds 2 and preserves order; each schema's limits; `safeNextPath` for every case in Review Focus 5 plus `/finance?x=1#y` kept.
- [ ] **Step 2:** See them fail. **Step 3:** Implement. **Step 4:** `npm test`, tsc, lint (`browser-safe-imports` must pass).
- [ ] **Step 5:** Commit `feat(auth): pure rules for tokens, cookies, sessions, origin checks and throttling`.

### Task 3: Session service and route helpers

**Files:** Create in `src/lib/auth/server/`: `sessions.ts`, `throttle.ts`, `events.ts`, `respond.ts`. Modify `src/lib/auth/server/password.ts` (wrap `hash`/`verify` calls in `hashGate`).

**Interfaces — Produces:**
- `type SessionUser = { id: string; email: string; name: string; role: "admin" | "member" }`; `type Session = { id: string; user: SessionUser; reauthAt?: Date }`.
- `startSession(userId: string, request: Request, now: Date): Promise<{ cookie: string }>` (sets `reauthAt = now`); `readSession(request: Request, now: Date): Promise<Session | null>` (null for no cookie, unknown hash, expired, missing or disabled user; touches `lastUsedAt`/`expiresAt` per `shouldTouch`); `endSession(id: string)`, `endOtherSessions(userId: string, keepId: string | null)`, `markRecent(id: string, now: Date)`.
- `checkThrottle(keys: string[], limit…)` / `recordFailure(keys)` / `clearFailures(key)` over `AuthThrottle` using single `findOneAndUpdate` upserts.
- `recordEvent(kind: AuthEventKind, request: Request, details: { userId?: string; email?: string }): Promise<void>`; never throws (a failed audit write is logged by kind only).
- In `respond.ts`: `json(body: unknown, status?: number, headers?: HeadersInit): NextResponse` (adds `no-store`); `guard(request: Request, need: { session?: true; admin?: true; recent?: true; body?: boolean }): Promise<{ session: Session | null } | NextResponse>` which runs, in order: demo refusal, `sameOriginProblem` for non-GET, `connectDB`, `readSession`, then 401 `{ error: "Sign in required" }`, 403 `{ error: "Admins only" }`, or 403 `{ error: "Confirm your password to continue", code: "reauth" }`.

- [ ] **Step 1:** Add tests for what is pure here (`respond.ts` status mapping with a stubbed session reader passed as a parameter; `password.ts` still passes its tests through the gate). The database-backed functions are exercised in Task 10.
- [ ] **Step 2:** Implement. **Step 3:** `npm test`, tsc, lint. **Step 4:** Commit `feat(auth): session service, throttle store, audit events and route guard`.

### Task 4: Sign-in, sign-out, session and reauth routes

**Files:** Create `src/app/api/auth/{session,sign-in,sign-out,reauth}/route.ts`.

- `GET session` → 200 `{ user: SessionUser | null }`.
- `POST sign-in`: validate; throttle on `email:<email>` and `addr:<address>` (429 with `Retry-After` before any hashing); load the user with `+passwordHash`; `verifyPassword(user?.passwordHash ?? await dummyHash(), password)`; fail (wrong, unknown, disabled) → record failure, event `sign_in_failed`, 401 generic. Success → clear the email key, rehash when `needsRehash`, `endSession` of any session on the incoming cookie, `startSession`, event `sign_in`, 200 `{ user }` with `Set-Cookie`.
- `POST sign-out` (session) → end it, clear cookie, 200. `POST reauth` (session) → verify password, `markRecent`, 200; wrong → 401 generic, throttled like sign-in.

- [ ] **Step 1:** Implement the four routes with `guard` and the helpers; no logic beyond the sequence above lives in a route file.
- [ ] **Step 2:** `npm test`, tsc, lint. **Step 3:** Commit `feat(auth): sign-in, sign-out, session and reauth routes`.

### Task 5: Invites, recovery, reset links, password, recovery codes, sessions, people, events

**Files:** Create route files under `src/app/api/auth/`: `invites/route.ts` (GET, POST), `invites/[id]/route.ts` (DELETE), `invite/accept/route.ts`, `recover/route.ts`, `resets/route.ts` (POST), `reset/use/route.ts`, `password/route.ts`, `recovery-codes/route.ts`, `sessions/route.ts` (GET), `sessions/[id]/route.ts` (DELETE), `users/route.ts` (GET), `users/[id]/disable/route.ts`, `users/[id]/enable/route.ts`, `events/route.ts`. Create `src/lib/auth/server/accounts.ts` for the multi-step operations.

**Interfaces — Produces in `accounts.ts`** (each returns a discriminated result, never throws for an expected refusal):
- `createInvite(admin, {email, name}, now)` → `{ token }` (refuses an email that already has an account or an unused invite: 409 `{ error: "That email already has an account or an invite" }`).
- `acceptInvite({token, password}, request, now)`: check `passwordProblem` first; claim the token with one `findOneAndUpdate({ tokenHash, kind: "invite", usedAt: { $exists: false }, expiresAt: { $gt: now } }, { $set: { usedAt: now } })`; create the member with new recovery codes; start a session; return `{ user, codes, cookie }`.
- `recoverWithCode({email, code, password}, now)`: one `findOneAndUpdate` on `AuthUser` filtered by email, not disabled, and `recoveryCodes: { $elemMatch: { hash, usedAt: { $exists: false } } }`, setting the new `passwordHash`, `passwordChangedAt` and a whole new `recoveryCodes` set; then end all sessions; return `{ codes }`. The Argon2 hash is computed before the update; an unknown email still spends one hash.
- `createReset(admin, userId, now)` → `{ token }` (cancels the person's earlier unused reset links); `useReset({token, password}, now)` → same claim pattern, new hash, new codes, end all sessions, `{ codes }`.
- `changePassword(session, {currentPassword, password}, now)` → verify, set, `endOtherSessions`, new cookie for this session (new token). `regenerateCodes(session)` → `{ codes }`.
- `disableUser(admin, userId, now)`: refuses self (400 `{ error: "You cannot disable your own account" }`) and the last enabled admin (400 `{ error: "At least one admin must stay enabled" }`); sets `disabledAt`, ends all their sessions, deletes their unused reset links. `enableUser`.
- Admin-only: invites (POST recent), resets (recent), users, disable/enable (recent), events. Signed in: sessions, password (recent), recovery-codes (recent). `GET users` returns `id, email, name, role, disabledAt, createdAt` only. `GET sessions` returns `id, createdAt, lastUsedAt, userAgent, address, current`. `DELETE sessions/[id]` only for the caller's own sessions (404 otherwise).
- Every operation records its event. Token and code endpoints are throttled per address and, where an email is supplied, per email.

- [ ] **Step 1:** Write failing unit tests for the pure refusal rules extracted from `accounts.ts` into `src/lib/auth/server/account-rules.ts`: `disableProblem(target, admin, enabledAdminCount)`, `inviteProblem(existingUser, pendingInvite)`.
- [ ] **Step 2:** Implement rules, `accounts.ts`, then the routes. **Step 3:** `npm test`, tsc, lint. **Step 4:** Commit `feat(auth): invites, recovery, reset links, account and admin routes`.

### Task 6: Switch the app to sessions and per-owner data

**Files:** Modify `src/lib/data/serve.ts`, `src/lib/db.ts` (remove `runSeeds` and its `once` wiring), all 17 models (`ownerId` gets `required: true`), `src/models/owner-indexes.test.ts`, `src/lib/edgectl/server/respond.ts` (+ every `src/app/api/edgectl/**/route.ts`), `scripts/{finance,projects,figure}-parity/run.ts`. Create `scripts/parity-auth.ts`, `src/lib/data/serve-guards.test.ts`.

- `serve()` order: demo guard → `sameOriginProblem` for non-GET (`body` true when a `Content-Type` or non-zero `Content-Length` is present) → `connectDB` → `readSession` → 401 `{ error: "Sign in required" }` → handler with `store: scopedStore(mongoStore, session.user.id)`.
- edgectl: `adminOnly(request): Promise<NextResponse | null>` in `respond.ts` (401 without a session, 403 `{ error: "Admins only" }` for a member); every edgectl route handler calls it first, before `refuseCrossSite`.
- Parallel first saves: the Future settings upsert (`src/lib/future/api/handlers.ts`, near line 121) and the scratchpad upsert (`src/lib/projects/api/handlers.ts`, near line 173) retry once on `ConflictError`, the same way `saveProfileAndApply` does. Add a unit test for each with a store whose first upsert throws `ConflictError`.
- Parity runners: `scripts/parity-auth.ts` exports `signInForParity(base: string): Promise<{ headers: Record<string, string> }>`: it inserts an admin into the runner's own parity database when missing (random password from `randomBytes`, never printed), signs in over HTTP, and returns `Cookie` and `Origin` headers for every later request. Golden transcripts must not change.

- [ ] **Step 1:** Write failing tests in `serve-guards.test.ts` (source-level guards, in the style of `routes-match-files.test.ts`): `serve.ts` is the only file under `src/` outside `mongo-store.ts` and tests that references `mongoStore`, and it passes it to `scopedStore(`; every `route.ts` under `src/app/api/edgectl` calls `adminOnly(` before any other statement of each exported handler; every `route.ts` under `src/app/api/auth` calls `guard(`; no file under `src/` sets `strictQuery`; `src/lib/db.ts` no longer imports a model. Update `owner-indexes.test.ts` to expect `ownerId` required.
- [ ] **Step 2:** See them fail. **Step 3:** Implement the switch, the edgectl check and the parity sign-in.
- [ ] **Step 4:** `npm test`, tsc, lint. Then `node scripts/auth-isolation/reset-db.mjs` and its runner: all `ok`. Then one parity runner end to end (Finance): reset `tracker_parity`, start the server on port 3032 against it, `run.ts check`: transcript matches.
- [ ] **Step 5:** Commit `feat(auth): every API answer requires a session and is confined to its owner`.

### Task 7: Client request path and session hook

**Files:** Modify `src/hooks/request.ts`. Create `src/hooks/auth/use-session.ts`, `src/hooks/auth/use-account.ts`, `src/hooks/auth/no-direct-fetch.test.ts`, `src/types/auth/api.ts`.

- `request.ts`: `fetcher` keeps the server's `error` message; add `serverFetcher(url)` and `serverSend<T>(url, method, body?)`, which always use `fetch` whatever the data source; on a 401 from any of the four when the data source is the server and the path is not under `/api/auth/`, set `window.location.href = "/login?next=" + encodeURIComponent(pathname + search)` once (a module-level flag stops repeats) and still throw. A 403 with `code: "reauth"` is thrown as `RequestError` with `status 403` and a `code` property (extend `RequestError` with optional `code`).
- `useSession(): { user: SessionUser | null | undefined; isLoading; mutate }` on `/api/auth/session` through `serverFetcher`, `NO_RETRY_ON_STATUS`; returns `user: null` without fetching when `IS_DEMO`.
- `use-account.ts`: thin functions over `serverSend` for every Task 4 and 5 route, and SWR hooks for sessions, people, invites, events.

- [ ] **Step 1:** Write failing tests: `no-direct-fetch` for `src/hooks/auth` (copy the Finance one); a test of the 401 path with `fetch` and `window` stubbed (redirect target built with the current path; auth paths do not redirect; browser data mode never calls `fetch` from `fetcher`/`send`; `serverFetcher` calls `fetch` in browser mode).
- [ ] **Step 2:** See them fail. **Step 3:** Implement. **Step 4:** `npm test`, tsc, lint. **Step 5:** Commit `feat(auth): session hook and sign-in redirect on 401`.

### Task 8: Sign-in, invite, recover and reset pages

**Files:** Create `src/app/(auth)/layout.tsx`, `(auth)/login/page.tsx`, `(auth)/invite/page.tsx`, `(auth)/recover/page.tsx`, `(auth)/reset/page.tsx`; `src/components/auth/{sign-in-form,new-password-form,recovery-codes-panel,recover-form,auth-unavailable}.tsx`. Modify `eslint.config.mjs` (`BROWSER_REACHABLE` gains `src/app/(auth)/**`) and `src/lib/data/browser-safe-imports.test.ts` (entry points gain `src/app/(auth)`).

- All pages are `"use client"`, static-exportable (no dynamic segments), and render `AuthUnavailable` ("Accounts are not available in the demo") when `IS_DEMO`.
- `/login`: email and password; on success go to `safeNextPath(searchParams.get("next"))` with a full page load; shows the server's message on 401 and "Too many attempts. Try again in N minutes" on 429 (from `Retry-After`); link "Forgot your password?" to `/recover`. If already signed in, go straight to the next path.
- `/invite` and `/reset`: read the token from `window.location.hash`, then remove the fragment with `history.replaceState`; no token → the invalid-link message. `NewPasswordForm` shows `passwordProblem` live. On success show `RecoveryCodesPanel` (codes in a monospace list, Copy button, "I saved these" checkbox enabling Continue → `/dashboard`). `/reset` success shows the new codes too, then Continue → `/login`.
- `/recover`: email, recovery code, new password; on success the new codes panel, then `/login`.
- Forms follow `src/components/links/link-form.tsx`: controlled inputs, inline errors, `Loader2` while saving, `autocomplete` set (`username`, `current-password`, `new-password`), the password never placed in a URL or `localStorage`.

- [ ] **Step 1:** Build the components and pages. **Step 2:** `npm test`, tsc, lint.
- [ ] **Step 3:** On the scratch server (port 3031, `tracker_scratch`, which has `scratch-admin@example.test` whose password nobody knows): create a second admin for the walk-through by running `create-admin` yourself is not possible without a terminal, so insert `walkthrough@example.test` with a password generated into a file under the session scratchpad (never printed, deleted at the end of Task 11). In the browser pane: wrong password shows the generic message; right password lands on `/dashboard`; `/login?next=//evil.example` lands on `/dashboard`. Screenshot the sign-in page in light and dark.
- [ ] **Step 4:** Commit `feat(auth): sign-in, invite, recover and reset pages`.

### Task 9: Account page, user menu, data-source switch, edgectl visibility

**Files:** Create `src/app/(auth)/account/page.tsx`; `src/components/auth/{user-menu,password-card,recovery-codes-card,sessions-card,people-card,invites-card,events-card,reauth-dialog}.tsx`. Modify `src/components/site/site-header.tsx`, `src/components/data-source-switch.tsx`, `src/lib/modules.ts` (`availableModules(source, role?)`: `browserData: false` modules need `role === "admin"`), its callers (`app-sidebar.tsx`, `module-gate.tsx`, `module-tabs.tsx`, dashboard), and `src/lib/modules.test.ts` if present (else create).

- `UserMenu` beside `ThemeToggle`: nothing in the demo; a "Sign in" link when `user === null`; otherwise a dropdown with the name, "Account", "Sign out" (sign out → full load of `/`).
- `/account`: signed out → redirect to `/login?next=/account`. Cards: Password; Recovery codes (regenerate, shows the panel once); Sessions (this one marked, End on the others); for admins People (disable/enable, "Create reset link"), Invites (create, copy link, revoke), Recent activity. Invite and reset links are shown once in a dialog with a Copy button, built as `${location.origin}/invite#${token}`.
- `ReauthDialog`: any call that fails with `code: "reauth"` opens it, posts `/api/auth/reauth`, then retries the call once.
- `DataSourceSwitch`: choosing My data when `user === null` goes to `/login?next=<current path>` instead of switching.

- [ ] **Step 1:** Write the failing test for `availableModules` (member, admin, signed out, browser mode). **Step 2:** Implement everything. **Step 3:** `npm test`, tsc, lint.
- [ ] **Step 4:** Browser walk-through on the scratch server as the walk-through admin: invite `member@example.test`, open the link in a second tab after signing out, accept, confirm the codes panel, confirm the member sees no edgectl and empty modules; as admin again, create a reset link, use it; end a session from the account page; change the password (other sessions end). Screenshot the account page.
- [ ] **Step 5:** Commit `feat(auth): account page, user menu and admin tools`.

### Task 10: Flows over HTTP against a real database

**Files:** Create `scripts/auth-flows/reset-db.mjs` (hard-coded `tracker_authflows`), `scripts/auth-flows/run.ts`; add `scripts/auth/reset-password.ts` (the spec's last resort: `--db`, `--email`, password from the terminal, same rules as `create-admin`, ends all sessions, prints new codes once).

`run.ts check --base http://localhost:3034` (server started by hand on `MONGODB_URI=mongodb://localhost:27017/tracker_authflows NEXT_DIST_DIR=.next-authflows npx next dev -p 3034`; the runner refuses any other base port and inserts its own admin directly). One `ok`/`FAIL` line each, non-zero exit on any failure:
1. Without a cookie: every route in `allRoutes` answers 401; `GET /api/auth/session` answers `{ user: null }`.
2. Sign-in sets a cookie with the exact attributes; the cookie value does not appear in any response body or in the database (only its hash).
3. Review Focus 1: with a valid cookie, a POST with `Origin: https://evil.example`, and a POST with neither header, are 403 on an auth route and on a module route; with the right `Origin` they pass.
4. Review Focus 2: unknown email and wrong password give byte-identical status, body and header names; each takes at least half the time of a successful sign-in.
5. Six wrong passwords: the sixth is 429 with `Retry-After: 60`; a correct password during the block is still 429; other emails are unaffected.
6. Invite → accept → member signed in; the invite reused → the invalid-link message; Review Focus 3: twenty parallel accepts of a fresh invite create exactly one user.
7. Member and admin each create records in every module; neither sees the other's (reuse `seedOwner`-style calls over HTTP, or `probeAsStranger` with an HTTP-backed dispatch); a foreign id in `?accountId=` and `?projectId=` and in a POST body returns nothing of the other's.
8. Recovery: wrong code → generic 400; right code → new password works, old does not, all old sessions 401, the old codes all fail, the same code in twenty parallel requests succeeds once.
9. Admin reset link → used once → second use invalid; disabling the member → their next request 401, their reset link invalid, sign-in generic 401; the admin cannot disable themselves.
10. Reauth: a recent-only route answers 403 `code: "reauth"` when `reauthAt` is made old directly in the database; after `POST reauth` it passes.
11. Expiry: a session whose `lastUsedAt` is set 15 days back, and one whose `createdAt` is set 61 days back, both answer 401.
12. edgectl routes: 401 signed out, 403 for the member.
13. `AuthEvent` holds one entry per action above, and no document in any `auth*` collection contains the admin's password, any issued token, or any recovery code in clear (scan every string field).

- [ ] **Step 1:** Write the reset script and runner. **Step 2:** Reset, start the server, run until every line is `ok` for honest reasons; a failure caused by a defect in Tasks 1–9 is fixed in that task's code, with a unit test where one fits. **Step 3:** Run three times from a fresh reset. **Step 4:** `npm test`, tsc, lint.
- [ ] **Step 5:** Commit `test(auth): sign-in, recovery, invites and isolation checked over HTTP`.

### Task 11: Whole-stage check

- [ ] **Step 1:** `npx tsc --noEmit`, `npm test`, `npm run lint` (baseline), `npm run build:static` (passes; no `out/api`; the four auth pages exist in `out/` and show the demo message).
- [ ] **Step 2:** All three HTTP parity runners against `tracker_parity`, the isolation runner, and the auth-flows runner: all pass.
- [ ] **Step 3:** Run `/security-review` on the branch diff and fix what it finds that is real, in one wave.
- [ ] **Step 4:** Remove the walk-through password file; delete the walk-through and member users from `tracker_scratch`.
- [ ] **Step 5:** Update `README.md` ("Accounts": first-time setup order, the three scripts, recovery) and the local `CLAUDE.md`. Add to the spec's stage notes anything stage 3 must carry. Commit `docs(auth): accounts setup and stage 2 notes`.
- [ ] **Step 6:** Stop. Do not merge `auth-stage-2` into `dev`. Report the merge steps for the owner: `mongodump` of `test`; stop all servers; merge; `create-admin --db test …` in a terminal; `claim-data --db test --admin …` (read the dry run), then `--apply`; start the app and sign in.

## Not in this stage

Security headers and CSP for the server build, env validation at startup, `autoIndex: false`, the script URI from the environment, hosting and the hosted MongoDB, trusted-host checks for production (stage 3). Sign in with Apple (stage 4). Email, authenticator codes, passkeys.
