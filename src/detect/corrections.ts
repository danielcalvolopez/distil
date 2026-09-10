import type { Evidence, Session, Signal, Turn } from "../types.js";
import { EXCERPT_MAX, humanTurns } from "../parser.js";

export interface CorrectionConfig {
  protectedBranches: string[];
}

/** Rhetorical shapes that usually open a correction. Order matters only for readability. */
const LEXICAL: RegExp[] = [
  /^(no|nope|stop|wait|hold on|don'?t|never)\b/i,
  /\b(don'?t|do not|never|stop) (do|use|run|touch|edit|modify|change|create|add|delete|push|commit|force)\b/i,
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

export function detectCorrections(session: Session, cfg: CorrectionConfig): Evidence[] {
  const out: Evidence[] = [];
  const branchRe = new RegExp(
    `\\b(push|merge|commit|reset|checkout|rebase)\\b[^\\n]{0,40}\\b(${cfg.protectedBranches.map(escape).join("|")})\\b`,
    "i",
  );

  for (const t of humanTurns(session)) {
    const signals: Signal[] = [];
    if (t.interrupted) signals.push("interrupt");
    if (LEXICAL.some((r) => r.test(t.text))) signals.push("lexical");
    if (RECOVERY.some((r) => r.test(t.text))) signals.push("recovery");
    if (branchRe.test(t.text)) signals.push("branch");

    // Interrupt alone is weak (people interrupt to add context); require a second signal
    // unless the text is short and imperative, which is the classic "stop, don't" shape.
    if (signals.length === 1 && signals[0] === "interrupt" && !(t.text.length < 160 && /^(no|stop|wait|don'?t)\b/i.test(t.text))) {
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
