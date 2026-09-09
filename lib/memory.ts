import type { Memory, Workspace } from './field';

export const activeMemories = (memories: Memory[]) =>
  memories.filter((m) => !m.supersededBy);

/** Keep earlier dialogue in the archive without re-injecting retired beliefs. */
export function currentMessages(w: Workspace, request = '') {
  const history =
    w.messages.at(-1)?.role === 'user' && w.messages.at(-1)?.text === request
      ? w.messages.slice(0, -1)
      : w.messages;
  return history.filter(
    (m) => (m.memoryVersion || 0) === (w.memoryVersion || 0),
  );
}

export const MEMORY_POLICY = { limit: 8, charBudget: 6000, perMemory: 1000 };
export type MemoryMatch = {
  id: string;
  score: number;
  reason: 'pinned' | 'relevant' | 'recent';
  chars: number;
  truncated: boolean;
};
export type MemorySelection = {
  method: 'bm25-v1';
  matches: MemoryMatch[];
  chars: number;
  budget: number;
  estimatedTokens: number;
};

const stopwords = new Set(
  'a an and are as at be by do for from how i in is it me my of on or our that the this to was we what when where which with you your'.split(
    ' ',
  ),
);
function terms(text: string) {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  ).filter((word) => !stopwords.has(word));
}

/** Deterministic, local BM25 retrieval. This is lexical search, not embeddings. */
export function retrieveMemories(memories: Memory[], query: string) {
  const documents = activeMemories(memories).map((memory) => ({
    memory,
    words: terms(memory.text),
  }));
  const queryTerms = [...new Set(terms(query))];
  const averageLength =
    documents.reduce((sum, d) => sum + d.words.length, 0) /
      (documents.length || 1) || 1;
  const frequencies = new Map(
    queryTerms.map((term) => [
      term,
      documents.filter((d) => d.words.includes(term)).length,
    ]),
  );
  const ranked = documents.map(({ memory, words }) => {
    let score = 0;
    for (const term of queryTerms) {
      const count = words.filter((word) => word === term).length;
      if (!count) continue;
      const frequency = frequencies.get(term) || 0;
      const idf = Math.log(
        1 + (documents.length - frequency + 0.5) / (frequency + 0.5),
      );
      score +=
        (idf * (count * 2.2)) /
        (count + 1.2 * (0.25 + (0.75 * words.length) / averageLength));
    }
    return { memory, score };
  });
  const hasMatch = ranked.some((item) => item.score > 0);
  const candidates = ranked
    .filter(({ memory, score }) => memory.pinned || score > 0 || !hasMatch)
    .sort(
      (a, b) =>
        Number(!!b.memory.pinned) - Number(!!a.memory.pinned) ||
        b.score - a.score ||
        Date.parse(b.memory.createdAt) - Date.parse(a.memory.createdAt) ||
        a.memory.id.localeCompare(b.memory.id),
    );
  const selected: Memory[] = [];
  const matches: MemoryMatch[] = [];
  let chars = 0;
  for (const { memory, score } of candidates) {
    if (
      selected.length >= MEMORY_POLICY.limit ||
      chars >= MEMORY_POLICY.charBudget
    )
      break;
    const text = memory.text.slice(
      0,
      Math.min(MEMORY_POLICY.perMemory, MEMORY_POLICY.charBudget - chars),
    );
    selected.push({ ...memory, text });
    matches.push({
      id: memory.id,
      score: Number(score.toFixed(5)),
      reason: memory.pinned ? 'pinned' : score > 0 ? 'relevant' : 'recent',
      chars: text.length,
      truncated: text.length < memory.text.length,
    });
    chars += text.length;
  }
  const selection: MemorySelection = {
    method: 'bm25-v1',
    matches,
    chars,
    budget: MEMORY_POLICY.charBudget,
    estimatedTokens: Math.ceil(chars / 4),
  };
  return { memories: selected, selection };
}
