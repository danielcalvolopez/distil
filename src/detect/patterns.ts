import type { Evidence, Session, Turn } from "../types.js";
import { humanTurns } from "../parser.js";
import { toEvidence } from "./corrections.js";

/**
 * Two kinds of repetition are worth automating:
 *  1. Prompt patterns — the human types the same kind of instruction across sessions
 *     ("explain what you did for a non-technical audience", "run the full test suite and fix").
 *     Candidate: a skill or a slash command.
 *  2. Tool sequences — the agent performs the same tool chain over and over
 *     (Read→Edit→Bash(test)→Bash(lint)). Candidate: a hook or a skill step.
 */

const STOP = new Set(
  "the a an and or of to in on for with this that it is are be as at by from into your my our me you please can could would should just also then now let's lets ok okay yes no thanks".split(" "),
);

/** Normalise a prompt into a bag of content words; drop paths, code, numbers. */
export function shingle(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\w./-]+\.(ts|tsx|js|md|json|py|yml|yaml)\b/g, " ")
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export interface PromptCluster {
  key: string;          // most frequent words, used as a stable id
  turns: Turn[];
  sessions: Set<string>;
}

export function clusterPrompts(sessions: Session[], threshold = 0.45, minWords = 4): PromptCluster[] {
  const items = sessions
    .flatMap(humanTurns)
    .map((t) => ({ t, words: new Set(shingle(t.text)) }))
    .filter((x) => x.words.size >= minWords);

  // Inverted index (word -> cluster ids) so a prompt is only scored against clusters sharing a word;
  // any cluster that shares none has jaccard 0 and can never pass the threshold.
  const clusters: { words: Set<string>; items: typeof items }[] = [];
  const index = new Map<string, number[]>();
  const addWords = (c: number, words: Set<string>) => {
    for (const w of words) {
      if (clusters[c].words.has(w)) continue;
      clusters[c].words.add(w);
      const ids = index.get(w);
      if (ids) ids.push(c);
      else index.set(w, [c]);
    }
  };
  for (const it of items) {
    const overlap = new Map<number, number>();
    for (const w of it.words) for (const c of index.get(w) ?? []) overlap.set(c, (overlap.get(c) ?? 0) + 1);
    let best = -1;
    let bestScore = 0;
    for (const [c, inter] of overlap) {
      const s = inter / (it.words.size + clusters[c].words.size - inter);
      // Ties go to the oldest cluster, matching a linear scan in creation order.
      if (s >= threshold && (best < 0 || s > bestScore || (s === bestScore && c < best))) {
        best = c;
        bestScore = s;
      }
    }
    if (best >= 0) {
      clusters[best].items.push(it);
      addWords(best, it.words); // widen slowly
    } else {
      clusters.push({ words: new Set(), items: [it] });
      addWords(clusters.length - 1, it.words);
    }
  }

  return clusters
    .filter((c) => c.items.length >= 2)
    .map((c) => {
      const freq = new Map<string, number>();
      for (const { words } of c.items) for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
      const key = [...freq.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([w]) => w)
        .join("-");
      const turns = c.items.map((x) => x.t);
      return { key, turns, sessions: new Set(turns.map((t) => t.sessionId)) };
    });
}

export interface ToolSequence {
  seq: string[];
  count: number;
  sessions: Set<string>;
  examples: Evidence[];
}

/** Count recurring n-grams of tool names within assistant runs between human turns. */
export function recurringToolSequences(sessions: Session[], n = 3, min = 3): ToolSequence[] {
  const counts = new Map<string, ToolSequence>();
  for (const s of sessions) {
    let run: { tool: string; turn: Turn }[] = [];
    const flush = () => {
      for (let i = 0; i + n <= run.length; i++) {
        const window = run.slice(i, i + n);
        const seq = window.map((w) => w.tool);
        // skip trivial repeats like Read,Read,Read
        if (new Set(seq).size === 1) continue;
        const k = seq.join(">");
        const entry = counts.get(k) ?? { seq, count: 0, sessions: new Set(), examples: [] };
        entry.count++;
        entry.sessions.add(s.sessionId);
        if (entry.examples.length < 3) entry.examples.push(toEvidence(window[0].turn, ["repeat"]));
        counts.set(k, entry);
      }
      run = [];
    };
    for (const t of s.turns) {
      if (t.role === "assistant") for (const { name: tool } of t.toolCalls) run.push({ tool, turn: t });
      else if (!t.toolResult && !t.meta) flush();
    }
    flush();
  }
  return [...counts.values()].filter((v) => v.count >= min && v.sessions.size >= 2).sort((a, b) => b.count - a.count);
}
