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
output is English. The initial publisher accepts plain text, without URLs or
mentions, using conservative character weighting and a 280-unit limit. It does
not publish images, quotes, replies, likes, reposts or follows.

Generation has an atomic claim and revision check; an older result cannot replace
an already completed one. At most 20 queued/generating jobs are accepted. Briefs
are bounded, strict objects; workspace-shaped payloads and private visibility are
rejected. This boundary prevents automatic access to private memory; it cannot
prove that an operator manually pasting text has classified it correctly.

Publication is a separate owner-only action. It checks the reviewed text and
revision, then atomically claims the draft, enforces a two-post UTC daily cap,
blocks an exact normalized duplicate and excludes concurrent publications. X is
called only after that claim. There is no automatic publication retry: a lost
response may mean X already accepted the post. An uncertain publication blocks
further publishing until an operator checks the actual account and reconciles the
record. Do not clear that state merely to retry. Generation may continue while
publication is paused by an uncertain result.

The current limit is an operational default, not a purchase or investment budget.
X charges API credits for publishing. Local generation does not use those credits.
A successful draft is evidence that the model ran, not that its facts or judgment
are correct. Character quality and editorial decisions still require review.
