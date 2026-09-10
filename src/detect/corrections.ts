import type { Evidence, Session, Signal, Turn } from "../types.js";
import { EXCERPT_MAX, isHuman } from "../parser.js";

export interface CorrectionConfig {
  protectedBranches: string[];
}

/** Rhetorical shapes that usually open a correction. Order matters only for readability. */
const LEXICAL: RegExp[] = [
  /^(no|nope|stop|wait|hold on|don'?t|never)\b/i,
  /\b(don'?t|do not|never|stop) (do|use|run|touch|edit|modify|change|create|add|delete|push|merge|commit|force)\b/i,
  /\b(i (said|told you|asked)|as i said|again,?|i already)\b/i,
  /\b(that'?s (wrong|not (what|right)|incorrect)|this is wrong|you (broke|ignored|skipped|missed))\b/i,
  /\b(instead|rather than|not like that|actually,)\b/i,
  /\b(why did you|you should(n'?t| not)|you were supposed to)\b/i,
  /\b(always|from now on|going forward|rule:)\b/i,
];

const RECOVERY: RegExp[] = [
  /\b(revert|undo|roll ?back|restore)\b/i,
  /\bgit (reset|checkout --|restore|revert|reflog)\b/i,
  /\bforce[- ]push/i,
  /\bput it back\b/i,
];

/**
 * The user's own words: the first paragraph, without fenced code or quoted (">") lines,
 * cut after a line ending in ":" since that usually introduces pasted content.
 */
export function authoredText(text: string): string {
  const lines: string[] = [];
  let inFence = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.startsWith(">")) continue;
    if (!line) {
      if (lines.length) break;
      continue;
    }
    lines.push(line);
    if (line.endsWith(":")) break;
  }
  return lines.join("\n");
}

export function detectCorrections(session: Session, cfg: CorrectionConfig): Evidence[] {
  const out: Evidence[] = [];
  const branchRe = new RegExp(
    `\\b(push|merge|commit|reset|checkout|rebase)\\b[^\\n]{0,40}\\b(${cfg.protectedBranches.map(escape).join("|")})\\b`,
    "i",
  );

  let agentCommands: string[] = [];
  for (const t of session.turns) {
    if (t.role === "assistant") {
      for (const c of t.toolCalls) if (c.command) agentCommands.push(c.command);
      continue;
    }
    if (!isHuman(t)) continue;
    const ranOnProtected = agentCommands.some((c) => branchRe.test(c));
    agentCommands = [];

    const text = authoredText(t.text);
    const signals: Signal[] = [];
    if (t.interrupted) signals.push("interrupt");
    if (LEXICAL.some((r) => r.test(text))) signals.push("lexical");
    if (RECOVERY.some((r) => r.test(text))) signals.push("recovery");
    // Naming a protected branch isn't enough: the agent must have operated on one since the user's last message.
    if (ranOnProtected && branchRe.test(text)) signals.push("branch");

    // Interrupt alone is weak (people interrupt to add context); require a second signal
    // unless the text is short and imperative, which is the classic "stop, don't" shape.
    if (signals.length === 1 && signals[0] === "interrupt" && !(text.length < 160 && /^(no|stop|wait|don'?t)\b/i.test(text))) {
      continue;
    }
    if (signals.length === 0) continue;
    out.push(toEvidence(t, signals));
  }
  return out;
}

export function toEvidence(t: Turn, signals: Signal[]): Evidence {
  return {
    turnId: t.id,
    sessionId: t.sessionId,
    project: t.project,
    file: t.file,
    line: t.line,
    ts: t.ts,
    excerpt: t.text.length > EXCERPT_MAX ? t.text.slice(0, EXCERPT_MAX) + "…" : t.text,
    signals,
  };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
