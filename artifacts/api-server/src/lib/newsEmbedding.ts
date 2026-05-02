// Embedding-based news deduplication.
//
// The legacy dedup in /events uses a 4-word-overlap heuristic on titles.
// That misses near-duplicates that are paraphrased (different wording, same
// story) and over-merges short headlines that happen to share function words.
// This module provides an embedding-based replacement, gated behind
// EMBEDDING_DEDUP_ENABLED so the existing path remains the default until
// we've validated cluster quality on production data.
//
// Design choices:
//   - text-embedding-3-small: $0.02/M tokens, 1536-dim vectors. At ~14
//     headlines per /events call and ~20 tokens each, that's <0.5K tokens
//     per request — economically negligible.
//   - JSONB storage of float[]: avoids requiring pgvector. Cosine is
//     computed in JS on a small sliding window (≤14 items), well under
//     1ms even with 1536-dim vectors.
//   - Cosine similarity threshold 0.82: empirically a good split between
//     "same story" and "related but distinct". Tuned downward (more
//     aggressive merging) from the typical 0.85 because financial news
//     headlines about the same event vary more than general-purpose text.
//   - The Replit AI Integrations proxy does NOT support embeddings, so
//     we require a direct OPENAI_API_KEY. If absent, the helpers are
//     no-ops and callers fall back to the legacy heuristic.
import OpenAI from "openai";
import { logger } from "./logger";

const SIMILARITY_THRESHOLD = 0.82;
const EMBEDDING_MODEL = "text-embedding-3-small";

// Embeddings can't go through the AI Integrations proxy — they require a
// direct API key. We construct a dedicated client only if one is set.
let _client: OpenAI | null | undefined;
function getEmbeddingClient(): OpenAI | null {
  if (_client !== undefined) return _client;
  const directKey = process.env.OPENAI_API_KEY;
  if (!directKey) {
    _client = null;
    return null;
  }
  // Important: do NOT pass AI_INTEGRATIONS_OPENAI_BASE_URL here — that proxy
  // doesn't implement /embeddings. The default OpenAI base URL is what we want.
  _client = new OpenAI({ apiKey: directKey });
  return _client;
}

export function isEmbeddingDedupEnabled(): boolean {
  if ((process.env.EMBEDDING_DEDUP_ENABLED ?? "").toLowerCase() !== "true") return false;
  return getEmbeddingClient() !== null;
}

export type Embedding = number[];

export async function embedTexts(texts: string[]): Promise<Embedding[] | null> {
  if (texts.length === 0) return [];
  const client = getEmbeddingClient();
  if (!client) return null;
  try {
    const resp = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });
    // Return in the same order the SDK gives us; OpenAI guarantees
    // index alignment with the input array.
    return resp.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding as number[]);
  } catch (err: any) {
    logger.warn({ err: err?.message, count: texts.length }, "embedding generation failed");
    return null;
  }
}

export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Greedy clustering: walk the input in order, assign each item to the first
// existing cluster whose representative is similar enough; otherwise start
// a new cluster. Order matters — callers should pass items sorted by
// importance (impact_score DESC) so the cluster representative is the
// "best" article in each group.
export function clusterByEmbedding<T>(
  items: T[],
  embeddings: Embedding[],
  threshold: number = SIMILARITY_THRESHOLD,
): T[][] {
  if (items.length !== embeddings.length) {
    throw new Error(`clusterByEmbedding: items (${items.length}) / embeddings (${embeddings.length}) mismatch`);
  }
  const clusters: { rep: Embedding; members: T[] }[] = [];
  for (let i = 0; i < items.length; i++) {
    const emb = embeddings[i];
    let placed = false;
    for (const c of clusters) {
      if (cosineSimilarity(c.rep, emb) >= threshold) {
        c.members.push(items[i]);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ rep: emb, members: [items[i]] });
  }
  return clusters.map((c) => c.members);
}

// Convenience wrapper used by /events: dedup a list of articles by their
// titles, returning one representative per cluster. Falls back to returning
// the input unchanged when embeddings are unavailable.
export async function dedupByEmbedding<T extends { title: string }>(
  items: T[],
  threshold: number = SIMILARITY_THRESHOLD,
): Promise<{ items: T[]; usedEmbeddings: boolean }> {
  if (items.length <= 1) return { items, usedEmbeddings: false };
  const embeddings = await embedTexts(items.map((i) => i.title));
  if (!embeddings) return { items, usedEmbeddings: false };
  const clusters = clusterByEmbedding(items, embeddings, threshold);
  return { items: clusters.map((c) => c[0]), usedEmbeddings: true };
}
