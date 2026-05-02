import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  clusterByEmbedding,
  cosineSimilarity,
  dedupByEmbedding,
  isEmbeddingDedupEnabled,
} from "./newsEmbedding";

// Snapshot env so cases that mutate it can restore between tests. Without
// this, ordering between describe blocks can leak flag state.
const ORIGINAL_ENV = {
  EMBEDDING_DEDUP_ENABLED: process.env.EMBEDDING_DEDUP_ENABLED,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};
function restoreEnv() {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  });
  it("returns 0 for orthogonal vectors", () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });
  it("returns 0 when either vector is zero", () => {
    assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  });
  it("returns 0 on length mismatch instead of throwing", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
  });
});

describe("clusterByEmbedding", () => {
  it("merges items above threshold and splits below", () => {
    // Three items: A and A' near-identical, B distinct.
    const items = ["A", "A-prime", "B"];
    const embs = [
      [1, 0, 0],
      [0.99, 0.01, 0],
      [0, 1, 0],
    ];
    const clusters = clusterByEmbedding(items, embs, 0.9);
    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters[0], ["A", "A-prime"]);
    assert.deepEqual(clusters[1], ["B"]);
  });

  it("preserves order — first item in each cluster is the representative", () => {
    const items = ["first", "second", "third"];
    const embs = [
      [1, 0],
      [0, 1],
      [0.99, 0.01],
    ];
    const clusters = clusterByEmbedding(items, embs, 0.9);
    // "third" matches "first" so they cluster together; "first" stays as rep.
    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters[0], ["first", "third"]);
    assert.deepEqual(clusters[1], ["second"]);
  });

  it("throws on input/embedding length mismatch", () => {
    assert.throws(() => clusterByEmbedding(["a", "b"], [[1, 0]], 0.5));
  });
});

// These tests guard the "byte-identical behaviour when flag is off"
// contract that the /events route relies on. If isEmbeddingDedupEnabled()
// ever returns true under the wrong combination of env vars, the dedup
// pass would silently change /events output for every deployment.
describe("isEmbeddingDedupEnabled / dedupByEmbedding gating", () => {
  afterEach(() => restoreEnv());

  it("returns false when EMBEDDING_DEDUP_ENABLED is unset (default off)", () => {
    delete process.env.EMBEDDING_DEDUP_ENABLED;
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(isEmbeddingDedupEnabled(), false);
  });

  it("returns false when EMBEDDING_DEDUP_ENABLED is the literal string 'false'", () => {
    process.env.EMBEDDING_DEDUP_ENABLED = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    assert.equal(isEmbeddingDedupEnabled(), false);
  });

  it("returns false when flag is on but no OPENAI_API_KEY is configured (proxy can't do embeddings)", () => {
    process.env.EMBEDDING_DEDUP_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    assert.equal(isEmbeddingDedupEnabled(), false);
  });

  it("dedupByEmbedding returns input unchanged with usedEmbeddings=false when client unavailable", async () => {
    process.env.EMBEDDING_DEDUP_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    const items = [
      { title: "Apple beats Q3 earnings" },
      { title: "Cupertino giant tops estimates" },
      { title: "Some unrelated headline" },
    ];
    const out = await dedupByEmbedding(items);
    // No embeddings -> input echoed back, allowing the route to fall back
    // to the existing word-overlap heuristic without losing articles.
    assert.equal(out.usedEmbeddings, false);
    assert.deepEqual(out.items, items);
  });

  it("dedupByEmbedding short-circuits on length <= 1 without touching env or network", async () => {
    process.env.EMBEDDING_DEDUP_ENABLED = "true";
    process.env.OPENAI_API_KEY = "sk-test"; // would otherwise instantiate a client
    const empty = await dedupByEmbedding([]);
    assert.deepEqual(empty, { items: [], usedEmbeddings: false });
    const single = await dedupByEmbedding([{ title: "only one" }]);
    assert.equal(single.usedEmbeddings, false);
    assert.equal(single.items.length, 1);
  });
});
