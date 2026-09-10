import { describe, it, expect } from "vitest";
import { detectCorrections } from "../src/detect/corrections.js";
import { session, turn } from "./helpers.js";

const cfg = { protectedBranches: ["main"] };
const push = { name: "Bash", id: "t1", command: "git push origin main" };

describe("protected-branch signal", () => {
  it("fires when the agent actually ran a git operation on a protected branch", () => {
    const turns = [turn("a1", "assistant", "", [push]), turn("u1", "user", "Stop. Don't push to main.")];
    expect(detectCorrections(session(turns), cfg)[0].signals).toContain("branch");
  });
  it("does not fire for a question that merely mentions a protected branch", () => {
    const turns = [turn("a1", "assistant", "Tests pass."), turn("u1", "user", "is this branch safe to push to main?")];
    expect(detectCorrections(session(turns), cfg)).toEqual([]);
  });
  it("only looks at agent commands since the previous human turn", () => {
    const turns = [
      turn("a1", "assistant", "", [push]),
      turn("u1", "user", "great"),
      turn("a2", "assistant", "Done."),
      turn("u2", "user", "can we merge into main now?"),
    ];
    expect(detectCorrections(session(turns), cfg)).toEqual([]);
  });
});

describe("lexical signal", () => {
  it("treats 'do not merge' as a correction", () => {
    const u = turn("u1", "user", "change that, do not merge into prod");
    expect(detectCorrections(session([u]), { protectedBranches: ["prod"] })[0].signals).toContain("lexical");
  });
});
