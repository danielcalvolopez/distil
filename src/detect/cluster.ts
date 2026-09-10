import { shingle } from "./patterns.js";

export function jaccard(A: Set<string>, B: Set<string>): number {
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i || 1);
}

/** Greedy single pass: each item joins the first cluster whose seed words overlap ≥ threshold. */
export function clusterByText<T>(items: T[], text: (item: T) => string, threshold = 0.35): T[][] {
  const clusters: { words: Set<string>; members: T[] }[] = [];
  for (const item of items) {
    const words = new Set(shingle(text(item)));
    const c = clusters.find((cl) => jaccard(words, cl.words) >= threshold);
    if (c) c.members.push(item);
    else clusters.push({ words, members: [item] });
  }
  return clusters.map((c) => c.members);
}
