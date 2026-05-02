import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clusterByEmbedding, cosineSimilarity } from "./newsEmbedding";

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
