import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { compactSession, expandSession, parseTranscript } from "./parser.js";
import { buildProposals } from "./propose.js";
import { detectCorrections } from "./detect/corrections.js";
import { pairCorrections } from "./detect/pairing.js";
import { correctionMetrics, formatMetrics } from "./metrics.js";
import { editWith, runReview } from "./review.js";
import { loadCache, loadConfig, loadStore, saveCache, saveStore, CONFIG_DIR } from "./store.js";
import type { Proposal, Session } from "./types.js";

const HELP = `distil — mine Claude Code transcripts, propose rules/skills/hooks. Proposes, never acts.

  distil scan [--dir <path>] [--full]     parse transcripts, update proposals
  distil review                           accept / reject / edit / defer proposals
  distil report [--json]                  summary of pending proposals
  distil export                           accepted proposals as paste-ready blocks
  distil stats                            detection metrics

Config & store: ${CONFIG_DIR}
`;

interface TranscriptFile {
  path: string;
  size: number;
  mtimeMs: number;
}

function listJsonl(dir: string): TranscriptFile[] {
  const out: TranscriptFile[] = [];
  const walk = (d: string) => {
    let entries: string[] = [];
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (e.endsWith(".jsonl")) out.push({ path: p, size: st.size, mtimeMs: st.mtimeMs });
    }
  };
  walk(dir);
  return out;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function scan(args: string[]): Promise<void> {
  const cfg = loadConfig();
  const store = loadStore();
  const cache = loadCache();
  const dir = flag(args, "--dir") ?? cfg.transcriptsDir;
  const full = args.includes("--full");
  const files = listJsonl(dir).filter(({ path: f }) => {
    if (cfg.include.length && !cfg.include.some((s) => f.includes(s))) return false;
    if (cfg.exclude.some((s) => f.includes(s))) return false;
    return true;
  });
  if (files.length === 0) {
    console.log(`No .jsonl transcripts found under ${dir}`);
    return;
  }
  const sessions: Session[] = [];
  let unknown = 0;
  let parsed = 0;
  for (const { path: f, size, mtimeMs } of files) {
    // Clustering needs every whole session, so unchanged transcripts come from the cache.
    const hit = cache.files[f];
    let s: Session;
    if (!full && hit && hit.size === size && hit.mtimeMs === mtimeMs) {
      s = expandSession(hit.session);
    } else {
      s = await parseTranscript(f);
      cache.files[f] = { size, mtimeMs, session: compactSession(s) };
      parsed++;
    }
    sessions.push(s);
    store.scannedOffsets[f] = s.turns.at(-1)?.line ?? store.scannedOffsets[f] ?? 0;
    unknown += s.unknownEvents;
  }
  for (const f of Object.keys(cache.files)) if (!existsSync(f)) delete cache.files[f];
  const before = Object.keys(store.proposals).length;
  buildProposals(sessions, store, cfg);
  const records = sessions.flatMap((s) => pairCorrections(s, detectCorrections(s, { protectedBranches: cfg.protectedBranches })));
  const m = (store.metrics = correctionMetrics(records));
  saveStore(store);
  saveCache(cache);
  const after = Object.keys(store.proposals).length;
  const human = sessions.reduce((n, s) => n + s.turns.filter((t) => t.role === "user" && !t.toolResult && !t.meta).length, 0);
  console.log(
    `Scanned ${files.length} transcripts (${parsed} parsed, ${files.length - parsed} cached), ${sessions.reduce((n, s) => n + s.turns.length, 0)} events (${unknown} skipped), ${human} human turns.\n` +
      `Proposals: ${after} total (+${after - before} new), backlog ${Object.keys(store.backlog).length} awaiting corroboration.\n` +
      `Corrections: ${m.corrections} (${m.paired} paired, ${m.mechanizable} mechanizable); \`distil stats\` shows the baseline.\n` +
      `Run \`distil review\`.`,
  );
}

function pending(store = loadStore()): Proposal[] {
  return Object.values(store.proposals)
    .filter((p) => p.status === "pending" || p.status === "deferred")
    .sort((a, b) => b.confidence * b.evidence.length - a.confidence * a.evidence.length);
}

