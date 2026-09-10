import type { CorrectionRecord, Evidence, Session, ToolCall, Turn } from "../types.js";
import { isHuman } from "../parser.js";
import { classifySymptom } from "./symptom.js";

/** First user-authored sentence, skipping fenced code and quoted (">") lines. */
export function quoteOf(text: string): string {
  let inFence = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line || line.startsWith(">")) continue;
    return line.split(/(?<=[.!?])\s/)[0];
  }
  return "";
}

export function pairCorrections(session: Session, evidence: Evidence[]): CorrectionRecord[] {
  const byTurn = new Map(evidence.map((e) => [e.turnId, e]));
  const out: CorrectionRecord[] = [];
  let agent: Turn[] = [];
  for (const t of session.turns) {
    if (t.role === "assistant") {
      agent.push(t);
      continue;
    }
    if (!isHuman(t)) continue; // tool results and meta turns don't end the agent's run
    const e = byTurn.get(t.id);
    if (e) out.push(toRecord(e, t, agent));
    agent = [];
  }
  return out;
}

function toRecord(correction: Evidence, human: Turn, agent: Turn[]): CorrectionRecord {
  const toolCalls = agent.flatMap((a) => a.toolCalls);
  const text = agent.map((a) => a.text).filter(Boolean).join("\n");
  const acted = toolCalls.length > 0 || text.length > 0;
  return {
    correction,
    quote: quoteOf(human.text),
    violation: acted ? { turnIds: agent.map((a) => a.id), toolCalls, text } : null,
    symptom: classifySymptom(human.text),
    ...(!acted && { invalid: "invisible_agent_action" as const }),
  };
}

const observable = (c: ToolCall) => c.command !== undefined || c.filePath !== undefined;

/**
 * Upper-bound candidate for spec §2.3's checkability conditions: S3/S4 need a tool call with a command or path to
 * match on; S7 needs an agent claim to test. Validation in later milestones decides whether a check actually exists.
 */
export function isMechanizable(r: CorrectionRecord): boolean {
  if (!r.violation) return false;
  if (r.symptom === "S7") return r.violation.text.length > 0;
  if (r.symptom === "S3" || r.symptom === "S4") return r.violation.toolCalls.some(observable);
  return false;
}
