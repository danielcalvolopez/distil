import { describe, it, expect } from "vitest";
import { clusterByText, jaccard } from "../src/detect/cluster.js";

describe("clusterByText", () => {
  it("groups items whose content words overlap and keeps the rest apart", () => {
    const items = ["never push to main", "don't push to main", "explain for a non-technical audience"];
    expect(clusterByText(items, (s) => s)).toEqual([[items[0], items[1]], [items[2]]]);
  });
  it("respects a custom threshold", () => {
    const items = ["never push to main", "don't push to main"];
    expect(clusterByText(items, (s) => s, 0.9)).toEqual([[items[0]], [items[1]]]);
  });
});

describe("jaccard", () => {
  it("is 1 for equal sets and 0 for disjoint sets", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });
});
