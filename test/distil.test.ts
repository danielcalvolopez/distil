import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscript, humanTurns, compactSession, expandSession, EXCERPT_MAX } from "../src/parser.js";
import { detectCorrections, toEvidence } from "../src/detect/corrections.js";
import { clusterPrompts, recurringPostEditChecks } from "../src/detect/patterns.js";
import { buildProposals } from "../src/propose.js";
import { DEFAULT_CONFIG } from "../src/store.js";
import type { Store } from "../src/types.js";

const dir = join(import.meta.dirname, "fixtures", "-Users-danny-code-alkimi-docs");
const f1 = join(dir, "11111111-aaaa.jsonl");
const f2 = join(dir, "22222222-bbbb.jsonl");

describe("parser", () => {
  it("is tolerant and filters noise", async () => {
    const s = await parseTranscript(f2);
    expect(s.unknownEvents).toBe(2); // garbage object + non-json line
    expect(s.project).toBe("/Users/danny/code/alkimi-docs");
    const h = humanTurns(s);
    expect(h.map((t) => t.id.split(":")[1])).toEqual(["u1", "u2", "u3", "u4"]); // tool_result turn dropped
    expect(h[1].interrupted).toBe(true);
    expect(h[1].text.startsWith("No —")).toBe(true);
  });
  it("drops slash-command meta turns", async () => {
    const s = await parseTranscript(f1);
    expect(humanTurns(s).map((t) => t.id.split(":")[1])).toEqual(["u1", "u2", "u3"]);
  });
  it("drops background task notifications", async () => {
    const tmp = join(mkdtempSync(join(tmpdir(), "distil-")), "s.jsonl");
    const note = {
      type: "user", sessionId: "s", uuid: "u1",
      message: { content: "<task-notification>\n<task-id>b1</task-id>\n<summary>Revert main</summary>\n</task-notification>" },
    };
    writeFileSync(tmp, JSON.stringify(note) + "\n");
    const s = await parseTranscript(tmp);
    expect(s.turns).toHaveLength(1);
    expect(humanTurns(s)).toEqual([]);
  });
  it("round-trips sessions through the cache without changing human turns or evidence", async () => {
    const s = await parseTranscript(f2);
    const long = { ...s.turns.find((t) => t.role === "assistant")!, text: "x".repeat(1000) };
    const moved = { ...s.turns[0], id: "other:u0", sessionId: "other", project: "/elsewhere" };
    const full = { ...s, turns: [moved, ...s.turns, long] };
    const back = expandSession(JSON.parse(JSON.stringify(compactSession(full))));
    expect(humanTurns(back)).toEqual(humanTurns(full));
    expect(back.turns.map(({ text: _t, ...rest }) => rest)).toEqual(full.turns.map(({ text: _t, ...rest }) => rest));
    expect(toEvidence(back.turns.at(-1)!, ["repeat"])).toEqual(toEvidence(long, ["repeat"]));
  });
  it("keeps tool inputs: commands and paths in full, content capped", async () => {
    const s = await parseTranscript(f2);
    const calls = s.turns.flatMap((t) => t.toolCalls);
    expect(calls).toContainEqual({ name: "Bash", id: "x", command: "git push origin main" });
    expect(calls).toContainEqual({ name: "Edit", id: "x", filePath: "/Users/danny/code/alkimi-docs/src/vary.ts", content: "b" });

    const tmp = join(mkdtempSync(join(tmpdir(), "distil-")), "s.jsonl");
    const long = "y".repeat(1000);
    const event = {
      type: "assistant", sessionId: "s", uuid: "a1",
      message: { content: [
        { type: "tool_use", name: "Bash", id: "t1", input: { command: long } },
        { type: "tool_use", name: "Write", id: "t2", input: { file_path: "/p/a.ts", content: long } },
        { type: "tool_use", name: "Bash", id: "t3", input: {} },
      ] },
    };
    writeFileSync(tmp, JSON.stringify(event) + "\n");
    const [a] = (await parseTranscript(tmp)).turns;
    expect(a.toolCalls[0].command).toHaveLength(1000);
    expect(a.toolCalls[1].filePath).toBe("/p/a.ts");
    expect(a.toolCalls[1].content).toHaveLength(EXCERPT_MAX);
    expect(a.toolCalls[2]).toEqual({ name: "Bash", id: "t3" });
  });
});

