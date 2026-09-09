import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  publicMessages,
  publicCandidate,
  publicBrief,
  PUBLIC_CANDIDATE_SCHEMA,
  PUBLIC_REVIEW_SCHEMA,
  publicReviewMessages,
  reviewedPublicCandidate,
} from '../lib/nia-public';
import type { NiaDraft } from '../db/nia-drafts';
const watch = process.argv.includes('--watch');
const file = process.env.FIELD_NIA_CREDENTIAL_FILE;
if (!file)
  throw new Error(
    'Set FIELD_NIA_CREDENTIAL_FILE to the private worker configuration.',
  );
const credentials = JSON.parse(await readFile(file, 'utf8')) as {
  FIELD_X_ORIGIN: string;
  FIELD_NIA_WORKER_KEY: string;
};
const origin = credentials.FIELD_X_ORIGIN;
if (
  new URL(origin).origin !== origin ||
  !origin.startsWith('https://') ||
  !/^[a-f0-9]{64}$/.test(credentials.FIELD_NIA_WORKER_KEY)
)
  throw new Error('Invalid worker configuration.');
async function api(body: Record<string, unknown>) {
  const r = await fetch(origin + '/api/social/drafts', {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: 'Bearer ' + credentials.FIELD_NIA_WORKER_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const v = (await r.json()) as {
    error?: string;
    drafts?: NiaDraft[];
    job?: NiaDraft | null;
  };
  if (!r.ok) throw new Error(v.error || 'Studio request failed.');
  return v;
}
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
console.log(
  'Nia local draft worker ready. It creates drafts; it cannot publish posts.',
);
do {
  try {
    const rows = (await api({ action: 'list' })).drafts || [];
    const pending = rows
      .filter((r) => r.phase === 'queued')
      .reverse()
      .slice(0, 3);
    for (const row of pending) {
      if (stopped) break;
      const job = (
        await api({ action: 'claim', id: row.id, revision: row.revision })
      ).job;
      if (!job) continue;
      try {
        const brief = publicBrief(JSON.parse(job.brief));
        const published = rows
          .filter((r) => r.phase === 'published' && r.candidate)
          .map((r) => ({
            text: (JSON.parse(r.candidate!) as { text: string }).text,
          }))
          .reverse();
        const messages = publicMessages(brief, published);
        const r = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen3.5:9b',
            messages,
            format: PUBLIC_CANDIDATE_SCHEMA,
            think: false,
            stream: false,
            options: { num_ctx: 16384, num_predict: 700, temperature: 0.7 },
          }),
          signal: AbortSignal.timeout(120000),
        });
        if (!r.ok) throw new Error('Local model unavailable.');
        const data = (await r.json()) as {
          done?: boolean;
          done_reason?: string;
          message?: { content: string };
        };
        if (
          !data.done ||
          data.done_reason === 'length' ||
          !data.message?.content
        )
          throw new Error('Incomplete local response.');
        let candidate = publicCandidate(
          JSON.parse(data.message.content),
          brief,
        );
        if (candidate.decision === 'draft') {
          const checked = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'qwen3.5:9b',
              messages: publicReviewMessages(brief, candidate),
              format: PUBLIC_REVIEW_SCHEMA,
              think: false,
              stream: false,
              options: { num_ctx: 8192, num_predict: 400, temperature: 0 },
            }),
            signal: AbortSignal.timeout(120000),
          });
          if (!checked.ok) throw new Error('Source review unavailable.');
          const review = (await checked.json()) as {
            done?: boolean;
            done_reason?: string;
            message?: { content?: string };
          };
          if (
            !review.done ||
            review.done_reason === 'length' ||
            !review.message?.content
          )
            throw new Error('Incomplete source review.');
          candidate = publicCandidate(
            reviewedPublicCandidate(
              candidate,
              JSON.parse(review.message.content),
            ),
            brief,
          );
        }
        // Retain the result privately before saving, so a lost response never forces a duplicate model run.
        const path = process.env.FIELD_NIA_RECEIPTS;
        if (path) {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(
            path,
            JSON.stringify(
              {
                id: job.id,
                revision: job.revision,
                candidate,
                at: new Date().toISOString(),
              },
              null,
              2,
            ),
            { mode: 0o600 },
          );
        }
        await api({
          action: 'complete',
          id: job.id,
          revision: job.revision,
          candidate,
        });
        console.log(
          candidate.decision === 'draft'
            ? 'Draft saved for review.'
            : 'Nia chose not to post.',
        );
      } catch {
        await api({ action: 'fail', id: job.id, revision: job.revision }).catch(
          () => undefined,
        );
        console.error(
          'One draft could not be completed. Check the studio; no post was published.',
        );
      }
    }
  } catch {
    console.error(
      'Studio unavailable. Retrying only the read/claim loop; publication is never called.',
    );
  }
  if (watch && !stopped) await new Promise((r) => setTimeout(r, 10000));
} while (watch && !stopped);
