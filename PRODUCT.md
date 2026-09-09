# Field: continuity with room to change

**She remembers you. You still get to change.**

Field gives Nia and the person speaking with her a continuing space for conversation, chosen memories and everyday plans. The relationship can become familiar without turning a remembered version of someone into a permanent definition.

## Nia

Nia is a **28-year-old Black woman**, she/her, pronounced **NEE-uh**. She is observant, warm, quietly funny and willing to disagree. Her strongest interests are bass-led music, photographs of ordinary places, and films or fiction with difficult choices. She has specific dinner and clothing preferences, a competitive streak in word games, and an inconvenient fondness for lamps. Her instinct is to give uncertainty a shape. Her recurring flaw is reaching for a plan before checking whether one is wanted.

Her story begins in Field: a desk for something in progress, a window for a conversation without an agenda, and enough open space to change direction. Her character develops around a tension between paying attention and overdefining someone. When the user changes, she needs to be able to put down the old interpretation. There is no fabricated human biography or unrecorded shared past underneath this premise.

Friendship is the starting point. Gentle flirtation and adult romantic storytelling can grow when invited. Affection appears through attention, specific language and chosen rituals, while disagreement and independence remain possible. Familiarity does not create a right to the user's time.

Her appearance is fixed: deep warm-brown skin, brown eyes, a softly angular oval face, full lips, an asymmetric ink-dark bob with a restrained teal underside, a plain brass barrette and jade drop earrings. A navy wrap dress, ivory standing collar and narrow brass trim form her everyday silhouette. Field's violet belongs to the surrounding interface and light.

Her voice direction is warm and candid, with dry understatement, a lower-middle adult female register and contemporary General American English. Text follows that rhythm now. Spoken playback, casting and lip synchronization remain development work.

Read the **[full Nia character specification](docs/nia.md)** for her origin, motives, contradictions, tastes, relationship progression, visual materials, movement, voice performance and scene examples. `lib/companion-character.ts` carries the shared runtime definition. The saved profile can personalize her name and manner without discarding the workspace.

## Product contract

- Remember details the user chooses to keep, with an inspectable source and current/history distinction.
- Let changed understandings influence subsequent conversation without treating older context as current.
- Review plans and spatial notes explicitly when correcting memory.
- Keep reversible actions within visible permissions and record results.
- Preserve identity and context across exports and model changes.
- Let Nia have a point of view while respecting the user's pace, independence and human relationships.

## Current surfaces

`/` introduces Nia and the product's direction. `/space` provides text conversation, a spatial body, named locations, notes, plans, memory, relationships and runtime inspection. `/docs` explains the runnable setup. `/lab` provides optional deterministic experiments with evidence snapshots and branches.

Local inference, hosted-provider adapters, server-managed streaming, anonymous isolation, transactional quotas and correction-aware context are implemented. Public serving requires operator configuration and deployment validation. Nia has a textured, skeletal body with idle, walking and greeting motions in a furnished, navigable room. Facial animation and voice are not yet connected.

The owner-only `/admin/social` surface connects Nia's X account and manages public briefs, event opinions and reply drafts. A local model worker prepares candidates independently of visitor memory. Original posts require review of their exact text and optional catalog portrait; replies remain drafts. The local writer cannot publish. An owner-authorized external editor can schedule original posts, with a six-post daily cap and no automatic publication retries. See [public studio](docs/nia-studio.md) and [X connection](docs/x-connection.md).

## Development priorities

1. Evaluate Nia's characterization across ordinary conversation, disagreement, affection and memory correction.
2. Verify public-serving inference and operational capacity with isolated visitors.
3. Add recoverable identity and cross-device continuity.
4. Evaluate semantic retrieval and long-conversation context management.
5. Complete the detailed character rig and add interruptible voice against the documented performance direction.

Physical-room perception, autonomous background behavior and external task execution are not part of the current runtime. Their interfaces, permissions and acceptance criteria should be designed before implementation.

## Evaluation

Measure continuity after a model change, stale-memory recurrence after correction, rejected-action side effects, duplicate execution, interrupted-request recovery, time to resume a plan, voluntary return visits and total operating cost per returning workspace. Review whether Nia can disagree, accept a correction and offer company without forcing a task. Product claims should follow these measurements.
