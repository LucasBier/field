# Verification

## Reproduce

```sh
npm ci
npm run check
```

The full runner supports macOS, Linux and WSL. It runs types, lint, unit tests, isolated HTTP/D1 integration, source packaging and a production build. It strips application/test environment overrides, selects temporary ports, refuses port fallback, and cleans up owned processes and temporary data after completion or interruption.

No live model or paid provider is required. The integration environment uses a fresh source copy and database with the committed migrations, not an existing development workspace. The provider fixture identifies its replies as test data.

## Coverage map

| Property                                                 | Verification                                      |
| -------------------------------------------------------- | ------------------------------------------------- |
| Atomic batches and runtime terminal states               | `tests/runtime.test.ts`, `tests/entity.test.ts`   |
| Correction lineage, stale reviews and context boundaries | `tests/memory-repair.test.ts`                     |
| Completion/correction/revocation/cancellation order      | `tests/consistency.test.ts` — all 24 permutations |
| HTTP-only credentials and visitor isolation              | `tests/visitor.test.ts`                           |
| Database round trips and stale revision rejection        | `tests/storage.test.ts`                           |
| SSE framing, incomplete output and client reconciliation | `tests/hosted.test.ts`                            |
| Shared request lifecycle, quotas and expired leases      | `tests/hosted-storage.test.ts`                    |
| Native local streaming, schema and zero-cost accounting  | `tests/local-provider.test.ts`                    |
| Tab recovery, visitor binding and lost acknowledgements  | `tests/workspace-draft.test.ts`                   |
| Experiment calculations and evidence independence        | `tests/field.test.ts`                             |

The full harness runs separate configurations for normal requests, global cost exhaustion and global turn exhaustion. Mode-specific cases may report skipped in one phase and execute in another. `npm test` alone does not prepare these configurations; use `npm run check` or `npm run test:integration` for the complete fixture path.

## Live model evaluation

The opt-in `tests/local-live.test.ts` uses synthetic preferences in an isolated guest installation. It checks recall, a coffee-to-tea correction, plan creation, current permissions, idempotent replay and a three-attempt daily allowance.

```sh
FIELD_TEST_URL=http://localhost:3002 FIELD_TEST_LOCAL_LIVE=1 npm test
```

Run this only against an independently created guest test installation with the local model enabled and `FIELD_AI_VISITOR_TURNS="3"`. It calls the installed model and must not target a personal or production workspace.

A local development observation used Ollama 0.33.3 and Qwen3.5 9B, Q4_K_M, on an M4 with 24 GB memory and a 16K context. Three synthetic turns completed in 12.4, 9.6 and 12.0 seconds. First visible text arrived after 11.3, 5.1 and 6.2 seconds. Recall, correction, plan creation and permission checks passed in that scenario. These observations do not establish general quality, device-independent performance or hosted capacity.

## Character review

Nia’s character definition was sampled with the local Qwen3.5 9B model on 2026-09-09 using six fresh synthetic conversations: identity, company without advice, disagreement, a changed preference, invited affection and biography. Three follow-ups covered ordinary company, intended voice versus actual audio availability, and everyday banter. All nine responses validated as dialogue with empty action batches; no personal workspace was read or changed.

The review led to more direct conversational guidance. The model retained the specified age and appearance, could disagree, avoided inventing a childhood, and distinguished voice direction from available playback. Some ordinary replies still leaned on room metaphors or echoed wording from the direction. This is qualitative sampling, not a guarantee of characterization across models. Review variety and naturalness separately from protocol correctness.

## Release acceptance still required

Fixture checks do not establish funded-provider behavior, browser/mobile usability, long-running memory quality or production load. A hosted release should separately measure latency, failure rate, concurrent capacity, cost and backup recovery. Keep those results distinct from unit and protocol tests.
