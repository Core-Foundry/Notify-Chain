# Preview Deployments

Every pull request that touches the repository automatically gets a live preview
of the dashboard deployed to Cloudflare Pages.

---

## How it works

| Event | Action |
|---|---|
| PR opened / new commit pushed | Build the dashboard and deploy to a unique Cloudflare Pages branch URL |
| PR merged or closed | Delete the preview deployment and update the PR comment |

The deployment URL is posted as a comment on the PR and updated on every
subsequent push. Only one comment is ever created per PR — it is edited in
place, not duplicated.

---

## Accessing a preview

1. Open the pull request on GitHub.
2. Find the comment from the `github-actions` bot titled **🚀 Preview
   Deployment**.
3. Click the URL in the table. The preview reflects the exact commit at the
   head of the PR branch.

---

## Required repository secrets

A repository administrator must configure the following secrets under
**Settings → Secrets and variables → Actions** before previews will work.

| Secret | Where to find it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → **My Profile → API Tokens**. Create a token with the **Cloudflare Pages: Edit** permission scoped to your account. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right-hand sidebar on the **Workers & Pages** overview page. |
| `PREVIEW_EVENTS_API_URL` | The URL of a shared testnet listener instance used by all previews, e.g. `https://listener.testnet.example.com/api/events`. If none is available, leave this secret unset and the dashboard falls back to mock data automatically. |

---

## Cloudflare Pages project setup

The workflow targets a project named **`notify-chain-dashboard`**. If this
project does not exist yet, create it once:

```bash
# Install Wrangler if you don't already have it
npm install -g wrangler

# Authenticate
wrangler login

# Create the project (one-time setup — no need to link a Git repo)
wrangler pages project create notify-chain-dashboard
```

All subsequent deployments are handled entirely by the GitHub Actions workflows.

---

## Workflow files

| File | Purpose |
|---|---|
| `.github/workflows/preview.yml` | Triggered on `pull_request` (opened / synchronize / reopened). Builds the dashboard and deploys to Cloudflare Pages on a branch named `pr-<number>`. Posts or updates a PR comment with the URL. |
| `.github/workflows/preview-cleanup.yml` | Triggered on `pull_request` (closed). Deletes the Cloudflare Pages deployment for the branch and updates the PR comment to indicate the preview has been removed. |

---

## Environment variables in previews

Previews are built with the following Vite environment variables:

| Variable | Value |
|---|---|
| `VITE_EVENTS_API_URL` | Value of the `PREVIEW_EVENTS_API_URL` repository secret |
| `VITE_STELLAR_NETWORK` | `TESTNET` |

If `PREVIEW_EVENTS_API_URL` is not set, the dashboard automatically falls back
to built-in mock event data so the preview is still usable for UI review.

---

## Isolation

Each PR gets its own Cloudflare Pages branch deployment at a URL in the form:

```
https://pr-<number>.<your-pages-subdomain>.pages.dev
```

Deployments are fully isolated — they do not share state, cookies, or API
connections with each other or with the staging/production environment.
