# Field code map

Field is a local-first development project with a server-authoritative workspace. A working local companion is implemented; public inference, account recovery, voice and physical-room perception are separate release work.

## Boundaries

| Area                                              | Ownership                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `app/space/page.tsx`                              | Spatial layout, navigation, panels and visible controls                         |
| `hooks/use-companion.ts`                          | Connection selection, conversation lifecycle, provisional text and cancellation |
| `hooks/use-workspace.ts`                          | Loading, serialized saves, revision tracking, recovery and reconciliation       |
| `lib/workspace-draft.ts`                          | Validated, visitor-scoped, tab-local recovery copies                            |
| `lib/entity.ts`, `lib/runtime.ts`                 | Pure state transitions and permission-checked, atomic actions                   |
| `lib/memory.ts`, `lib/memory-repair.ts`           | Bounded recall, correction lineage and reviewed plan changes                    |
| `lib/hosted-provider.ts`, `lib/local-provider.ts` | Provider protocols and validated final results                                  |
| `app/api/companion/route.ts`                      | Server-owned identity/context, streaming and durable request lifecycle          |
| `db/workspace.ts`, `db/hosted.ts`                 | Revision-guarded persistence and transactional usage limits                     |
| `lib/agent-export.ts`                             | Canonical portable downloads without connection credentials                     |

Routes should compose these capabilities. Do not duplicate model orchestration in presentation components or let a provider write directly to storage. Domain functions return new state; rejected actions must not partially apply.

## Character definition

`lib/companion-character.ts` carries Nia’s identity, temperament, compact runtime direction, portrait reference and material palette. `lib/entity.ts` combines that direction with the permission and action contract used by local and hosted spatial conversations. The full writing, visual and voice specification is in [docs/nia.md](docs/nia.md). Character direction cannot grant a capability or create a saved relationship. Only exact earlier built-in profile defaults are upgraded; customized profiles and dialogue history remain intact.

## Spatial rendering

The character is a versioned, self-contained GLB loaded by `lib/companion-model.ts`. `components/agent-scene.tsx` coordinates skeletal animation, camera controls and navigation through the furnished apartment. The room geometry and light sources live in `lib/studio-room.ts`; obstacle clearance and path search live in `lib/room-navigation.ts`. Presentation coordinates remain local to the scene while nearest-zone reports use the existing persisted entity contract. See [character and room rendering](docs/character-rendering.md) for asset requirements and current limits.

## Saving and recovery

D1 remains authoritative. Every write carries its expected revision and visitor scope. A conflicting write fails rather than overwriting another tab. Shared model responses reload canonical state before the next edit; an uncertain stream is reconciled instead of automatically sending another inference request.

Unsaved edits also keep a canonical recovery copy in `sessionStorage`, scoped to the server-confirmed visitor. It is temporary private data in the current tab, not account recovery or a cross-device backup. Model connection credentials are excluded. The copy is removed after a confirmed save or explicit discard; copies older than seven days are ignored and removed when encountered. Closing the tab or clearing browser data can remove it.

On reload, fetch the authoritative space first. If it already matches the draft, remove the redundant copy. If the revision is unchanged, offer explicit restoration. If it changed, offer export and the saved version; never silently merge or overwrite newer state. Restoring does not resend a model request. Browser storage failure leaves the in-memory draft usable and displays an export reminder. When an earlier save completes with newer edits pending, advance their draft's base revision before the next save.

## Styles

`app/globals.css` declares the stylesheet order. `app/styles/foundation.css` contains framework mappings; `site.css` owns the current entrance and docs; `theme.css` owns shared tokens; `lab.css` contains laboratory and shared dialog rules; `space.css` contains the spatial surface and its earlier entrance rules. `app/field-story.css` owns scroll chapters. The split preserves the existing cascade exactly. Keep new rules in their owning surface; avoid appending unrelated overrides to the global entry.

## Verification

Run `npm run check` on macOS, Linux or WSL after `npm ci`. It runs types, lint, unit tests, an isolated integration environment, source packaging and the production build. No live model, provider credential or personal workspace is needed. Windows users can run unit checks directly and use WSL for the full integration harness.

The harness copies only the source archive's allowlist to a fresh temporary directory, creates its own D1 database, applies all committed migrations and starts an explicitly fake loopback provider. Separate phases verify normal requests, expired leases, global cost limits and global turn limits. It uses temporary ports, refuses port fallback, strips application/test environment overrides and shuts down its processes and temporary directory on success, failure or interruption. It leaves the existing preview and Ollama service alone.

`npm run test:unit` and `npm run test:integration` run the corresponding subsets. `npm test` remains the low-level suite: integration tests skip unless their explicit environment flags are supplied. Do not point these low-level integration tests at a personal or production database. The full check runner supplies all required fixture settings itself.

GitHub Actions is configured to run the same check on pushes and pull requests, with read-only repository permissions and no model secrets or deployment step. Its remote execution is only verified after the workflow actually runs on GitHub. Live local-model, funded-provider, browser/mobile and load evaluations remain separate and are not implied by this check passing.

## Current limits

- Workspaces remain bounded JSON snapshots. Pagination, archival and multi-device synchronization need dedicated design before scaling data volume.
- Recall is lexical BM25, not semantic retrieval. Corrections are explicit user actions.
- Anonymous identity is a browser cookie. There is no account recovery or device synchronization.
- Ollama through the shared service runs only in development. Public deployment needs an independently reachable inference service.
- No automatic production backups, restored-backup acceptance test, edge abuse controls or operational monitoring are delivered by the check workflow.
- Applied database migrations are immutable. Add reviewed migrations for future schema changes.

`lib/room-activities.ts` coordinates navigation and furniture transitions. `lib/companion-interaction.ts` layers two-bone contact and book/keyboard interaction over the imported motion clips. Its session state is separate from persisted workspace actions. `app/styles/room-layout.css` reserves canvas space independently of controls and conversation.
