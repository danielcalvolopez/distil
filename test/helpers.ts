import type { Session, ToolCall, Turn } from "../src/types.js";

export function turn(id: string, role: "user" | "assistant", text: string, toolCalls: ToolCall[] = [], ts = 0, sessionId = "s"): Turn {
  return {
    id: `${sessionId}:${id}`, sessionId, project: "/p", file: `/p/${sessionId}.jsonl`, line: 1,
    role, ts, text, toolCalls, toolResult: false, interrupted: false, meta: false,
  };
}

export function session(turns: Turn[], sessionId = "s"): Session {
  return { sessionId, project: "/p", file: `/p/${sessionId}.jsonl`, turns, unknownEvents: 0 };
}
