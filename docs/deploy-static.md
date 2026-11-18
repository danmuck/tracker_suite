# Deploying the public (browser data) build

The public build keeps every record in the visitor's own browser (localStorage). It is exported as
plain static files and served by Cloudflare Pages: no Node server, no API routes, no database.
Replace `example.com` below with your domain and `tracker-suite` with your Pages project name.

## What the build does

`npm run build:static`:

1. `NEXT_PUBLIC_DEMO=1 next build` with `output: "export"` (see `next.config.ts`). Only `.tsx`
   files become routes, so the API `route.ts` files and `src/proxy.ts` are not in the export.
   Output: `out/`.
2. `scripts/static-headers.ts` deletes source maps and writes `out/_headers`
   (logic in `src/lib/deploy/static-headers.ts`):
   - a per-page Content Security Policy that allows only scripts from this site plus the exact
     inline scripts Next wrote into that page (by sha256), so no `'unsafe-inline'` scripts, no
     `eval`, no `javascript:` links, no third-party hosts, no framing;
   - HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
     `Permissions-Policy`, COOP and CORP on every response;
   - `immutable` caching for `/_next/static/*`.
   The build fails if a page has inline event handlers or a header line exceeds Cloudflare's limit.

Hashes change with every build, so always deploy `out/` from the same `build:static` run.

## Check locally before every deploy

```bash
npm ci
npm test
npm run build:static
npm run preview:static
```

`preview:static` serves `out/` with Cloudflare's own Pages server on http://localhost:8788,
applying `_headers` exactly as production does. Open every page and confirm the browser console
shows no "Content Security Policy" errors, and that `curl -sI http://localhost:8788/` shows the
headers above.

## One-time setup

### 1. Cloudflare account
- Turn on two-factor authentication (a security key or authenticator app, not SMS).
- Create an API token for deploys: My Profile → API Tokens → Create Token → Custom token.
  Permissions: **Account → Cloudflare Pages → Edit** only. Account resources: your account only.
  Optionally restrict it to your IP and give it an expiry date. Store it in your password manager.
- Do not use `wrangler login`; it grants a much broader OAuth scope than the token above.

### 2. Domain and DNS
- At your registrar: turn on registrar lock (transfer lock) and 2FA.
- Add the domain to Cloudflare (Free plan is enough) and switch the nameservers at your registrar
  to the two Cloudflare gives you.
- DNS → Settings → **Enable DNSSEC**, then add the DS record Cloudflare shows at your registrar.
- If the domain does not send email, publish records that stop others spoofing it:

  | Type | Name     | Content                                   |
  |------|----------|-------------------------------------------|
  | MX   | `@`      | `.` with priority `0` (null MX)           |
  | TXT  | `@`      | `v=spf1 -all`                             |
  | TXT  | `_dmarc` | `v=DMARC1; p=reject; adkim=s; aspf=s`     |

  If you do send mail from this domain, skip these and configure SPF/DKIM/DMARC for your provider.
- CAA: add `CAA 0 iodef "mailto:<your address>"`. Once any CAA record exists, Cloudflare adds the
  `issue` records for the certificate authorities it uses; confirm they appear in the DNS list.
  This stops any other CA from issuing certificates for your domain.

### 3. SSL/TLS and zone settings (Cloudflare dashboard, your domain)
- SSL/TLS → Edge Certificates: **Always Use HTTPS** on, **Minimum TLS Version 1.2**, **TLS 1.3** on.
  Leave HSTS in the dashboard off: the site sends its own HSTS header.
- Turn **off** every feature that injects scripts into pages, because the CSP blocks them and they
  would add third-party code: Rocket Loader, Email Address Obfuscation (Scrape Shield), automatic
  Web Analytics injection, Zaraz, and the JavaScript detections of Bot Fight Mode.

### 4. Pages project
```bash
export CLOUDFLARE_ACCOUNT_ID=<your account id>
export CLOUDFLARE_API_TOKEN=<the token from step 1>
npx wrangler pages project create tracker-suite --production-branch main
```
Then in the dashboard: Workers & Pages → tracker-suite → Custom domains → add `example.com`
(and `www.example.com` if wanted). Add a Redirect Rule `www.example.com/*` →
`https://example.com/${1}` (301) so there is one public origin.

The project also answers at `tracker-suite.pages.dev`. Redirect it to your domain with a Bulk
Redirect (Account → Bulk Redirects: source `tracker-suite.pages.dev`, target
`https://example.com`, 301, with subpath matching and path/query preservation).

## Deploy

```bash
npm ci
npm test
npm run build:static
npx wrangler pages deploy out --project-name tracker-suite --branch main
```

`--branch main` makes it a production deploy; without it wrangler uses your current git branch and
creates a preview URL instead. Keep the token in your shell session or password manager, never in
a file in this repository. Roll back from the dashboard (Deployments → a previous deploy →
Rollback).

## After the first deploy

```bash
curl -sI https://example.com/
curl -sI https://example.com/api/accounts
curl -sI http://example.com/
dig +short CAA example.com
dig +short DS example.com
dig +short MX example.com
```

Expect: all security headers on the first; `404` on the second; a `301` to `https://` on the
third; your CAA, DS and null-MX records. Then check
[Mozilla Observatory](https://developer.mozilla.org/en-US/observatory) and
[SSL Labs](https://www.ssllabs.com/ssltest/).

### HSTS preload (last, optional)
The header already carries `preload`, which does nothing until you submit the domain at
[hstspreload.org](https://hstspreload.org). Submitting bakes HTTPS-only for the domain **and
every subdomain** into browsers, and removal takes months. Submit only once you are sure every
current and future subdomain will serve HTTPS.

## Keeping it secure
- Run `npm audit --omit=dev` before deploys and keep Next.js current. Server-side advisories do not
  affect this static build, but client-side ones can.
- Never set a secret in a `NEXT_PUBLIC_*` variable: those are compiled into the public files.
- If a future feature adds a third-party script, image host or API, add it to
  `contentSecurityPolicy()` in `src/lib/deploy/static-headers.ts` deliberately; do not loosen
  `script-src`.

## Later: accounts with server storage
That is a different deployment (Node server, auth, per-user data scoping, a MongoDB with auth on a
private network). Host it separately, e.g. `app.example.com`, and leave this static site as it is.