function fmt(p: Proposal): string {
  const proj = p.projects.map((x) => x.split("/").slice(-1)[0]).join(", ");
  return `[${p.kind}] ${p.title}\n   target: ${p.target}  confidence: ${p.confidence.toFixed(2)}  evidence: ${p.evidence.length} (${new Set(p.evidence.map((e) => e.sessionId)).size} sessions)  projects: ${proj}`;
}

/** One keypress in a terminal; the first character of each typed line when input is piped. */
function keyReader(): { readKey: () => Promise<string>; close: () => void } {
  if (!stdin.isTTY) {
    const rl = createInterface({ input: stdin });
    const lines = rl[Symbol.asyncIterator]();
    return {
      readKey: async () => {
        const { value, done } = await lines.next();
        return done ? "q" : value.trim().charAt(0);
      },
      close: () => rl.close(),
    };
  }
  return {
    readKey: () =>
      new Promise((resolve) => {
        stdin.setRawMode(true);
        stdin.resume();
        stdin.once("data", (d) => {
          stdin.setRawMode(false);
          stdin.pause();
          resolve(String(d));
        });
      }),
    close: () => {},
  };
}

export async function review(): Promise<void> {
  const store = loadStore();
  const keys = keyReader();
  try {
    await runReview(store, { write: (s) => stdout.write(s), readKey: keys.readKey, edit: async (text) => editWith(text) }, saveStore);
  } finally {
    keys.close();
  }
}

export function report(args: string[]): void {
  const store = loadStore();
  const q = pending(store);
  if (args.includes("--json")) { console.log(JSON.stringify(q, null, 2)); return; }
  console.log(`${q.length} pending proposal(s):\n`);
  for (const p of q) console.log(fmt(p) + "\n");
}

export function exportAccepted(): void {
  const store = loadStore();
  const acc = Object.values(store.proposals).filter((p) => p.status === "accepted" || p.status === "edited");
  if (acc.length === 0) { console.log("No accepted proposals yet."); return; }
  const byTarget = new Map<string, Proposal[]>();
  for (const p of acc) byTarget.set(p.target, [...(byTarget.get(p.target) ?? []), p]);
  for (const [target, ps] of byTarget) {
    console.log(`\n### ${target}\n`);
    for (const p of ps) {
      console.log("```");
      console.log(p.finalText ?? p.draft);
      console.log("```");
      console.log(`<!-- distil: ${p.id}, evidence: ${p.evidence.map((e) => `${e.sessionId.slice(0, 8)}:L${e.line}`).join(" ")} -->\n`);
    }
  }
}

export function stats(): void {
  const store = loadStore();
  const all = Object.values(store.proposals);
  const decided = all.filter((p) => p.status !== "pending" && p.status !== "deferred");
  const acc = decided.filter((p) => p.status === "accepted" || p.status === "edited").length;
  const byKind: Record<string, number> = {};
  for (const p of all) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  const bySignal: Record<string, number> = {};
  for (const p of all) for (const e of p.evidence) for (const s of e.signals) bySignal[s] = (bySignal[s] ?? 0) + 1;
  console.log(`Proposals: ${all.length}  by kind: ${JSON.stringify(byKind)}`);
  console.log(`Decided: ${decided.length}  accepted/edited: ${acc}  precision: ${decided.length ? (acc / decided.length).toFixed(2) : "n/a"}`);
  console.log(`Backlog (awaiting corroboration): ${Object.keys(store.backlog).length}`);
  console.log(`Signals over evidence: ${JSON.stringify(bySignal)}`);
  console.log(`Transcripts tracked: ${Object.keys(store.scannedOffsets).length}`);
  console.log(store.metrics ? `\n${formatMetrics(store.metrics)}` : "\nCorrection baseline: run `distil scan` first.");
}

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "scan": return scan(rest);
    case "review": return review();
    case "report": return report(rest);
    case "export": return exportAccepted();
    case "stats": return stats();
    default: console.log(HELP);
  }
}

if (process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1])) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
