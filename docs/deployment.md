# Production deployment

Field runs on Vercel with a separate durable database. The browser, rendered pages,
workspace API, model calls and streaming responses all use the site's own origin.
An authenticated server-to-server adapter connects Vercel Functions to Cloudflare
D1. A database batch stays a single D1 transaction, including revision checks,
turn reservations and budget accounting.

The database endpoint is not a browser API. It requires a 256-bit credential,
rejects missing configuration, bounds request size and statement counts, suppresses
database errors, disables caching and never redirects. The Vercel adapter does not
retry an uncertain write. Neither the credential nor the operator's local workspace
is included in a build or source download.

## Provision storage

1. Create a D1 database in the same region as the Vercel function.
2. Copy `deploy/database.example.json` to `deploy/database.local.json` and fill in
   the database ID. The local configuration is excluded from source downloads and Git.
3. Apply the schema migrations and deploy the database endpoint:

```sh
npx wrangler d1 migrations apply DB --remote --config deploy/database.local.json
npx wrangler deploy --config deploy/database.local.json
npx wrangler secret put FIELD_DATABASE_TOKEN --config deploy/database.local.json
```

Use 32 random bytes represented as 64 hexadecimal characters for the credential.
Enter the same value as a sensitive production variable on Vercel. Store it in a
password manager or the providers' secret stores; do not commit it.

## Deploy Vercel

Link the Field repository to a Vercel project. The checked-in configuration sets
`npm run build:vercel` as the build command. Nitro produces Vercel's Build Output
API format with Node.js functions. Build on Vercel so native dependencies match its
Linux environment. Local development continues to use `npm run dev` and local D1.

Production variables:

| Variable | Value |
| --- | --- |
| `FIELD_DATABASE_URL` | The database Worker's HTTPS URL ending in `/batch` |
| `FIELD_DATABASE_TOKEN` | The same sensitive credential configured on the Worker |
| `FIELD_AI_ENABLED` | `false` until a hosted model and its budget are configured |

Each deployment receives its own environment. Preview environments must use a
separate database and credential; never attach an untrusted preview to production
storage. Leave storage variables absent for previews that only review the frontend.

Add the root domain to Vercel, then copy the exact A records shown in its domain
settings into the registrar. Add `www` with Vercel's recommended CNAME and redirect
it to the root hostname. Vercel issues and renews HTTPS certificates automatically.
Public access to the custom domain must not require a Vercel login.

## Release verification

Run `npm run check`, the Vercel build, and `npm audit --audit-level=high`. After
deployment, verify HTTPS, assets and all public routes. Create two fresh visitor
sessions and check that their scopes differ; save and reload a draft; reject stale
revisions and cross-origin mutations. The storage endpoint must return 401 without
its server credential. A successful deployment alone does not verify inference.

Local Ollama stays on the developer's machine. The production runtime deliberately
does not enable a loopback model. Visitors can explore the space and connect their own
supported provider; shared conversations require the server-side provider key,
rates, limits and budget described in `SETUP.md`.

## Operations

Vercel owns release rollbacks, request logs and function execution. D1 owns durable
storage and its recovery history. Roll back application code independently of the
database; do not reverse a migration that a newer release may already have used.
Rotate the storage credential in both providers together and redeploy Vercel.
An in-flight write can have an uncertain result during rotation or an outage; reload
the workspace and reconcile its revision instead of blindly resubmitting it.

This deployment starts with an empty production database. Local conversations and
the old hosted database remain separate and are not uploaded automatically.

## Private desk evidence

Vercel uses the authenticated D1 adapter for task records and private camera evidence. Evidence is stored in 128 KiB chunks and is readable only after upload completion. Images are capped at 256 KiB and video segments at 4 MiB. Local development uses its R2 binding. Apply `drizzle/0000_field.sql` to a fresh database; existing installations must preserve their data and baseline the current schema before using the new migration history. Never replay a fresh schema over an existing database.
