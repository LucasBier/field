import {
  NIA_DAILY_POST_LIMIT,
  publicBrief,
  publicCandidate,
} from '../lib/nia-public';
import type { NiaMediaId } from '../lib/nia-media';
import { digest, XError } from '../lib/x-auth';
export type NiaDraft = {
  id: string;
  brief: string;
  candidate: string | null;
  phase: string;
  revision: number;
  fingerprint: string | null;
  post_id: string | null;
  created_at: number;
  updated_at: number;
};
export class NiaDrafts {
  constructor(private db: D1Database) {}
  async list() {
    return (
      await this.db
        .prepare(
          "SELECT * FROM nia_drafts WHERE phase IN ('queued','generating') OR id IN (SELECT id FROM nia_drafts ORDER BY created_at DESC LIMIT 40) ORDER BY created_at DESC",
        )
        .all<NiaDraft>()
    ).results;
  }
  async queue(input: unknown) {
    const brief = publicBrief(input),
      now = Date.now(),
      id = crypto.randomUUID();
    const r = await this.db
      .prepare(
        "INSERT INTO nia_drafts (id,brief,phase,revision,created_at,updated_at) SELECT ?,?,'queued',0,?,? WHERE (SELECT COUNT(*) FROM nia_drafts WHERE phase IN ('queued','generating'))<20",
      )
      .bind(id, JSON.stringify(brief), now, now)
      .run();
    if (!r.meta.changes) throw new XError('queue_full', 409);
    return { id };
  }
  async claim(id: string, revision: number) {
    return this.db
      .prepare(
        "UPDATE nia_drafts SET phase='generating',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND phase='queued' RETURNING *",
      )
      .bind(Date.now(), id, revision)
      .first<NiaDraft>();
  }
  async complete(id: string, revision: number, value: unknown) {
    const row = await this.get(id),
      candidate = publicCandidate(value, publicBrief(JSON.parse(row.brief)));
    const fingerprint =
      candidate.decision === 'draft'
        ? await digest(candidate.text.toLowerCase().replace(/\s+/g, ' ').trim())
        : null;
    const r = await this.db
      .prepare(
        "UPDATE nia_drafts SET candidate=?,fingerprint=?,phase=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND phase='generating'",
      )
      .bind(
        JSON.stringify(candidate),
        fingerprint,
        candidate.decision === 'draft' ? 'draft' : 'skipped',
        Date.now(),
        id,
        revision,
      )
      .run();
    if (!r.meta.changes) throw new XError('draft_changed', 409);
    return { saved: true };
  }
  async fail(id: string, revision: number) {
    return this.db
      .prepare(
        "UPDATE nia_drafts SET phase='failed',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND phase='generating'",
      )
      .bind(Date.now(), id, revision)
      .run();
  }
  async edit(id: string, revision: number, text: string) {
    const row = await this.get(id);
    if (!row.candidate) throw new XError('no_draft', 409);
    const candidate = publicCandidate(
      {
        ...JSON.parse(row.candidate),
        text,
        why: 'Edited after editorial review.',
      },
      publicBrief(JSON.parse(row.brief)),
    );
    const r = await this.db
      .prepare(
        "UPDATE nia_drafts SET candidate=?,fingerprint=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND phase='draft'",
      )
      .bind(
        JSON.stringify(candidate),
        await digest(candidate.text.toLowerCase().replace(/\s+/g, ' ').trim()),
        Date.now(),
        id,
        revision,
      )
      .run();
    if (!r.meta.changes) throw new XError('draft_changed', 409);
    return { saved: true };
  }
  async discard(id: string, revision: number) {
    const r = await this.db
      .prepare(
        "UPDATE nia_drafts SET phase='discarded',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND phase IN ('queued','generating','draft','failed','skipped')",
      )
      .bind(Date.now(), id, revision)
      .run();
    if (!r.meta.changes) throw new XError('draft_changed', 409);
    return { discarded: true };
  }
  async get(id: string) {
    const r = await this.db
      .prepare('SELECT * FROM nia_drafts WHERE id=?')
      .bind(id)
      .first<NiaDraft>();
    if (!r) throw new XError('draft_missing', 404);
    return r;
  }
  async publish(
    id: string,
    revision: number,
    approvedText: string,
    send: (text: string, mediaId?: NiaMediaId) => Promise<string>,
    approvedMediaId = '',
  ) {
    const row = await this.get(id),
      brief = publicBrief(JSON.parse(row.brief));
    if (brief.kind === 'reply') throw new XError('reply_is_draft_only', 409);
    if (brief.kind === 'event' && brief.source.certainty !== 'confirmed')
      throw new XError('source_needs_verification', 409);
    if ((brief.mediaId || '') !== approvedMediaId)
      throw new XError('review_changed', 409);
    const candidate = publicCandidate(
      JSON.parse(row.candidate || 'null'),
      brief,
    );
    if (candidate.decision !== 'draft' || candidate.text !== approvedText)
      throw new XError('review_changed', 409);
    const day = Date.now() - (Date.now() % 86400000);
    // Claim, global exclusion, duplicate prevention and daily cap are one atomic write.
    const lock = await this.db
      .prepare(
        "UPDATE nia_drafts SET phase='publishing',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND phase='draft' AND NOT EXISTS (SELECT 1 FROM nia_drafts WHERE phase IN ('publishing','uncertain')) AND NOT EXISTS (SELECT 1 FROM nia_drafts WHERE fingerprint=? AND phase='published') AND (SELECT COUNT(*) FROM nia_drafts WHERE phase='published' AND updated_at>=?)<?",
      )
      .bind(
        Date.now(),
        id,
        revision,
        row.fingerprint,
        day,
        NIA_DAILY_POST_LIMIT,
      )
      .run();
    if (!lock.meta.changes)
      throw new XError('publish_blocked_check_status_or_limit', 409);
    try {
      const postId = await send(candidate.text, brief.mediaId);
      const r = await this.db
        .prepare(
          "UPDATE nia_drafts SET phase='published',post_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND phase='publishing'",
        )
        .bind(postId, Date.now(), id, revision + 1)
        .run();
      if (!r.meta.changes) throw new Error('storage');
      return { published: true, postId };
    } catch {
      // A timeout can happen after X has accepted a post. Never retry or unlock implicitly.
      await this.db
        .prepare(
          "UPDATE nia_drafts SET phase='uncertain',revision=revision+1,updated_at=? WHERE id=? AND phase='publishing'",
        )
        .bind(Date.now(), id)
        .run();
      throw new XError('publication_unconfirmed_check_x', 502);
    }
  }
}
