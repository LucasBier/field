'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { ZuriDraft } from '@/db/zuri-drafts';
import {
  ZURI_DAILY_POST_LIMIT,
  postWeight,
  type PublicBrief,
  type PublicCandidate,
} from '@/lib/zuri-public';
import { ZURI_MEDIA, zuriMedia } from '@/lib/zuri-media';
const fieldStyle = {
  display: 'block',
  width: '100%',
  padding: 12,
  border: '1px solid #ccc',
  borderRadius: 8,
  margin: '6px 0 16px',
  fontSize: 16,
} as const;
export function ZuriStudio({ ownerKey }: { ownerKey: string }) {
  const [kind, setKind] = useState<PublicBrief['kind']>('thought'),
    [topic, setTopic] = useState(''),
    [source, setSource] = useState(''),
    [url, setUrl] = useState(''),
    [replyTo, setReplyTo] = useState(''),
    [mediaId, setMediaId] = useState(''),
    [certainty, setCertainty] =
      useState<PublicBrief['source']['certainty']>('developing'),
    [rows, setRows] = useState<ZuriDraft[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({}),
    [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  async function call(body: Record<string, unknown>) {
    const r = await fetch('/api/social/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + ownerKey,
      },
      body: JSON.stringify(body),
    });
    const data = (await r.json()) as {
      error?: string;
      drafts?: ZuriDraft[];
      postId?: string;
    };
    if (!r.ok) throw new Error(data.error || 'Request could not be completed.');
    return data;
  }
  async function refresh() {
    const data = await call({ action: 'list' });
    setRows(data.drafts || []);
    setEdits({});
    setReviewed({});
  }
  async function perform(body: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const data = await call(body);
      await refresh();
      setMessage(
        data.postId
          ? 'Published on X.'
          : body.action === 'queue'
            ? 'Queued for the local model. The draft worker must be running on your computer.'
            : 'Saved.',
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Could not confirm the request.',
      );
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !ownerKey;
  return (
    <section
      style={{ marginTop: 56, borderTop: '1px solid #ddd', paddingTop: 28 }}
    >
      <h2 style={{ fontSize: 28 }}>Zuri’s public notebook</h2>
      <p>
        Give her a topic, an event, or something to respond to. She can form a
        view, ask a question, or decide there is nothing useful to add.
      </p>
      <label htmlFor="zuri-kind">Write a</label>
      <select
        id="zuri-kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as PublicBrief['kind'])}
        style={fieldStyle}
      >
        <option value="thought">Personal thought</option>
        <option value="event">View on an event</option>
        <option value="reply">Reply draft</option>
      </select>
      {kind === 'thought' && (
        <>
          <label htmlFor="zuri-photo">Portrait</label>
          <select
            id="zuri-photo"
            value={mediaId}
            onChange={(e) => setMediaId(e.target.value)}
            style={fieldStyle}
          >
            <option value="">Text only</option>
            {ZURI_MEDIA.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.title}
              </option>
            ))}
          </select>
          {zuriMedia(mediaId) && (
            <Image
              unoptimized
              src={zuriMedia(mediaId)!.path}
              alt={zuriMedia(mediaId)!.description}
              width={224}
              height={280}
              style={{ borderRadius: 12, objectFit: 'cover', marginBottom: 16 }}
            />
          )}
          {mediaId && (
            <p>
              A fictional portrait of Zuri. Describe the image without inventing
              a real outing.
            </p>
          )}
        </>
      )}
      <label htmlFor="zuri-topic">Topic</label>
      <input
        id="zuri-topic"
        value={topic}
        maxLength={240}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="A film ending you disagree with, a design change, a question worth asking…"
        style={fieldStyle}
      />
      <label htmlFor="zuri-source">Public source text</label>
      <textarea
        id="zuri-source"
        rows={5}
        maxLength={6000}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Paste the relevant facts or the post she is responding to. Keep private conversations out."
        style={fieldStyle}
      />
      <label htmlFor="zuri-url">Source link</label>
      <input
        id="zuri-url"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        style={fieldStyle}
      />
      {kind !== 'thought' && (
        <>
          <label htmlFor="zuri-certainty">Source status</label>
          <select
            id="zuri-certainty"
            value={certainty}
            onChange={(e) =>
              setCertainty(e.target.value as PublicBrief['source']['certainty'])
            }
            style={fieldStyle}
          >
            <option value="confirmed">
              I have verified the supplied facts
            </option>
            <option value="developing">Still developing</option>
            <option value="unverified">Unverified — do not amplify</option>
          </select>
        </>
      )}
      {kind === 'reply' && (
        <>
          <label htmlFor="zuri-reply">Original X post ID</label>
          <input
            id="zuri-reply"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="The number at the end of the post link"
            style={fieldStyle}
          />
          <p>
            Replies remain drafts. Unattended AI replies require X’s written
            approval.
          </p>
        </>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          className="field-btn field-btn-primary"
          disabled={disabled || !topic.trim()}
          onClick={() =>
            void perform({
              action: 'queue',
              brief: {
                kind,
                topic,
                source: { visibility: 'public', text: source, url, certainty },
                replyTo: kind === 'reply' ? replyTo : '',
                ...(kind === 'thought' && mediaId ? { mediaId } : {}),
              },
            })
          }
        >
          Prepare a draft
        </button>
        <button
          className="field-btn"
          disabled={disabled}
          onClick={() => {
            setBusy(true);
            void refresh()
              .catch(() => setMessage('Could not load drafts.'))
              .finally(() => setBusy(false));
          }}
        >
          Refresh drafts
        </button>
      </div>
      <output style={{ display: 'block', margin: '18px 0' }}>
        {busy ? 'Working…' : message}
      </output>
      <p style={{ color: '#665d75' }}>
        Only public material belongs here. Links are references; their contents
        are not fetched automatically. Publishing requires your review and is
        limited to {ZURI_DAILY_POST_LIMIT} original posts per UTC day.
      </p>
      {rows
        .filter((row) => row.phase !== 'discarded')
        .map((row) => {
          const brief = JSON.parse(row.brief) as PublicBrief,
            c = row.candidate
              ? (JSON.parse(row.candidate) as PublicCandidate)
              : null,
            text = edits[row.id] ?? c?.text ?? '',
            changed = c && text !== c.text;
          return (
            <article
              key={row.id}
              style={{
                border: '1px solid #ded8e7',
                borderRadius: 12,
                padding: 20,
                margin: '18px 0',
              }}
            >
              <p style={{ fontSize: 14, color: '#665d75' }}>
                {brief.kind} · {row.phase}
              </p>
              <h3 style={{ fontSize: 20 }}>{brief.topic}</h3>
              {zuriMedia(brief.mediaId) && (
                <figure style={{ margin: '16px 0' }}>
                  <Image
                    unoptimized
                    src={zuriMedia(brief.mediaId)!.path}
                    alt={zuriMedia(brief.mediaId)!.description}
                    width={224}
                    height={280}
                    style={{ borderRadius: 12, objectFit: 'cover' }}
                  />
                  <figcaption>
                    {zuriMedia(brief.mediaId)!.title} · Fictional portrait
                  </figcaption>
                </figure>
              )}
              {brief.source.url && (
                <a
                  href={brief.source.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#784be8' }}
                >
                  Read source
                </a>
              )}
              {brief.source.text && (
                <details style={{ margin: '16px 0' }}>
                  <summary>Source text · {brief.source.certainty}</summary>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{brief.source.text}</p>
                </details>
              )}
              {c && (
                <>
                  <p>{c.why}</p>
                  {c.decision === 'draft' && (
                    <>
                      <label htmlFor={'draft-' + row.id}>Draft text</label>
                      <textarea
                        id={'draft-' + row.id}
                        style={fieldStyle}
                        rows={4}
                        value={text}
                        disabled={row.phase !== 'draft'}
                        onChange={(e) => {
                          setEdits({ ...edits, [row.id]: e.target.value });
                          setReviewed({ ...reviewed, [row.id]: false });
                        }}
                      />
                      <p>
                        {postWeight(text)} / 280 · {c.stance}
                      </p>
                    </>
                  )}
                </>
              )}
              {row.phase === 'draft' && c?.decision === 'draft' && (
                <>
                  <button
                    className="field-btn"
                    disabled={disabled || !changed}
                    onClick={() =>
                      void perform({
                        action: 'edit',
                        id: row.id,
                        revision: row.revision,
                        text,
                      })
                    }
                  >
                    Save edits
                  </button>
                  {brief.kind === 'reply' ? (
                    <a
                      href={'https://x.com/i/status/' + brief.replyTo}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-block',
                        marginLeft: 16,
                        color: '#784be8',
                      }}
                    >
                      Open conversation
                    </a>
                  ) : (
                    <>
                      {brief.kind === 'event' &&
                        brief.source.certainty !== 'confirmed' && (
                          <p>
                            Verify the facts and create a new brief before
                            publishing this event.
                          </p>
                        )}
                      <label style={{ display: 'block', margin: '16px 0' }}>
                        <input
                          type="checkbox"
                          checked={!!reviewed[row.id]}
                          onChange={(e) =>
                            setReviewed({
                              ...reviewed,
                              [row.id]: e.target.checked,
                            })
                          }
                        />{' '}
                        I reviewed the facts, exact text and attached portrait.
                      </label>
                      <button
                        className="field-btn field-btn-primary"
                        disabled={
                          disabled ||
                          !!changed ||
                          !reviewed[row.id] ||
                          postWeight(text) > 280 ||
                          (brief.kind === 'event' &&
                            brief.source.certainty !== 'confirmed')
                        }
                        onClick={() =>
                          void perform({
                            action: 'publish',
                            id: row.id,
                            revision: row.revision,
                            text,
                            reviewed: true,
                            mediaId: brief.mediaId || '',
                          })
                        }
                      >
                        Publish this post on X
                      </button>
                    </>
                  )}
                </>
              )}
              {['queued', 'generating', 'draft', 'failed', 'skipped'].includes(
                row.phase,
              ) && (
                <button
                  className="field-btn"
                  disabled={disabled}
                  style={{ margin: '16px 0' }}
                  onClick={() =>
                    void perform({
                      action: 'discard',
                      id: row.id,
                      revision: row.revision,
                    })
                  }
                >
                  Discard draft
                </button>
              )}
              {row.post_id && (
                <a
                  href={'https://x.com/i/status/' + row.post_id}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#784be8' }}
                >
                  View published post
                </a>
              )}
              {(row.phase === 'uncertain' || row.phase === 'publishing') && (
                <p>
                  Publication is not yet confirmed. Check X before any further
                  attempt; automatic retries are blocked.
                </p>
              )}
              {row.phase === 'generating' && (
                <p>
                  The local worker is preparing this draft. Refresh to check its
                  result.
                </p>
              )}
              {row.phase === 'failed' && (
                <p>The draft could not be completed. No post was sent.</p>
              )}
            </article>
          );
        })}
    </section>
  );
}
