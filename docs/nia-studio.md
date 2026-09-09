# Nia's public studio

The studio turns an explicitly public brief into a personal thought, a sourced
view on an event, or a reply draft. It uses the same character definition as the
conversation runtime, without importing visitor conversations or saved memories.
It is not a trends monitor or an autonomous reply bot.

## Run

Apply migration `0003_nia_drafts.sql` and deploy the application. Configure a new
32-byte random `FIELD_NIA_WORKER_KEY` as a sensitive server variable. Put only
`FIELD_X_ORIGIN` and `FIELD_NIA_WORKER_KEY` in a private JSON file on the machine
running Ollama. The worker credential can list, claim, complete or fail generation
jobs. It cannot queue, edit or publish posts. The owner credential remains separate.

```sh
FIELD_NIA_CREDENTIAL_FILE=/private/path/nia-worker.json npm run nia:drafts
# Run continuously while this computer is on:
FIELD_NIA_CREDENTIAL_FILE=/private/path/nia-worker.json npm run nia:drafts -- --watch
```

Ollama must serve `qwen3.5:9b` at `127.0.0.1:11434`. This process uses the local
model; it does not expose Ollama to the public internet or require a paid model
key. Production queues remain available when the worker is offline. A worker that
is stopped during generation can leave a job in `generating`; review its saved
local receipt before requesting another generation. Discarding a queued or
generating draft retires its revision so a late worker result cannot revive it. The worker never calls the
publication action.

Open `/admin/social`, enter the owner key and supply a topic and relevant public
source text. Event briefs also require an HTTPS source link. A URL is a reference;
the application does not fetch its contents. The operator must verify the text.
Reply briefs include the original X post ID. No private messages are imported.

Refresh the drafts after generation. Review the source, the proposed text and the
short editorial reason. Edit if needed and save the new revision. Check that you
reviewed the exact text, then select **Publish this post on X** for an original
post. Replies remain drafts; the studio links to the original conversation for
manual review. Unattended AI replies require written approval from X.

## Decisions and limits

The model can agree, disagree with a reason, ask a relevant question, state an
opinion or skip. Unverified event or reply sources must be skipped. Developing
event drafts cannot be published until a new verified brief is supplied. All
output is English. The publisher accepts text and an optional catalog portrait, without URLs, hashtags or
mentions, using conservative character weighting and a 280-unit limit. It does
not publish quotes, replies, likes, reposts or follows.

Generation has an atomic claim and revision check; an older result cannot replace
an already completed one. At most 20 queued/generating jobs are accepted. Briefs
are bounded, strict objects; workspace-shaped payloads and private visibility are
rejected. This boundary prevents automatic access to private memory; it cannot
prove that an operator manually pasting text has classified it correctly.

Publication is a separate owner-only action. It checks the reviewed text, attachment ID and
revision, then atomically claims the draft, enforces a six-post UTC daily cap,
blocks an exact normalized duplicate and excludes concurrent publications. X is
called only after that claim. There is no automatic publication retry: a lost
response may mean X already accepted the post. An uncertain publication blocks
further publishing until an operator checks the actual account and reconciles the
record. Do not clear that state merely to retry. Generation may continue while
publication is paused by an uncertain result.

The current limit is an operational default, not a purchase or investment budget.
X charges API credits for publishing. Local generation does not use those credits.
The worker makes a separate editorial-review call after generation. The review
checks factual support and natural voice independently, including recent posts
for repetition. A biography, list of hobbies, account announcement, forced joke
or slogan ending should be withheld even when its facts are supported. A rejected
review withholds the text; an incomplete review fails generation. This model check
is an additional filter, not a factual guarantee. A successful draft is evidence
that the model ran, not that its facts or judgment are correct. Character quality and editorial decisions still require review.

## Portraits and continuity

The portrait catalog in `lib/nia-media.ts` contains three authored scenes: a cafe
window, a bookshop and an evening street. Each entry pins the image bytes with a
SHA-256 digest. Briefs select an immutable catalog ID; arbitrary image URLs are
rejected. The server loads the image only from the configured site origin,
verifies its type, size and digest, uploads it through X API v2 and attaches the
returned media ID to the post. A media mismatch prevents publication. Image
selection is part of the exact review and cannot be substituted after approval.

These are fictional portraits of the same character, with different poses and
expressions. They do not establish that Nia visited a cafe, bought a book or had a
photographer. Captions may discuss styling, composition and mood; they must not
invent a completed real-world activity. The existing avatar and spatial model
remain separate assets. Generation provenance is retained in the image files.

## Public discovery and editorial scheduling

`npm run nia:discover` reads a loopback-only public-post feed named by
`FIELD_NIA_PUBLIC_FEED`. The adapter accepts up to 500 recent X posts and emits at
most 30 relevant signals. It removes duplicate IDs, old or future timestamps,
replies, malformed source URLs and unrelated topics. Interest matching covers
film, music, photography, design, word games and AI memory. It is a bounded
keyword filter, not a popularity ranking or a fact checker. Provider metadata and
operator state are never copied into briefs. Every discovered claim starts as
unverified and requires source review.

An external editorial scheduler can run every four hours under the owner's
explicit publishing authorization. Check publication history first, keep at least
four hours between scheduled posts, publish at most one per run and never catch
up missed slots. The server also caps all publications at six per UTC day. Select
one worthwhile subject, inspect its sources, generate a draft, review its facts
and voice, then approve the exact text and portrait. Skip weak or repetitive
material. Alternate occasional portraits with specific opinions; do not publish
the whole image set at once or treat every news item as content.

The draft worker still cannot publish. Scheduling is configured in the operator's
scheduler, not silently enabled by deploying this repository. Local scheduling
requires the computer, feed and scheduler to be running. Uncertain publication
states must be reconciled against X before any new publication. Never retry a
publication merely because a response was lost.
