import { createHash } from "node:crypto";
import type { Evidence, Proposal, Session, Store } from "./types.js";
import { detectCorrections } from "./detect/corrections.js";
import { clusterPrompts, recurringToolSequences, shingle } from "./detect/patterns.js";
import { clusterByText } from "./detect/cluster.js";
import type { Config } from "./store.js";

function id(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 10);
}

/** Rough sentence that captures the instruction, stripped of interjections. */
function ruleSentence(text: string): string {
  const first = text.split(/(?<=[.!?])\s|\n/)[0] ?? text;
  return first.replace(/^[\s\-—–,]+/, "").replace(/^(no|nope|stop|wait|hold on|again|actually)[,!.]?\s*/i, "").replace(/^[\s\-—–,]+/, "").trim();
}

function upsert(store: Store, p: Proposal): void {
  const existing = store.proposals[p.id];
  if (!existing) {
    store.proposals[p.id] = p;
    return;
  }
  // Keep the human decision; merge evidence.
  const seen = new Set(existing.evidence.map((e) => e.turnId));
  for (const e of p.evidence) if (!seen.has(e.turnId)) existing.evidence.push(e);
  existing.lastSeen = Math.max(existing.lastSeen, p.lastSeen);
  existing.firstSeen = Math.min(existing.firstSeen, p.firstSeen);
  existing.projects = [...new Set([...existing.projects, ...p.projects])];
  existing.confidence = Math.max(existing.confidence, p.confidence);
}

export function buildProposals(sessions: Session[], store: Store, cfg: Config): void {
  // ---- corrections → rules ----------------------------------------------
  const evidence: Evidence[] = sessions.flatMap((s) => detectCorrections(s, { protectedBranches: cfg.protectedBranches }));

  // Merge with backlog singletons from prior scans, then cluster by lexical similarity.
  const pool: Evidence[] = [...Object.values(store.backlog).flat(), ...evidence];
  const byTurn = new Map(pool.map((e) => [e.turnId, e]));
  const clusters = clusterByText([...byTurn.values()], (e) => e.excerpt);
  store.backlog = {};
  for (const c of clusters) {
    const sessionsInvolved = new Set(c.map((e) => e.sessionId));
    // "branch" and "recovery" signals are strong enough to surface alone; others need corroboration.
    const strong = c.some((e) => e.signals.includes("branch") || (e.signals.includes("recovery") && e.signals.includes("interrupt")));
    if (sessionsInvolved.size < cfg.corroboration && !strong) {
      store.backlog[c[0].turnId] = c;
      continue;
    }
    const rep = c.slice().sort((a, b) => b.signals.length - a.signals.length)[0];
    const sentence = ruleSentence(rep.excerpt);
    const signalWeight = Math.min(1, c.reduce((n, e) => n + e.signals.length, 0) / 6);
    const p: Proposal = {
      id: id("rule", shingle(rep.excerpt).sort().slice(0, 6).join(" ")),
      kind: "rule",
      title: sentence.length > 90 ? sentence.slice(0, 90) + "…" : sentence,
      target: "CLAUDE.md",
      draft: `- ${sentence}`,
      confidence: Math.min(1, 0.4 + 0.15 * sessionsInvolved.size + 0.3 * signalWeight),
      evidence: c,
      projects: [...new Set(c.map((e) => e.project))],
      firstSeen: Math.min(...c.map((e) => e.ts || Date.now())),
      lastSeen: Math.max(...c.map((e) => e.ts || 0)),
      status: "pending",
    };
    upsert(store, p);
  }

  // ---- repeated prompts → skills -----------------------------------------
  for (const cl of clusterPrompts(sessions)) {
    if (cl.sessions.size < cfg.corroboration) continue;
    const rep = cl.turns[0];
    const p: Proposal = {
      id: id("skill", cl.key),
      kind: "skill",
      title: `Repeated request: ${cl.key.replace(/-/g, " ")}`,
      target: `.claude/skills/${cl.key}/SKILL.md`,
      draft: [
        `---`,
        `name: ${cl.key}`,
        `description: Use when the user asks to ${cl.key.replace(/-/g, " ")}. (Seen ${cl.turns.length}× across ${cl.sessions.size} sessions.)`,
        `---`,
        ``,
        `# ${cl.key}`,
        ``,
        `<!-- Representative prompt the user keeps typing: -->`,
        `> ${rep.text.split("\n")[0].slice(0, 200)}`,
        ``,
        `## Steps`,
        `1. <fill in — what did the agent do well when this went right?>`,
      ].join("\n"),
      confidence: Math.min(1, 0.3 + 0.1 * cl.turns.length + 0.1 * cl.sessions.size),
      evidence: cl.turns.map((t) => ({
        turnId: t.id, sessionId: t.sessionId, project: t.project, file: t.file, line: t.line, ts: t.ts,
        excerpt: t.text.slice(0, 300), signals: ["repeat"],
      })),
      projects: [...new Set(cl.turns.map((t) => t.project))],
      firstSeen: Math.min(...cl.turns.map((t) => t.ts || Date.now())),
      lastSeen: Math.max(...cl.turns.map((t) => t.ts || 0)),
      status: "pending",
    };
    upsert(store, p);
  }

  // ---- repeated tool chains → hooks --------------------------------------
  for (const seq of recurringToolSequences(sessions)) {
    const p: Proposal = {
      id: id("hook", seq.seq.join(">")),
      kind: "hook",
      title: `Recurring tool chain: ${seq.seq.join(" → ")}`,
      target: ".claude/settings.json (hooks)",
      draft:
        `The agent ran ${seq.seq.join(" → ")} ${seq.count}× across ${seq.sessions.size} sessions.\n` +
        `Consider a PostToolUse hook on "${seq.seq[0]}" that runs the follow-up steps automatically,\n` +
        `or a skill step that names this chain so the agent stops re-deriving it.`,
      confidence: Math.min(1, 0.2 + 0.05 * seq.count),
      evidence: seq.examples,
      projects: [...new Set(seq.examples.map((e) => e.project))],
      firstSeen: Math.min(...seq.examples.map((e) => e.ts || Date.now())),
      lastSeen: Math.max(...seq.examples.map((e) => e.ts || 0)),
      status: "pending",
    };
    upsert(store, p);
  }
}
