# Deploying the public (browser data) build

The public build keeps every record in the visitor's own browser (localStorage). It is exported as
plain static files and served by Cloudflare Pages: no Node server, no API routes, no database.
Replace `example.com` below with your domain and `tracker-suite` with your Pages project name.
The steps were last walked through end to end in November 2026 with the domain registered at
Namecheap; Cloudflare and Namecheap move menus around, so if a label differs, search for the
setting's name (Cloudflare: **Quick search**, ⌘K, top of the sidebar).

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

Hashes change with every build, so always deploy `out/` from the same `build:static` run, and
never let anything rewrite the HTML on the way out (see "Turn off" in step 4).

## Check locally before every deploy

`npm run deploy:static` (see [Deploy](#deploy)) runs these checks itself; by hand:

```bash
npm ci
npm test
npm audit --omit=dev
npm run build:static
npm run preview:static
```

- npm 11 blocks dependencies' install scripts by default and lists them after `npm ci` (esbuild,
  workerd, …). Leave them blocked: the build, tests and the Pages preview work without them.
- `preview:static` serves `out/` with Cloudflare's own Pages server on http://localhost:8788,
  applying `_headers` exactly as production does. Open every page and confirm the browser console
  shows no "Content Security Policy" errors, and that `curl -sI http://localhost:8788/` shows the
  headers above.

## One-time setup

### 1. Cloudflare account
- Turn on two-factor authentication (a security key or authenticator app, not SMS) under
  **My Profile → Authentication**. If you signed up with **Sign in with Apple/Google**, the account
  has no password and the 2FA screen asks for one you never set: log out, click **Forgot your
  password?** on the login page with the email shown under My Profile (an Apple "Hide My Email"
  address if you chose that), set a password, then add 2FA. Keep the backup codes offline.
- Your **account ID** is on the account home (**API** box, or the account menu → Copy account ID).
  It is also the hex string after `com.cloudflare.api.account.` in a token's JSON summary. It is
  not a secret.

### 2. Deploy token
Wrangler authenticates with an API token in an environment variable. Do not use `wrangler login`;
it grants a much broader OAuth scope.

1. **My Profile → API tokens → Create token** (a user token), or **Manage Account → Account API
   tokens** (owned by the account; Cloudflare's suggestion for CI). Both work with the settings
   below.
2. **Token name**: `pages-deploy-tracker-suite`.
3. **Policies**: the form starts with one account policy.
   - Change its resource from **All accounts** to your one account (keep **Include**).
   - In **Search for permission groups…** type `pages`, and tick only **Cloudflare Pages** with
     **Edit**. The **Developer Platform** counter should read **1** and every other group **0**.
   - Do not use **Bulk Select**, **Add new policy**, or the "Edit Cloudflare Workers" template.
4. **Client IP address filtering** (optional): your public IP (`curl -s https://api.ipify.org`).
   Deploys then only work from that connection; update it if your ISP changes your IP.
5. **Expiration**: set an end date (for example 90 days).
6. Continue to the summary. The JSON tab should show one policy, one permission group and only
   `com.cloudflare.api.account.<your id>`. **Create token**.
7. The secret is shown **once**, on this screen only. Put it straight into your password manager.
   The token's summary page later shows settings, never the secret; if you lost it, use **Roll**
   on the token (… menu) for a new secret with the same settings.
8. Check it without leaving it in your shell history (paste at the silent `read` prompt):
   ```bash
   read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
   curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
   ```
   Expect `"status": "active"`. An account token verifies at
   `https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/tokens/verify` instead.

If the token leaks, delete or roll it on the same page. Never paste it into a file in this
repository (`.env*`, `.dev.vars*` and `.wrangler/` are git-ignored, but keep it out of files
anyway), a chat, or a commit.

### 3. Domain and DNS

**a. At the registrar first (Namecheap: Domain List → Manage)**
- Account 2FA (**Profile → Security**), and **Auto-Renew** on for the domain and for
  WithheldforPrivacy: an expired domain can be registered by someone else, with your site and mail.
- **Sharing & Transfer** tab: transfer lock on.
- **Advanced DNS** tab: if **DNSSEC** is on, turn it off before moving DNS (it is re-enabled with
  Cloudflare's values in step d). Note any mail records (MX, SPF/DKIM TXT or CNAME); they must
  exist at Cloudflare before you switch nameservers.

**b. Add the domain to Cloudflare**
1. Account home → **Add a domain** / **Connect a domain** (direct link:
   `https://dash.cloudflare.com/?to=/:account/add-site`). Not "Register domains", which is for
   buying or transferring one.
2. Enter the bare domain, leave **Import DNS records** on Automatic, and continue. The AI crawler
   choices are a preference; the site has no content of its own to crawl.
3. **Free** plan.
4. **Review your DNS records**: every mail record from step a must be listed, all **DNS only**.
   A DKIM `CNAME` gets imported as **Proxied**: switch it to DNS only, or signed mail breaks. Delete
   registrar parking records. Add nothing for the website: Pages creates that record in step 6.
   Careful: the list starts with every row ticked, so do not click **Delete N records**.
5. **Continue to activation** shows two nameservers (`xxx.ns.cloudflare.com`).

**c. Switch nameservers** (Namecheap: **Domain** tab → **Nameservers** → **Custom DNS**, enter both,
green check). Cloudflare's "Only allow Cloudflare IPs at your origin" advice does not apply: Pages
has no origin server of yours. Activation is usually under an hour; check with
`dig +short NS example.com @1.1.1.1`. After the switch the registrar's own host records are
ignored: edit DNS only at Cloudflare.

**d. DNSSEC** (after Cloudflare shows the domain as active)
1. Cloudflare: **DNS → Settings → Enable DNSSEC**, then open **DS Record**. Note **Key Tag**,
   **Algorithm** (13), **Digest Type** (2) and **Digest**.
2. Namecheap: **Advanced DNS → DNSSEC** → Status on → one row. The dropdowns default to
   `1 RSA/MD5` and `1 SHA-1`: change them to **13 ECDSAP256SHA256** and **2 SHA-256**. Copy the key
   tag and digest with Cloudflare's copy buttons; do not retype them. Checkmark, then
   **Save all changes**.
3. Check what the registry itself has (no caching), for a `.dev` domain:
   ```bash
   dig +short DS example.com @ns-tld1.charlestonroadregistry.com
   dig +noall +comments MX example.com @1.1.1.1 | grep -E 'status|flags'
   ```
   The DS line must match Cloudflare's key tag and digest exactly, and the second command must
   show `status: NOERROR` with the `ad` flag. **A wrong DS record takes the whole domain offline,
   mail included** (`SERVFAIL` everywhere; it happened here with two digits of the key tag
   swapped). Fix it at the registrar at once, or switch DNSSEC off there; resolvers recover within
   the DS TTL (30 minutes for `.dev`).

**e. Mail records**
- If the domain receives mail (for example iCloud Custom Email Domain: two `MX`, an SPF `TXT`,
  an `apple-domain=` `TXT`, a DKIM `CNAME`), keep them as imported and add DMARC:
  `TXT _dmarc "v=DMARC1; p=quarantine; adkim=r; aspf=r"`. Do not use Cloudflare's **Email
  Security → Configure** wizard; it writes its own records over the provider's.
- If the domain sends no mail at all, publish these instead so nobody can spoof it:

  | Type | Name     | Content                               |
  |------|----------|---------------------------------------|
  | MX   | `@`      | `.` with priority `0` (null MX)       |
  | TXT  | `@`      | `v=spf1 -all`                         |
  | TXT  | `_dmarc` | `v=DMARC1; p=reject; adkim=s; aspf=s` |

**f. CAA**: `CAA @ 0 iodef "mailto:<address>"`, an address on another domain so reports still
arrive if this one breaks. Cloudflare then adds `issue`/`issuewild` records for the authorities
it uses (`dig +short CAA example.com` lists them); no other CA may issue for the domain.

### 4. SSL/TLS and features to leave off (your domain in the dashboard)
- **SSL/TLS → Overview**: **Full (Strict)**, Save. Leave the origin and post-quantum settings.
- **SSL/TLS → Edge Certificates** (cards further down the page):
  - **Always Use HTTPS** on; **Minimum TLS Version** TLS 1.2; **TLS 1.3** on.
  - **HSTS** off here: the site sends its own header.
  - **Automatic HTTPS Rewrites** off: it edits HTML in flight and the site has no `http://` links.
  - **Certificate Transparency Monitoring** on: email when any CA issues a certificate for you.
  - Never **Disable Universal SSL**. ACM and Total TLS are paid and not needed.
- **Turn off** everything that injects into pages (the CSP blocks it, and it would add third-party
  code): Rocket Loader, Email Address Obfuscation, Web Analytics automatic setup, Zaraz,
  Bot Fight Mode's JavaScript detections, Under Attack Mode, and the Overview's one-click
  Quick start features such as Client-side security.

### 5. Pages project
In the project folder, in a terminal you will deploy from:
```bash
export CLOUDFLARE_ACCOUNT_ID=<your account id>
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN   # paste, Enter; not shown, not in history
export WRANGLER_SEND_METRICS=false
npx wrangler pages project create tracker-suite --production-branch main
```
The variables last only for that terminal window. `main` is just Pages' name for production; it
does not need to match a git branch.

### 6. Custom domain, `www`, and one public address
1. **Workers & Pages → tracker-suite → Custom domains → Set up a custom domain** → `example.com`
   → Activate. Pages creates the DNS record itself. The "up to 48 hours" notice does not apply when
   DNS is already on Cloudflare; it is usually live in minutes. If your own computer still cannot
   resolve it, it cached the earlier empty answer:
   `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` (macOS).
2. **`www` → apex**:
   - **DNS → Records**: `AAAA` `www` `100::`, **Proxied** (a placeholder so Cloudflare answers
     for `www`).
   - **Rules → Redirect Rules** (template "Redirect from WWW to root", or a custom rule):
     Hostname equals `www.example.com` → Dynamic,
     `concat("https://example.com", http.request.uri.path)`, `301`, preserve query string.
3. **`*.pages.dev` → your domain** (account level, **Bulk Redirects**):
   - Create a list `pages_dev_to_domain`: source `tracker-suite.pages.dev`, target
     `https://example.com`, `301`, with **Preserve query string**, **Include subdomains**,
     **Subpath matching** and **Preserve path suffix** ticked. "Include subdomains" also covers the
     per-deploy addresses (`<hash>.tracker-suite.pages.dev`).
   - **Create Bulk Redirect Rule** for that list, Save and Deploy.

## Deploy

Commit and push your changes to `dev`, then:

```bash
git switch dev && git pull
npm run deploy:static
```

`scripts/deploy-static.sh` does every step and stops at the first problem:

1. **Code**: you must be on `dev` with no uncommitted changes, level with
   `origin/dev`. Only committed, pushed code goes live, so every deploy matches a
   commit.
2. **Checks**: `npm ci`, `npm test`, `npm audit --omit=dev`.
3. **Build**: `npm run build:static`, then checks that `out/` has the headers file and no API
   routes, source maps, database settings or values from `.env*`.
4. **Credentials**: asks for the account ID and the token unless `CLOUDFLARE_ACCOUNT_ID` /
   `CLOUDFLARE_API_TOKEN` are already set. The token is read without echo, never written to disk,
   and unset after the upload. Wrangler metrics are turned off.
5. **Confirm**, then upload with `wrangler pages deploy … --branch main` (production), recording
   the commit in the Pages dashboard.
6. **Live checks**: waits (up to 2 minutes) until the site serves this build's security policy,
   then checks every page returns 200, `/api/accounts` returns 404, and the security headers are
   present.

Options:
- `npm run deploy:static -- --dry-run` runs steps 1–3 and stops: a production build in `out/` to
  look at with `npm run preview:static` (restart the preview after every build; it reads
  `_headers` only at start).
- `DEPLOY_BRANCH`, `PAGES_PROJECT` and `SITE_URL` override the branch (`dev`), the Pages
  project (`tracker-suite`) and the address checked afterwards.

Notes:
- Every per-deploy address redirects to your domain, so the script checks the domain itself.
- Roll back from the dashboard (Workers & Pages → tracker-suite → Deployments → a previous deploy
  → Rollback).
- To deploy by hand instead: the commands in step 5 to set the variables, then `npm run
  build:static` and `npx wrangler pages deploy out --project-name tracker-suite --branch main`.

## After the first deploy

```bash
curl -sI https://example.com/ | grep -iE '^(HTTP|content-security|strict-transport|x-frame)'
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/api/accounts
for u in http://example.com/finance https://www.example.com/finance https://tracker-suite.pages.dev/finance; do curl -s -o /dev/null -w "$u -> %{http_code} %{redirect_url}\n" "$u"; done
dig +short DS example.com
dig +short CAA example.com
dig +short MX example.com
```

Expect: a 200 with the security headers; `404` for the API path; each other address a single `301`
to `https://example.com/finance`; your DS, CAA and mail records. Then run
[Mozilla Observatory](https://developer.mozilla.org/en-US/observatory) and
[SSL Labs](https://www.ssllabs.com/ssltest/) (tick "Do not show the results on the boards"). In
November 2026 this setup scored A+ (140, 12/12 tests) on Observatory and A+ on all four SSL Labs
endpoints.

### HSTS preload
`.dev` (and `.app`, `.page`, …) is already on browsers' HSTS preload list as a whole top-level
domain: every name under it is HTTPS-only, so there is nothing to submit. For other TLDs, the
header's `preload` does nothing until you submit the domain at [hstspreload.org](https://hstspreload.org);
that bakes HTTPS-only for the domain **and every subdomain** into browsers, and removal takes
months.

## Keeping it secure
- Run `npm audit --omit=dev` before deploys and keep Next.js current. Server-side advisories do not
  affect this static build, but client-side ones can.
- Never set a secret in a `NEXT_PUBLIC_*` variable: those are compiled into the public files.
- If a future feature adds a third-party script, image host or API, add it to
  `contentSecurityPolicy()` in `src/lib/deploy/static-headers.ts` deliberately; do not loosen
  `script-src`.
- Renew the deploy token before it expires (roll it), and keep domain auto-renew on.

## Later: accounts with server storage
That is a different deployment (Node server, auth, per-user data scoping, a MongoDB with auth on a
private network). Host it separately, e.g. `app.example.com`, and leave this static site as it is.
