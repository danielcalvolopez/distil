import type { Evidence, Session, Turn } from "../types.js";
import { humanTurns } from "../parser.js";
import { toEvidence } from "./corrections.js";

/**
 * Two kinds of repetition are worth automating:
 *  1. Prompt patterns — the human types the same kind of instruction across sessions
 *     ("explain what you did for a non-technical audience", "run the full test suite and fix").
 *     Candidate: a skill or a slash command.
 *  2. Post-edit checks — right after editing files, the agent keeps running the same check
 *     (npm test, tsc, lint). Candidate: a PostToolUse hook that runs it automatically.
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

export interface CheckPattern {
  command: string; // normalised, e.g. "npm test"
  count: number;
  sessions: Set<string>;
  examples: Evidence[];
}

const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
const RUNNERS = new Set([
  "npm", "pnpm", "yarn", "bun", "npx", "pnpx", "bunx", "deno", "make", "just", "cargo", "go", "uv", "poetry",
  "pytest", "tsc", "eslint", "prettier", "biome", "ruff", "mypy", "vitest", "jest", "gradle", "mvn", "dotnet", "swift",
]);
const CHECK = /\b(test|tests|lint|typecheck|type-check|tsc|build|format|fmt|check|vet|vitest|jest|pytest|eslint|prettier|ruff|mypy|clippy|biome)\b/;

/** "cd app && CI=1 npm test -- --run foo" → "npm test": the first segment that runs a check, without flags or paths. */
export function checkCommand(command: string): string | undefined {
  for (const segment of command.split("\n")[0].split(/&&|\|\||;|\|/)) {
    const words: string[] = [];
    for (const w of segment.trim().split(/\s+/)) {
      if (!w || (words.length === 0 && w.includes("="))) continue; // env assignments
      if (w.startsWith("-") || /[/"'=.<>&]/.test(w) || words.length === 3) break;
      words.push(w);
    }
    const cmd = words.join(" ");
    if (RUNNERS.has(words[0]) && CHECK.test(cmd)) return cmd;
  }
  return undefined;
}

/** Checks the agent runs right after editing files, counted between human turns. */
export function recurringPostEditChecks(sessions: Session[], min = 3, minSessions = 2): CheckPattern[] {
  const found = new Map<string, CheckPattern>();
  for (const s of sessions) {
    let edited = false;
    for (const t of s.turns) {
      if (t.role !== "assistant") {
        if (!t.toolResult && !t.meta) edited = false;
        continue;
      }
      for (const c of t.toolCalls) {
        if (EDIT_TOOLS.has(c.name)) edited = true;
        const cmd = edited && c.command ? checkCommand(c.command) : undefined;
        if (!cmd) continue;
        edited = false;
        const entry = found.get(cmd) ?? { command: cmd, count: 0, sessions: new Set<string>(), examples: [] };
        entry.count++;
        entry.sessions.add(s.sessionId);
        if (entry.examples.length < 3) entry.examples.push(toEvidence(t, ["repeat"]));
        found.set(cmd, entry);
      }
    }
  }
  return [...found.values()].filter((p) => p.count >= min && p.sessions.size >= minSessions).sort((a, b) => b.count - a.count);
}
