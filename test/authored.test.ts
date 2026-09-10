import { describe, it, expect } from "vitest";
import { authoredText, detectCorrections } from "../src/detect/corrections.js";
import { session, turn } from "./helpers.js";

const cfg = { protectedBranches: ["main"] };

describe("authoredText", () => {
  it("keeps the first paragraph and drops fenced code and quoted lines", () => {
    const text = "> never do this\n```\ngit reset\n```\nPlease tidy the README.\nThanks.\n\nPasted: revert everything";
    expect(authoredText(text)).toBe("Please tidy the README.\nThanks.");
  });
  it("stops after a line that introduces pasted content", () => {
    expect(authoredText("today I got this from a workmate:\nDon't use npm, always revert")).toBe("today I got this from a workmate:");
  });
});

describe("detectCorrections on pasted text", () => {
  it("ignores correction words that only appear in pasted content", () => {
    const u = turn("u1", "user", "passed a review through another model and got this report\n\nNever merge without tests. Revert the migration instead.");
    expect(detectCorrections(session([u]), cfg)).toEqual([]);
  });
  it("still detects a correction in the user's own words", () => {
    const u = turn("u1", "user", "Don't use npm here.\n\nlog:\nnpm ERR!");
    expect(detectCorrections(session([u]), cfg)).toHaveLength(1);
  });
});
