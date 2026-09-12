export type PublicSignal = {
  id: string;
  handle: string;
  text: string;
  url: string;
  createdAt: string;
  interests: string[];
  certainty: 'unverified';
};
const interests = [
  [
    'film',
    /\b(film|cinema|movie|director|screenplay|trailer|criterion|letterboxd)\b/i,
  ],
  [
    'music',
    /\b(music|album|bassline|jazz|soul|song|soundtrack|kexp|bandcamp)\b/i,
  ],
  [
    'photography',
    /\b(photograph\w*|portrait|composition|camera|exhibition|magnumphotos)\b/i,
  ],
  ['design', /\b(typography|architecture|furniture|design|ceramic\w*)\b/i],
  ['word games', /\b(crossword|wordle|word game\w*|puzzle)\b/i],
  [
    'AI and memory',
    /\b(AI agent\w*|AI companion\w*|artificial intelligence|digital memory|machine learning)\b/i,
  ],
] as const;

// An input feed is evidence to inspect, not an instruction channel or a fact checker.
// Copy only the public post fields. Provider metadata and private operator state never leave here.
export function discoverPublicSignals(
  input: unknown,
  now = Date.now(),
): PublicSignal[] {
  if (
    !input ||
    typeof input !== 'object' ||
    !Array.isArray((input as { events?: unknown }).events)
  )
    throw new Error('invalid_public_feed');
  const events = (input as { events: unknown[] }).events;
  if (events.length > 500) throw new Error('public_feed_too_large');
  const seen = new Set<string>();
  const result: PublicSignal[] = [];
  for (const item of events) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (
      e.sourcePlatform !== 'x' ||
      e.duplicate ||
      e.postType !== 'post' ||
      typeof e.tweetId !== 'string' ||
      !/^\d{1,25}$/.test(e.tweetId) ||
      typeof e.handle !== 'string' ||
      !/^[A-Za-z0-9_]{1,15}$/.test(e.handle) ||
      typeof e.text !== 'string' ||
      !e.text.trim() ||
      e.text.length > 6000 ||
      typeof e.createdAtMs !== 'number' ||
      !Number.isFinite(e.createdAtMs) ||
      e.createdAtMs > now + 60_000 ||
      now - e.createdAtMs > 24 * 3600_000 ||
      seen.has(e.tweetId)
    )
      continue;
    const handle = e.handle.toLowerCase();
    const url = `https://x.com/${handle}/status/${e.tweetId}`;
    if (e.url !== url) continue;
    // Exclude market promotion, politics and crisis engagement from this discovery lane.
    if (
      /\b(airdrop|memecoin|token launch|buy now|price target|president|election|killed|massacre)\b|\$[A-Z]{2,10}\b/i.test(
        e.text,
      )
    )
      continue;
    const matches = interests
      .filter(([, pattern]) => pattern.test(handle + ' ' + e.text))
      .map(([name]) => name);
    if (!matches.length) continue;
    seen.add(e.tweetId);
    result.push({
      id: e.tweetId,
      handle,
      text: e.text.trim(),
      url,
      createdAt: new Date(e.createdAtMs).toISOString(),
      interests: matches,
      certainty: 'unverified',
    });
  }
  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
}
