import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseTranscript } from "../src/parser.js";
import { detectCorrections, toEvidence } from "../src/detect/corrections.js";
import { isMechanizable, pairCorrections, quoteOf } from "../src/detect/pairing.js";
import { DEFAULT_CONFIG } from "../src/store.js";
import { session, turn } from "./helpers.js";

const f2 = join(import.meta.dirname, "fixtures", "-Users-danny-code-alkimi-docs", "22222222-bbbb.jsonl");
const cfg = { protectedBranches: DEFAULT_CONFIG.protectedBranches };

describe("pairCorrections", () => {
  it("pairs the fixture correction with the git push that preceded it", async () => {
    const s = await parseTranscript(f2);
    const [r] = pairCorrections(s, detectCorrections(s, cfg));
    expect(r.violation?.turnIds).toEqual(["22222222-bbbb:a1", "22222222-bbbb:a2"]);
    expect(r.violation?.toolCalls).toContainEqual({ name: "Bash", id: "x", command: "git push origin main" });
    expect(r.symptom).toBe("S3");
    expect(r.quote).toBe("No — don't push to main, I said this last time.");
    expect(r.invalid).toBeUndefined();
    expect(isMechanizable(r)).toBe(true);
  });

  it("only collects agent turns since the previous human turn", () => {
    const turns = [
      turn("a0", "assistant", "", [{ name: "Bash", id: "t0", command: "npm test" }]),
      turn("u1", "user", "ok continue"),
      turn("a1", "assistant", "", [{ name: "Bash", id: "t1", command: "npm install zod" }]),
      turn("u2", "user", "Don't use npm, this repo uses pnpm."),
    ];
    const [r] = pairCorrections(session(turns), [toEvidence(turns[3], ["lexical"])]);
    expect(r.violation?.turnIds).toEqual(["s:a1"]);
    expect(r.violation?.toolCalls.map((c) => c.command)).toEqual(["npm install zod"]);
  });

  it("marks a correction with no preceding agent action as invisible", () => {
    const u = turn("u1", "user", "Don't use npm here.");
    const [r] = pairCorrections(session([u]), [toEvidence(u, ["lexical"])]);
    expect(r.violation).toBeNull();
    expect(r.invalid).toBe("invisible_agent_action");
    expect(isMechanizable(r)).toBe(false);
  });

  it("uses an unverified claim as the violation for S7", () => {
    const turns = [turn("a1", "assistant", "All tests pass, it's fixed."), turn("u1", "user", "It's not fixed, you didn't run the tests.")];
    const [r] = pairCorrections(session(turns), [toEvidence(turns[1], ["lexical"])]);
    expect(r.symptom).toBe("S7");
    expect(r.violation?.text).toBe("All tests pass, it's fixed.");
    expect(isMechanizable(r)).toBe(true);
  });

  it("is not mechanizable when an S3 correction follows only a text reply", () => {
    const turns = [turn("a1", "assistant", "Here is the plan."), turn("u1", "user", "Never do that again.")];
    const [r] = pairCorrections(session(turns), [toEvidence(turns[1], ["lexical"])]);
    expect(r.symptom).toBe("S3");
    expect(isMechanizable(r)).toBe(false);
  });
});

describe("quoteOf", () => {
  it("skips quoted and fenced lines and returns an exact substring", () => {
    const text = "> you wrote: use npm\n```\nnpm i\n```\nUse pnpm here, not npm. Always.";
    const q = quoteOf(text);
    expect(q).toBe("Use pnpm here, not npm.");
    expect(text.includes(q)).toBe(true);
  });
  it("returns an empty string when there is no user-authored line", () => {
    expect(quoteOf("```\nnpm i\n```")).toBe("");
  });
});