describe("detectors", () => {
  it("finds the protected-branch correction with layered signals", async () => {
    const s = await parseTranscript(f2);
    const ev = detectCorrections(s, { protectedBranches: DEFAULT_CONFIG.protectedBranches });
    expect(ev).toHaveLength(1);
    expect(ev[0].signals).toEqual(expect.arrayContaining(["interrupt", "lexical", "branch"]));
  });
  it("clusters the repeated explain-for-non-technical prompt across sessions", async () => {
    const ss = [await parseTranscript(f1), await parseTranscript(f2)];
    const cl = clusterPrompts(ss);
    const explain = cl.find((c) => c.key.includes("explain"));
    expect(explain).toBeDefined();
    expect(explain!.sessions.size).toBe(2);
  });
  it("finds the check the agent runs after editing in both fixture sessions", async () => {
    const ss = [await parseTranscript(f1), await parseTranscript(f2)];
    const [check] = recurringPostEditChecks(ss);
    expect(check.command).toBe("npm test");
    expect(check.sessions.size).toBe(2);
  });
});

describe("proposals", () => {
  it("emits one rule, one skill, and a hook; never writes files", async () => {
    const ss = [await parseTranscript(f1), await parseTranscript(f2)];
    const store: Store = { version: 1, scannedOffsets: {}, proposals: {}, backlog: {} };
    buildProposals(ss, store, DEFAULT_CONFIG);
    const ps = Object.values(store.proposals);
    const kinds = ps.map((p) => p.kind).sort();
    expect(kinds).toEqual(["hook", "rule", "skill"]);
    const rule = ps.find((p) => p.kind === "rule")!;
    expect(rule.evidence).toHaveLength(2);
    expect(rule.draft).toMatch(/main/i);
    expect(rule.status).toBe("pending");
  });
  it("is idempotent and preserves decisions across rescans", async () => {
    const ss = [await parseTranscript(f1), await parseTranscript(f2)];
    const store: Store = { version: 1, scannedOffsets: {}, proposals: {}, backlog: {} };
    buildProposals(ss, store, DEFAULT_CONFIG);
    const rule = Object.values(store.proposals).find((p) => p.kind === "rule")!;
    rule.status = "rejected";
    buildProposals(ss, store, DEFAULT_CONFIG);
    expect(Object.keys(store.proposals)).toHaveLength(3);
    expect(store.proposals[rule.id].status).toBe("rejected");
    expect(store.proposals[rule.id].evidence).toHaveLength(2);
  });
  it("drafts a hook as paste-ready settings JSON and keeps the true counts", async () => {
    const ss = [await parseTranscript(f1), await parseTranscript(f2)];
    const store: Store = { version: 1, scannedOffsets: {}, proposals: {}, backlog: {} };
    buildProposals(ss, store, DEFAULT_CONFIG);
    const hook = Object.values(store.proposals).find((p) => p.kind === "hook")!;
    expect(JSON.parse(hook.draft)).toEqual({
      hooks: { PostToolUse: [{ matcher: "Edit|MultiEdit|Write", hooks: [{ type: "command", command: "npm test" }] }] },
    });
    expect(hook.counts).toEqual({ occurrences: 3, sessions: 2 });
  });
  it("drops undecided proposals the current scan no longer produces and refreshes the rest", async () => {
    const ss = [await parseTranscript(f1), await parseTranscript(f2)];
    const store: Store = { version: 1, scannedOffsets: {}, proposals: {}, backlog: {} };
    buildProposals(ss, store, DEFAULT_CONFIG);
    const rule = Object.values(store.proposals).find((p) => p.kind === "rule")!;
    rule.draft = "- stale draft";
    const stale = (status: Store["proposals"][string]["status"], id: string) => ({ ...rule, id, status, evidence: [] });
    store.proposals.oldPending = stale("pending", "oldPending");
    store.proposals.oldDeferred = stale("deferred", "oldDeferred");
    store.proposals.oldRejected = stale("rejected", "oldRejected");
    buildProposals(ss, store, DEFAULT_CONFIG);
    expect(Object.keys(store.proposals).sort()).toEqual([...Object.keys(store.proposals).filter((k) => !k.startsWith("old")), "oldRejected"].sort());
    expect(store.proposals[rule.id].draft).not.toBe("- stale draft");
  });
});

describe("config", () => {
  it("excludes subagent transcripts by default, since their user turns are agent-written prompts", () => {
    expect(DEFAULT_CONFIG.exclude).toEqual(["/subagents/"]);
  });
});
