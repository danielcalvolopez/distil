import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { Proposal, ProposalKind, Store } from "./types.js";

export type Action = "accept" | "reject" | "edit" | "defer" | "evidence" | "skip" | "quit";

const KEYS: Record<string, Action> = {
  a: "accept", r: "reject", e: "edit", d: "defer", v: "evidence", s: "skip", q: "quit",
  "": "quit", "": "quit", "": "quit", // EOF, ctrl-c, ctrl-d
};

export function actionFor(key: string): Action | undefined {
  return KEYS[key.toLowerCase()];
}

const KIND_ORDER: ProposalKind[] = ["rule", "skill", "hook"];

/** Undecided proposals: rules first, then skills, then hooks; most confident first within a kind. */
export function reviewQueue(store: Store): Proposal[] {
  return Object.values(store.proposals)
    .filter((p) => p.status === "pending" || p.status === "deferred")
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.confidence - a.confidence || b.evidence.length - a.evidence.length);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function summary(queue: Proposal[]): string {
  const n = (k: ProposalKind) => queue.filter((p) => p.kind === k).length;
  return `${queue.length} pending: ${plural(n("rule"), "rule")} · ${plural(n("skill"), "skill")} · ${plural(n("hook"), "hook")}`;
}

const shortProject = (p: string) => p.split("/").filter(Boolean).at(-1) ?? p;

function seenLine(p: Proposal): string {
  const sessions = p.counts?.sessions ?? new Set(p.evidence.map((e) => e.sessionId)).size;
  const n = p.counts?.occurrences ?? p.evidence.length;
  const what =
    p.kind === "hook" ? `Seen ${n}× in ${plural(sessions, "session")}`
    : p.kind === "skill" ? `Asked ${n}× in ${plural(sessions, "session")}`
    : `${plural(n, "correction")} in ${plural(sessions, "session")}`;
  return `${what} · ${p.projects.map(shortProject).join(", ")}`;
}

function pasteTarget(p: Proposal): string {
  return p.kind === "hook" ? ".claude/settings.json (merge into \"hooks\")" : p.target;
}

export function formatCard(p: Proposal, index: number, total: number): string {
  const dots = Math.round(p.confidence * 5);
  const draft = (p.finalText ?? p.draft).split("\n").map((l) => `   ${l}`).join("\n");
  return [
    "",
    ` ${index + 1}/${total}  ${p.kind.toUpperCase().padEnd(5)}  confidence ${"●".repeat(dots)}${"○".repeat(5 - dots)}`,
    ` ${p.title}`,
    ` ${seenLine(p)}`,
    "",
    ` Paste into ${pasteTarget(p)}:`,
    draft,
    "",
  ].join("\n");
}

export function formatEvidence(p: Proposal): string {
  return p.evidence
    .slice(0, 5)
    .map((e) => {
      const when = e.ts ? new Date(e.ts).toISOString().slice(0, 10) : "?         ";
      const line = e.excerpt.split("\n").find((l) => l.trim()) ?? "";
      const quote = line.length > 100 ? line.slice(0, 100) + "…" : line;
      return `  ${when}  ${shortProject(e.project)}  "${quote}"`;
    })
    .join("\n");
}

type Run = (cmd: string, args: string[], opts: { stdio: "inherit" }) => { status: number | null };

/** Opens the text in $VISUAL / $EDITOR and returns what was saved; an empty file cancels. */
export function editWith(text: string, editor = process.env.VISUAL || process.env.EDITOR || "vi", run: Run = spawnSync): string | undefined {
  const file = join(mkdtempSync(join(tmpdir(), "distil-")), "draft.md");
  writeFileSync(file, text.endsWith("\n") ? text : text + "\n");
  const [cmd, ...args] = editor.split(/\s+/).filter(Boolean);
  run(cmd, [...args, file], { stdio: "inherit" });
  const saved = readFileSync(file, "utf8").replace(/\s+$/, "");
  return saved ? saved : undefined;
}

export interface ReviewIO {
  write(s: string): void;
  readKey(): Promise<string>;
  edit(text: string): Promise<string | undefined>;
}

const PROMPT = " a accept  r reject  e edit  d defer  v evidence  s skip  q quit > ";

export async function runReview(store: Store, io: ReviewIO, save: (store: Store) => void): Promise<void> {
  const queue = reviewQueue(store);
  if (queue.length === 0) {
    io.write("Nothing to review. Run `distil scan` first.\n");
    return;
  }
  io.write(`${summary(queue)}\nNothing is written to your files: accepted proposals appear in \`distil export\`.\n`);

  const done: Record<string, number> = { accepted: 0, edited: 0, rejected: 0, deferred: 0 };
  for (const [i, p] of queue.entries()) {
    io.write(formatCard(p, i, queue.length));
    let next = false;
    while (!next) {
      io.write(PROMPT);
      const action = actionFor(await io.readKey());
      io.write("\n");
      if (action === "quit") {
        io.write(recap(done));
        return;
      }
      if (action === undefined) continue;
      if (action === "evidence") {
        io.write(formatEvidence(p) + "\n");
        continue;
      }
      if (action === "skip") break;
      if (action === "edit") {
        const text = await io.edit(p.finalText ?? p.draft);
        if (text === undefined) {
          io.write(" Edit cancelled.\n");
          continue;
        }
        p.finalText = text;
        p.status = "edited";
      } else if (action === "accept") {
        p.finalText = p.finalText ?? p.draft;
        p.status = "accepted";
      } else {
        p.status = action === "reject" ? "rejected" : "deferred";
      }
      done[p.status]++;
      p.decidedAt = Date.now();
      save(store);
      next = true;
    }
  }
  io.write(recap(done));
}

function recap(done: Record<string, number>): string {
  const total = Object.values(done).reduce((a, b) => a + b, 0);
  return `\nReviewed ${total}: ${done.accepted} accepted, ${done.edited} edited, ${done.rejected} rejected, ${done.deferred} deferred.\n` +
    (done.accepted + done.edited ? "`distil export` prints accepted proposals as paste-ready blocks.\n" : "");
}
