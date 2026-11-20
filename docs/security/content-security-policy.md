# Dashboard Content Security Policy

The dashboard (`dashboard/`) sends a `Content-Security-Policy` header so the
browser refuses script injection and unapproved content loading even if an
attacker gets markup into the page. The policy is built by
`dashboard/src/security/csp.ts` and attached to responses in
`dashboard/vite.config.ts` for both `npm run dev` and `npm run preview`.

## Policy (production / `vite preview`)

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | Anything not listed below is same-origin only. |
| `script-src` | `'self'` | No inline scripts, no `eval`, no third-party scripts. |
| `style-src` | `'self'` | Same-origin stylesheets only; inline `<style>` elements are blocked. |
| `style-src-attr` | `'unsafe-inline'` | React `style={{...}}` props render as inline style *attributes*. Scoped to attributes so injected `<style>` stays blocked. |
| `img-src` | `'self' data: blob: https:` | Notification template previews render server-supplied HTML that may reference remote images. Images cannot execute code. |
| `font-src` | `'self' data:` | |
| `connect-src` | `'self'`, Stellar endpoints, API origins | See below. |
| `object-src` | `'none'` | No plugins. |
| `base-uri` | `'self'` | Blocks `<base>` hijacking of relative URLs. |
| `form-action` | `'self'` | Forms cannot post to other origins. |
| `frame-ancestors` | `'self'` | Matches the existing `X-Frame-Options: SAMEORIGIN`. |
| `report-uri` | only if `CSP_REPORT_URI` is set | Violation reports. |

### Development server

`npm run dev` additionally allows `'unsafe-inline'` in `script-src` and
`style-src` (React fast refresh injects an inline module and Vite injects
`<style>` tags) and local `http://`/`ws://` `localhost` and `127.0.0.1`
connections for the API and HMR socket. `'unsafe-eval'` is never allowed.

## Configuration

All variables are optional. They are read from the environment or `.env` files
when the dev/preview server starts.

| Variable | Effect |
|---|---|
| `VITE_EVENTS_API_URL`, `VITE_API_URL`, `VITE_NOTIFICATION_HEALTH_URL`, `VITE_INDEXING_HEALTH_URL` | The **origin** of each URL (scheme, host, port; no path) is added to `connect-src`. Relative and non-`http(s)` values are ignored (relative URLs are covered by `'self'`). |
| `CSP_CONNECT_SRC` | Extra `connect-src` origins, comma or space separated, e.g. `https://rpc.example.com wss://relay.example.com`. |
| `CSP_IMG_SRC` | Replaces the default image sources after `'self'`, e.g. `https://cdn.example.com data:`. |
| `CSP_REPORT_URI` | Absolute `http(s)` URL or a `/path` that receives violation reports. |
| `CSP_REPORT_ONLY` | `true` sends `Content-Security-Policy-Report-Only`: violations are reported but nothing is blocked. |
| `CSP_ENABLED` | `false` sends no CSP header (the other security headers are unchanged). |

Values from `CSP_*` are validated: only `http(s)`/`ws(s)` host sources (with an
optional `*.` subdomain wildcard and port) are accepted. Keywords such as
`'unsafe-inline'`, a bare `*`, whitespace, quotes and `;` are dropped, so an
environment value cannot widen the policy beyond a host or inject a directive.

## Third-party integrations

| Integration | Origins | Notes |
|---|---|---|
| Stellar RPC / Horizon | `https://soroban-testnet.stellar.org`, `https://horizon-testnet.stellar.org`, `https://horizon.stellar.org` | Always allowed. A custom or alternative RPC (for example a hosted provider) must be added through `CSP_CONNECT_SRC`. |
| Events / health API | origin of `VITE_EVENTS_API_URL` etc. | Allowed automatically. |
| `@creit.tech/stellar-wallets-kit` | depends on the wallet modules enabled | Not verified as part of this change. If a wallet module is blocked, roll out with `CSP_REPORT_ONLY=true`, read the reported blocked URIs, and add the needed origins through `CSP_CONNECT_SRC`. Wallets that open frames or load scripts from other origins need those origins added to the relevant directive in `csp.ts`. |
| Template preview images | any `https:` host | Allowed by default; tighten with `CSP_IMG_SRC`. |
| Webhook targets (Slack, Discord, ...) | none | Called by the listener, not the browser. |

## Investigating violations

1. **Browser console / DevTools.** A blocked load logs `Refused to load ... because it violates the following Content Security Policy directive: ...`. This is enough while developing.
2. **Report-only rollout.** Start with `CSP_REPORT_ONLY=true` and `CSP_REPORT_URI=<collector>`. The browser POSTs a `csp-report` JSON body for each violation (`blocked-uri`, `violated-directive`, `document-uri`) and nothing breaks. Switch to enforcing once the reports are clean.
3. **Check what is sent:**

   ```bash
   curl -sI http://localhost:4173/ | grep -i content-security-policy
   ```

   The collector is not part of this repository; point `CSP_REPORT_URI` at any endpoint that accepts `application/csp-report` POSTs.

## Rollout and rollback

- Roll out in report-only mode first (above), then remove `CSP_REPORT_ONLY`.
- Rollback without a code change: set `CSP_ENABLED=false` and restart the server. The previous headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) are unchanged by this feature.

## Hosting caveats

- Headers are produced by Vite's dev server and `vite preview`. If the built
  `dist/` is served by another host (CDN, nginx, static hosting), that host must
  send the same `Content-Security-Policy` header; copy the value that
  `curl -I` shows from `npm run preview` with the production environment variables.
- `docker-compose.yml` runs the `dev` Dockerfile target, which applies the
  development policy. The Dockerfile `production` stage installs with
  `--omit=dev` while `vite` is a dev dependency, so it does not serve through
  `vite preview` today; it is unchanged by this feature.

## Known limitations

- `style-src-attr 'unsafe-inline'` remains because the UI uses inline style props. Removing it requires moving those styles to classes.
- `img-src https:` is deliberately broad for template previews; it permits image requests (not script execution) to any HTTPS host.
- `frame-src`/`worker-src` fall back to `default-src 'self'`; wallet or preview features that embed other origins need explicit additions.
