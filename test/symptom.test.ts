import { describe, it, expect } from "vitest";
import { classifySymptom } from "../src/detect/symptom.js";
import type { Symptom } from "../src/types.js";

const cases: [string, Symptom][] = [
  ["Stop. Never push to main directly, always open a PR.", "S3"],
  ["No — don't push to main, I said this last time.", "S3"],
  ["use pnpm again, not npm", "S3"],
  ["It's not fixed — you didn't run the tests.", "S7"],
  ["That still fails, you said it was passing", "S7"],
  ["you didn’t actually run the build", "S7"],
  ["I didn't ask you to refactor the router.", "S4"],
  ["Why did you add a config file?", "S4"],
  ["Hmm, can we make the header bigger?", "unclassified"],
];

describe("classifySymptom", () => {
  it.each(cases)("%s → %s", (text, want) => {
    expect(classifySymptom(text)).toBe(want);
  });
});
