import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import type { Proposal, Store } from "../src/types.js";
import { actionFor, editWith, formatCard, formatEvidence, reviewQueue, runReview, summary } from "../src/review.js";

function proposal(over: Partial<Proposal>): Proposal {
  return {
    id: over.id ?? "p1", kind: "rule", title: "Never push to main", target: "CLAUDE.md", draft: "- Never push to main",
    confidence: 0.8, projects: ["/u/me/alkimi.org"], firstSeen: 0, lastSeen: 0, status: "pending",
    evidence: [{ turnId: "s:u1", sessionId: "s1", project: "/u/me/alkimi.org", file: "/f", line: 3, ts: Date.UTC(2026, 7, 24), excerpt: "Stop. Never push to main.\nmore", signals: ["lexical"] }],
    ...over,
  };
}

const hook = proposal({
  id: "h1", kind: "hook", title: "After editing, the agent runs `npm test`", target: ".claude/settings.json (hooks)",
  draft: '{ "hooks": {} }', counts: { occurrences: 87, sessions: 18 }, confidence: 1,
});

describe("reviewQueue", () => {
  it("lists pending and deferred proposals, rules first, then skills, then hooks by confidence", () => {
    const store: Store = { version: 1, scannedOffsets: {}, backlog: {}, proposals: {
      h1: hook,
      s1: proposal({ id: "s1", kind: "skill", confidence: 0.5 }),
      r2: proposal({ id: "r2", confidence: 0.9, status: "deferred" }),
      r1: proposal({ id: "r1", confidence: 0.6 }),
      x: proposal({ id: "x", status: "accepted" }),
    } };
    expect(reviewQueue(store).map((p) => p.id)).toEqual(["r2", "r1", "s1", "h1"]);
  });
});

describe("summary", () => {
  it("counts by kind", () => {
    expect(summary([hook, hook, proposal({})])).toBe("3 pending: 1 rule · 0 skills · 2 hooks");
  });
});

describe("formatCard", () => {
  it("shows kind, confidence, real counts, projects and where to paste the draft", () => {
    const card = formatCard(hook, 2, 18);
    expect(card).toContain("3/18  HOOK   confidence ●●●●●");
    expect(card).toContain("After editing, the agent runs `npm test`");
    expect(card).toContain("Seen 87× in 18 sessions · alkimi.org");
    expect(card).toContain("Paste into .claude/settings.json");
    expect(card).toContain('{ "hooks": {} }');
  });
  it("describes a rule by its corrections", () => {
    expect(formatCard(proposal({}), 0, 1)).toContain("1 correction in 1 session · alkimi.org");
    expect(formatCard(proposal({}), 0, 1)).toContain("Paste into CLAUDE.md");
  });
});

describe("formatEvidence", () => {
  it("shows date, project and the first line of each excerpt", () => {
    expect(formatEvidence(proposal({}))).toBe("  2026-08-24  alkimi.org  \"Stop. Never push to main.\"");
  });
});

describe("actionFor", () => {
  it("maps single keys to actions and ignores others", () => {
    expect(["a", "r", "e", "d", "v", "s", "q", "", "x"].map(actionFor)).toEqual([
      "accept", "reject", "edit", "defer", "evidence", "skip", "quit", "quit", undefined,
    ]);
  });
});

describe("editWith", () => {
  it("opens the draft in the editor and returns the saved text", () => {
    const calls: string[][] = [];
    const run = (cmd: string, args: string[]) => { calls.push([cmd, ...args]); writeFileSync(args[args.length - 1], "- edited\n"); return { status: 0 }; };
    expect(editWith("- draft", "code --wait", run)).toBe("- edited");
    expect(calls[0].slice(0, 2)).toEqual(["code", "--wait"]);
  });
  it("cancels when the saved file is empty", () => {
    const run = (_c: string, args: string[]) => { writeFileSync(args[0], "  \n"); return { status: 0 }; };
    expect(editWith("- draft", "vi", run)).toBeUndefined();
  });
});

describe("runReview", () => {
  function io(keys: string[], edited?: string) {
    const out: string[] = [];
    const saves: number[] = [];
    return {
      out, saves,
      io: { write: (s: string) => { out.push(s); }, readKey: async () => keys.shift() ?? "q", edit: async () => edited },
      save: (s: Store) => { saves.push(Object.values(s.proposals).filter((p) => p.status !== "pending").length); },
    };
  }
  it("applies decisions, saves after each, and ends with a recap", async () => {
    const store: Store = { version: 1, scannedOffsets: {}, backlog: {}, proposals: { r1: proposal({ id: "r1" }), h1: { ...hook } } };
    const t = io(["x", "a", "e"], "- Always open a PR");
    await runReview(store, t.io, t.save);
    expect(store.proposals.r1.status).toBe("accepted");
    expect(store.proposals.h1.status).toBe("edited");
    expect(store.proposals.h1.finalText).toBe("- Always open a PR");
    expect(t.saves).toEqual([1, 2]);
    expect(t.out.join("")).toContain("Reviewed 2: 1 accepted, 1 edited, 0 rejected, 0 deferred");
  });
  it("skips, shows evidence, and quits early without deciding", async () => {
    const store: Store = { version: 1, scannedOffsets: {}, backlog: {}, proposals: { r1: proposal({ id: "r1" }), h1: { ...hook } } };
    const t = io(["v", "s", "q"]);
    await runReview(store, t.io, t.save);
    expect(t.out.join("")).toContain("2026-08-24  alkimi.org");
    expect(store.proposals.r1.status).toBe("pending");
    expect(store.proposals.h1.status).toBe("pending");
    expect(t.saves).toEqual([]);
  });
  it("says so when there is nothing to review", async () => {
    const t = io([]);
    await runReview({ version: 1, scannedOffsets: {}, backlog: {}, proposals: {} }, t.io, t.save);
    expect(t.out.join("")).toContain("Nothing to review");
  });
});
