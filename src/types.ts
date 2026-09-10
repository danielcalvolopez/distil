export type Role = "user" | "assistant";

/** A tool call as kept by the parser: only the input fields a check can match on. */
export interface ToolCall {
  name: string;
  id: string;
  command?: string;  // Bash tool_input.command, full
  filePath?: string; // tool_input.file_path, full
  content?: string;  // Write content / Edit new_string, capped at EXCERPT_MAX
}

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
  toolCalls: ToolCall[]; // tool calls made in this assistant turn
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

/** Misalignment-taxonomy symptom codes distil can tag without an LLM (see research/misalignment-taxonomy-20k-sessions.md). */
export type Symptom = "S3" | "S4" | "S7" | "unclassified";

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

/** The agent behaviour a correction responded to: every agent turn since the previous human turn. */
export interface Violation {
  turnIds: string[];
  toolCalls: ToolCall[];
  text: string; // the agent's prose in those turns, newline-joined
}

/** A correction paired with the behaviour it corrected (spec §2.1). */
export interface CorrectionRecord {
  correction: Evidence;
  quote: string;               // first user-authored sentence; always an exact substring of the turn text
  violation: Violation | null;
  symptom: Symptom;
  invalid?: "invisible_agent_action";
}

/** The correction baseline `scan` computes and `stats` prints (spec §7, M1 and M4). */
export interface CorrectionMetrics {
  corrections: number;
  paired: number;
  mechanizable: number;
  bySymptom: Record<Symptom, number>;
  preferences: number;           // clusters of corrections
  preferencesRecurred: number;   // clusters with more than one correction
  recurring: number;             // corrections restating an earlier one in the same cluster
  recurringCrossSession: number; // …in a session where that preference hadn't been stated yet
  computedAt: number;
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
  /** Correction baseline from the last scan. */
  metrics?: CorrectionMetrics;
}
