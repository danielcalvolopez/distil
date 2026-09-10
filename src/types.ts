export type Role = "user" | "assistant";

/** One meaningful turn extracted from a transcript. */
export interface Turn {
  id: string;
  sessionId: string;
  project: string;      // decoded project path (best-effort)
  file: string;         // transcript file path
  line: number;         // 1-based line in the JSONL
  role: Role;
  ts: number;           // epoch ms (0 if unknown)
  text: string;         // concatenated text blocks
  toolUses: string[];   // tool names invoked in this assistant turn
  toolResult: boolean;  // user turn that only carries tool_result blocks
  interrupted: boolean; // user interrupted the previous assistant turn
  meta: boolean;        // isMeta / slash-command / hook noise
}

export interface Session {
  sessionId: string;
  project: string;
  file: string;
  turns: Turn[];
  unknownEvents: number;
}

/** A turn as stored in the parse cache; fields its session already carries are omitted. */
export interface CachedTurn extends Omit<Turn, "id" | "sessionId" | "project" | "file"> {
  key: string;        // id without its "<sessionId>:" prefix
  sessionId?: string; // only when it differs from the session's
  project?: string;   // only when it differs from the session's
}

export interface CachedSession extends Omit<Session, "turns"> {
  turns: CachedTurn[];
}

export type Signal =
  | "interrupt"      // explicit interrupt marker
  | "lexical"        // rhetorical shape of a correction
  | "recovery"       // post-hoc recovery (revert, reset, undo)
  | "branch"         // protected-branch / destructive git operation
  | "repeat";        // same instruction restated across sessions

export interface Evidence {
  turnId: string;
  sessionId: string;
  project: string;
  file: string;
  line: number;
  ts: number;
  excerpt: string;
  signals: Signal[];
}

export type ProposalKind = "rule" | "skill" | "hook";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  /** Suggested target: CLAUDE.md, a skill slug, or a hook event. */
  target: string;
  /** Draft text the human may accept/edit. */
  draft: string;
  confidence: number;       // 0..1
  evidence: Evidence[];
  projects: string[];
  firstSeen: number;
  lastSeen: number;
  status: "pending" | "accepted" | "rejected" | "deferred" | "edited";
  finalText?: string;       // for accepted/edited
  decidedAt?: number;
}

export interface Store {
  version: 1;
  scannedOffsets: Record<string, number>; // file -> lines consumed
  proposals: Record<string, Proposal>;
  /** Singletons waiting for corroboration. */
  backlog: Record<string, Evidence[]>;
}
