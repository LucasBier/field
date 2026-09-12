# Run Field

Use Node.js 22.13 or newer. Extract the source archive and open a terminal in its `field` folder.

```sh
npm ci
npm run db:setup
npm run dev -- --port 3001
```

Accept the prompt to apply the local database migration. This creates the local D1 emulator storage and does not require a Cloudflare account. Open http://localhost:3001 and keep the terminal running. The same commands work in macOS/Linux terminals and Windows PowerShell. If PowerShell blocks npm.ps1, use `npm.cmd` in place of `npm`.

The in-app guide at `/docs` covers connections, customization, data portability, and troubleshooting.

## Local conversations without a key

Install [Ollama](https://ollama.com/download). On macOS, `brew install ollama` is also supported. The tested starting model is [Qwen3.5 9B](https://ollama.com/library/qwen3.5:9b), approximately 6.6 GB at Q4_K_M quantization. On this M4 / 24 GB machine it runs through Metal. Do not start a second Ollama service if one is already listening on port 11434.

In one terminal, run `npm run model:serve` and keep it running. In a second terminal, run `npm run model:pull` once. The helper binds only loopback, disables Ollama cloud features, allows the local Field origin, and limits inference to one request and one loaded model.

Merge these settings into `.dev.vars`, preserving any existing local workspace setting:

```dotenv
FIELD_AI_ENABLED="true"
FIELD_AI_PROVIDER="ollama"
FIELD_AI_MODEL="qwen3.5:9b"
FIELD_AI_CONCURRENCY="1"
FIELD_AI_VISITOR_TURNS="100"
```

Restart Field with `npm run dev -- --port 3001`. Opening `/space` automatically chooses **Local · qwen3.5:9b** when the installed model is reachable. The browser calls Field's backend; only the backend calls local Ollama. Visitors do not need to enter a key or grant browser access to the model port. Keep both the Field and Ollama processes running. First use can be slower while model weights load; unused weights are released after ten minutes.

There are no provider API charges for local inference. The computer supplies memory, power and compute. Local attempts still count toward visitor/global turn limits and concurrency limits, with exactly zero recorded API cost. Requests have a 120-second timeout and a 180-second recovery lease. The 16K model context reserves room for output and rejects oversized inputs instead of silently dropping earlier context. Only the final schema-validated response can save actions. Local inference is intentionally disabled in production builds: a cloud-hosted Field instance cannot use localhost to reach this computer.

If the connection is offline, start Ollama and refresh the space. To unload weights while leaving Ollama running, use `ollama stop qwen3.5:9b`. Stopping Ollama does not delete the downloaded model or saved companion data.

## Other model connections

When Field’s shared connection is enabled by the site owner, `/space` selects it automatically and visitors need no key. Otherwise demo mode needs no key, and the model button offers personal connections for open-ended conversation.

For local inference, install Ollama and a chat model that supports JSON output. Use `ollama list` to inspect installed models. Quit any running Ollama desktop process before starting another server from your terminal.

macOS / Linux:

```sh
OLLAMA_ORIGINS="http://localhost:3001" ollama serve
```

Windows PowerShell:

```powershell
$env:OLLAMA_ORIGINS="http://localhost:3001"
ollama serve
```

Then select **Local model → Find local models → Use this local model** in Field. Browser local-network permission may be required. For the Ollama desktop app or a Linux service, follow its documented environment configuration and restart it: https://docs.ollama.com/faq

For hosted inference, select **Hosted API**, choose a DeepSeek model, enter your key, and select **Use hosted model**. Keys stay in the current tab's memory and are sent through Field's server only for explicit model requests. Provider charges apply. Reloading clears the connection.

## Enable conversations for visitors

For a hosted shared provider, set `FIELD_AI_PROVIDER="deepseek"` and choose DeepSeek V4 Flash or V4 Pro. Copy `.dev.vars.example` to a new `.dev.vars`, or merge its settings into an existing file without removing local compatibility settings. This file is ignored by Git. Set `FIELD_AI_KEY` to your provider credential privately on the server, `FIELD_AI_DAILY_USD` to your chosen daily allowance, and both input/output rates to the provider’s current standard USD price per million tokens. Then set `FIELD_AI_ENABLED="true"` and restart the development server. No key belongs in frontend code, chat, an export or the source ZIP. Production must use server secret bindings instead of publishing this local file.

Configuration fields:

| Variable                          | Meaning                                               | Default  |
| --------------------------------- | ----------------------------------------------------- | -------- |
| `FIELD_AI_ENABLED`                | Explicit switch; requires all mandatory configuration | `false`  |
| `FIELD_AI_KEY`                    | Server-side DeepSeek credential                       | Required |
| `FIELD_AI_MODEL`                  | `deepseek-v4-flash` or `deepseek-v4-pro`              | Flash    |
| `FIELD_AI_DAILY_USD`              | Global daily reserved-cost allowance                  | Required |
| `FIELD_AI_INPUT_USD_PER_MILLION`  | Current standard input rate                           | Required |
| `FIELD_AI_OUTPUT_USD_PER_MILLION` | Current standard output rate                          | Required |
| `FIELD_AI_VISITOR_TURNS`          | Attempts per visitor per UTC day                      | `20`     |
| `FIELD_AI_SITE_TURNS`             | Attempts across all visitors per UTC day              | `1000`   |
| `FIELD_AI_CONCURRENCY`            | Active requests across all visitors                   | `4`      |
| `FIELD_AI_MAX_OUTPUT`             | Maximum output tokens per response                    | `1200`   |

Keep both rates current using the [provider’s documentation](https://api-docs.deepseek.com/). The runtime reserves conservative input and maximum output before a request. Failures and cancellations retain that reservation because generation may already have occurred. This allowance is separate from provider billing controls and does not guarantee the final invoice. Clearing or importing a conversation cannot reset the server ledger. Anonymous visitors can obtain new identities by clearing cookies; global caps still apply. There is no automatic paid retry or fallback.

After configuration, enter `/space` and check **Field connection**. No secret is returned by the availability endpoint. Test a short message, a remembered preference, and a correction; inspect the resulting Runtime trace. A successful fixture test does not substitute for this live-provider verification. The paid DeepSeek path stays disabled without a funded key and explicit budget. The local Ollama path needs neither.

## Customize and preserve state

Edit the saved name, personality, and permissions in the Identity panel. New-workspace defaults live in `lib/field.ts`; the character definition and visual palette live in `lib/companion-character.ts`; the action contract lives in `lib/entity.ts`; model adapters live in `lib/inference.ts`. Preserve the JSON response schema and action contract when changing behavior. The 3D body is in `lib/companion-avatar.ts`, and the portrait is a separate image under `public/characters`. [Zuri’s specification](docs/zuri.md) defines her personality, appearance and voice direction. Exact earlier built-in personality defaults are upgraded without replacing customized profiles or saved history.

Local workspace data lives under `.wrangler/state`. Use **Export agent** to transfer state between separate installations. Exports contain private context; model keys are excluded. Hosted Field uses hosted D1 even when inference is local. Each browser has a separate guest workspace enforced on the server. Its private cookie is the access credential; clearing cookies starts a new space. Export history before changing devices. The shared model service and usage limits are implemented but require operator configuration. Public release also needs deployment, monitoring and hosting-level abuse controls.

To retain the original single-user draft in an existing local checkout, copy `.dev.vars.example` to `.dev.vars` and set `FIELD_LOCAL_WORKSPACE="true"`. This compatibility option only works in development on loopback origins and is ignored in production. Fresh copies default to isolated visitors. Restart the development server after changing local variables.

## Inspect a request

In Memory, save a detail, pin it if it is a priority, and use Preview recall to inspect which records a message would select. The spatial adapters use BM25 keyword relevance, with a bounded memory-text budget. Pins take priority but remain subject to the same limits.

After sending a message, open Runtime. Inspect the selected memories, terminal status, categorized failure if any, duration, provider token usage when available, and action receipts. A prepared demo response uses no inference. If a save fails after a reply completes, use the save indicator's Retry rather than sending the same request again. Interrupted tabs can leave unfinished runs.

The homepage walkthroughs use public sample data; interacting with them does not modify your saved companion.

## Check and build

```sh
npm run check
```

The full check runs on macOS, Linux or WSL. It uses a temporary database and fake provider, without changing your saved space or calling a live model. For only unit tests, use `npm run test:unit`; for the isolated database and service checks, use `npm run test:integration`. See `ARCHITECTURE.md` for the verification boundaries.

If saving fails, keep the tab open and use Retry or Export draft. A temporary recovery copy in the same tab can survive a reload. Field offers restoration only if the saved version has not changed; otherwise export the draft before continuing. This does not provide account recovery or a permanent backup.

The build refreshes the source download from an explicit file allowlist. The archive excludes credentials, saved workspaces, Git history, and the original hosted project ID. The database binding is a local placeholder. Deploying your own copy requires your own hosting project and database configuration.
