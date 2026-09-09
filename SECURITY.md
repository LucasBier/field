# Security boundaries

Field's current development line is 0.1.x. Review fixes against the latest main branch.

## Reporting

Use the repository's private vulnerability reporting form when enabled. Include a minimal synthetic reproduction, the affected path and expected impact. Do not include real visitor credentials, model keys, conversations or workspace exports in a public issue.

## Trust model

- The browser can edit its own validated workspace. Its payload is untrusted input to the server.
- Visitor credentials are HTTP-only cookies. Server-derived scope controls access; a supplied scope cannot authorize another visitor's workspace.
- Model output is untrusted. Schema, current permissions, memory context and run status are checked before actions commit.
- Shared-provider keys and usage accounting remain server-side. Provider endpoints are constrained; the test override is development-only and loopback-only.
- Prepared statements and revision guards protect writes. Export/import copies canonical fields, excluding arbitrary credential-bearing properties.
- Runtime history belongs to user-editable workspace state. It supports inspection but is not an immutable security audit log.

## Operating limits

Visitors can obtain new identities by clearing cookies. Per-visitor limits do not provide account-level abuse resistance; global cost, request and concurrency limits remain applicable. Public deployment also needs hosting-level abuse controls, monitoring, an independently reachable inference service, and verified backup/recovery procedures.

Tab recovery copies are private workspace data in session storage. They are not encrypted independently of the browser and are not durable backups. Personal model credentials remain in memory for the current session and are excluded from canonical exports.

Local model serving binds to loopback and is disabled in production builds. The companion action contract does not implement automatic paid fallback, background inference, arbitrary shell execution, filesystem access or external messaging.

## Dependency maintenance

The lockfile pins the tested dependency graph. Run `npm audit` separately from offline protocol checks; CI rejects known high and critical dependency advisories. Review compatible upstream fixes before accepting a changed lockfile.

A scoped npm override pins the legacy `@esbuild-kit/core-utils` transform dependency to esbuild 0.25.12. This avoids its older vulnerable development-server package without downgrading the migration tool. The migration generator and the full check exercise this configuration. Revisit the override when the migration tool removes the legacy loader.

The local emulator's Sharp dependency is overridden to the patched 0.35.4 release within its existing minor version. Remove this override when the emulator adopts that patch or a newer compatible release.
