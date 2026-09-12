# Contributing to Field

## Development

Use Node.js 22.13 or newer and the committed npm lockfile. Run `npm ci`, `npm run db:setup`, then `npm run dev -- --port 3001`. Keep local configuration in ignored `.dev.vars`; `.dev.vars.example` documents supported settings.

Before opening a pull request, run `npm run check`. The full isolated integration harness requires macOS, Linux or WSL. It does not require a live model or paid credential.

## Changes

Describe the trigger, previous behavior and resulting behavior. Include a minimal reproducible regression case for correctness fixes. Distinguish fixture verification from live-provider or browser verification.

State transitions belong in the domain layer, provider protocols in adapters, and storage writes behind database helpers. Keep views focused on interaction and presentation. Consult [the consistency contract](docs/consistency.md) before changing memory, actions, cancellation or revision handling.

Schema changes require a generated and inspected migration. Never rewrite an applied migration. Persisted-state changes must preserve valid earlier workspaces and canonical exports or provide a compatible migration.

Keep interface copy and public documentation in English. Use the established violet palette and follow [Zuri’s character specification](docs/zuri.md) for dialogue, appearance and performance. Interactive controls need accessible names, keyboard operation and appropriate reduced-motion behavior.

## Reports

Include reproduction steps, expected and actual behavior, operating system, Node version and relevant configuration names. Remove credentials, cookies, private conversations and memories from logs or examples. Security-sensitive reports should follow [SECURITY.md](SECURITY.md).
