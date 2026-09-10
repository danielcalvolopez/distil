import { describe, it, expect } from "vitest";
import { checkCommand, recurringPostEditChecks } from "../src/detect/patterns.js";
import type { ToolCall } from "../src/types.js";
import { session, turn } from "./helpers.js";

const edit = (id: string): ToolCall => ({ name: "Edit", id, filePath: "/p/a.ts" });
const bash = (id: string, command: string): ToolCall => ({ name: "Bash", id, command });
const run = (sessionId: string, calls: ToolCall[]) =>
  session([turn("a1", "assistant", "", calls, 0, sessionId), turn("u1", "user", "thanks", [], 0, sessionId)], sessionId);

const summary = (sessions: ReturnType<typeof run>[]) =>
  recurringPostEditChecks(sessions).map((c) => [c.command, c.count, [...c.sessions].sort()]);

describe("checkCommand", () => {
  it("normalises a check command, dropping flags, paths, env and redirections", () => {
    expect(checkCommand("pnpm test 2>&1 | tail -20")).toBe("pnpm test");
    expect(checkCommand("npm run build > out.txt")).toBe("npm run build");
    expect(checkCommand("cd app && CI=1 npx vitest run test/a.test.ts")).toBe("npx vitest run");
  });
  it("returns undefined for commands that aren't checks", () => {
    expect(checkCommand("git checkout main")).toBeUndefined();
    expect(checkCommand("ls tests")).toBeUndefined();
  });
});

describe("recurringPostEditChecks", () => {
  it("finds a check command the agent runs after editing, across sessions", () => {
    const s1 = run("s1", [edit("1"), bash("2", "npm test -- --run foo"), edit("3"), bash("4", "git add ."), bash("5", "npm test")]);
    const s2 = run("s2", [edit("1"), bash("2", "cd app && npm test")]);
    expect(summary([s1, s2])).toEqual([["npm test", 3, ["s1", "s2"]]]);
  });

  it("ignores non-check commands and checks that don't follow an edit", () => {
    const s1 = run("s1", [bash("1", "npm test"), edit("2"), bash("3", "git push origin main"), bash("4", "ls")]);
    const s2 = run("s2", [bash("1", "npm test"), edit("2"), bash("3", "git status")]);
    expect(summary([s1, s2, s1])).toEqual([]);
  });

  it("needs the check in at least two sessions", () => {
    const s1 = run("s1", [edit("1"), bash("2", "npm run lint"), edit("3"), bash("4", "npm run lint"), edit("5"), bash("6", "npm run lint")]);
    expect(summary([s1])).toEqual([]);
  });
});
