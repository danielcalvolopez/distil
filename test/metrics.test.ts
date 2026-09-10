import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseTranscript } from "../src/parser.js";
import { detectCorrections, toEvidence } from "../src/detect/corrections.js";
import { pairCorrections } from "../src/detect/pairing.js";
import { correctionMetrics, formatMetrics } from "../src/metrics.js";
import { DEFAULT_CONFIG } from "../src/store.js";
import { session, turn } from "./helpers.js";

const dir = join(import.meta.dirname, "fixtures", "-Users-danny-code-alkimi-docs");
const cfg = { protectedBranches: DEFAULT_CONFIG.protectedBranches };

describe("correctionMetrics", () => {
  it("computes the baseline on the fixtures", async () => {
    const ss = [await parseTranscript(join(dir, "11111111-aaaa.jsonl")), await parseTranscript(join(dir, "22222222-bbbb.jsonl"))];
    const records = ss.flatMap((s) => pairCorrections(s, detectCorrections(s, cfg)));
    expect(correctionMetrics(records, 123)).toEqual({
      corrections: 2, paired: 2, mechanizable: 2,
      bySymptom: { S3: 2, S4: 0, S7: 0, unclassified: 0 },
      preferences: 1, preferencesRecurred: 1, recurring: 1, recurringCrossSession: 1,
      computedAt: 123,
    });
  });

  it("counts a repeat within one session as recurring but not cross-session", () => {
    const turns = [
      turn("a1", "assistant", "", [{ name: "Bash", id: "t1", command: "npm i" }], 1),
      turn("u1", "user", "Don't use npm, use pnpm.", [], 2),
      turn("a2", "assistant", "", [{ name: "Bash", id: "t2", command: "npm i zod" }], 3),
      turn("u2", "user", "Again: don't use npm, use pnpm.", [], 4),
    ];
    const records = pairCorrections(session(turns), [toEvidence(turns[1], ["lexical"]), toEvidence(turns[3], ["lexical"])]);
    const m = correctionMetrics(records, 0);
    expect(m.recurring).toBe(1);
    expect(m.recurringCrossSession).toBe(0);
    expect(m.preferencesRecurred).toBe(1);
  });

  it("is all zeros for no records", () => {
    const m = correctionMetrics([], 0);
    expect(m.corrections).toBe(0);
    expect(m.preferences).toBe(0);
  });
});

describe("formatMetrics", () => {
  it("formats the baseline for stats", () => {
    const out = formatMetrics({
      corrections: 4, paired: 3, mechanizable: 2,
      bySymptom: { S3: 2, S4: 1, S7: 0, unclassified: 1 },
      preferences: 3, preferencesRecurred: 1, recurring: 1, recurringCrossSession: 1, computedAt: 0,
    });
    expect(out).toBe([
      "Corrections: 4  paired with the agent action: 3 (75%)  mechanizable (candidate): 2 (50%)",
      "Symptoms: S3 2 · S4 1 · S7 0 · unclassified 1",
      "Recurrence despite correction: 1 of 4 corrections (25%) restate an earlier one; 1 in a later session. Preferences re-violated: 1 of 3.",
    ].join("\n"));
  });

  it("prints n/a instead of dividing by zero", () => {
    const out = formatMetrics({
      corrections: 0, paired: 0, mechanizable: 0,
      bySymptom: { S3: 0, S4: 0, S7: 0, unclassified: 0 },
      preferences: 0, preferencesRecurred: 0, recurring: 0, recurringCrossSession: 0, computedAt: 0,
    });
    expect(out.split("\n")[0]).toBe("Corrections: 0  paired with the agent action: 0 (n/a)  mechanizable (candidate): 0 (n/a)");
  });
});
