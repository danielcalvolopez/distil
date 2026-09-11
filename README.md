# distil

distil reads your Claude Code session transcripts and looks for two things:

1. Corrections you keep giving the agent, which it turns into proposed `CLAUDE.md` rules.
2. Work you keep asking for, or checks the agent keeps running, which it turns into proposed skills and hooks.

distil only proposes. It never writes to `CLAUDE.md`, skills or settings. You review each proposal next to the transcript lines it came from, then accept, reject or edit it, and every decision is stored locally.

It runs entirely on your machine against `~/.claude/projects/**/*.jsonl`. There is no server and no telemetry, and v0 uses no LLM.

This is an experiment, published with an honest account of how well it worked on one person's history. Read [What I found](#what-i-found) before deciding whether to use it.

## Quick start

Not on npm. Clone the repo, then:

```bash
npm install && npm run build && npm link   # or: npx tsx src/cli.ts <cmd>
distil scan          # parse transcripts, build proposals
distil review        # one key each: accept / reject / edit (opens $EDITOR) / defer / view evidence / skip / quit
distil export        # accepted proposals as paste-ready blocks per target file
distil report --json # machine-readable pending list
distil stats         # precision, signal breakdown, backlog, correction baseline
```

Try it on the fixtures: `DISTIL_HOME=/tmp/d distil scan --dir test/fixtures && DISTIL_HOME=/tmp/d distil review`

Requires Node 20 or later.

## What I found

I built distil to see whether my own transcripts held rules I kept failing to write down. On 2026-09-11 I ran it over my history (126 main-session transcripts across about 30 project folders, 605 messages I wrote myself; subagent transcripts excluded) and graded every output by hand.

### It is fast and the plumbing works

A repeat scan of 481 transcript files (167 MB, subagents included) takes about 0.4 s thanks to the parse cache; a cold scan takes about 1.2 s. Before adding the cache I checked whether a Rust rewrite was worth it. Most of the time went into an all-pairs clustering loop rather than the language, and fixing the algorithm in TypeScript was enough. Pairing works too: 24 of 25 detected corrections were matched to the agent turn that came before them, including the commands it ran.

### Correction detection is about 40% precise

distil flagged 25 messages as corrections. By my reading:

| Verdict | Count | Examples |
|---|---|---|
| Real pushback on something the agent did | 10 | "do not commit anything to develop, its protected", "no UI changes please", "why did you change these names" |
| Borderline, mostly "explain that again, simpler" | 5 | "what do you need from me again, in simpler terms" |
| Not a correction | 10 | a pasted build log, a pasted error message, "no response", "deployed, can you scan again?" |

Words like "again", "no" and "instead" do most of the damage. They show up in ordinary questions as often as in pushback. The "mechanizable" flag inherits the noise: 3 of the 11 messages it marked as checkable weren't corrections at all.

### The one real lesson was never grouped

Seven of the ten real corrections say the same thing: don't commit, merge or open pull requests on your own, and use the branch I name. They come from 6 sessions in 4 projects:

- "do not commit anything to develop, its protected"
- "do not merge into prod, create a main branch for all this plan"
- "stop, undo the last commit, you were supposed to merge test-harness onto feature/agent-readiness"
- "please, do not commit anything else, will commit myself once finished"
- "go ahead with the fix but dont create the pr i will do it"
- "no, do it off main/production"
- "... so my commit was commited to main"

distil groups corrections by shared words, and these share almost none, so it never saw them as one preference. The same flaw breaks the baseline metric. `stats` reported that 0% of corrections restated an earlier one, when this single rule was given seven times and kept being broken.

The raw material to fix this is already there. In 4 of the 7, the agent had just run `git commit`, `git merge` or `git checkout -b` before I pushed back; the other 3 were said up front, before the agent did anything. Grouping by what the agent did, rather than by what I said, would have caught most of this lesson.

### Almost none of the 18 proposals were worth accepting

| Kind | Count | Verdict |
|---|---|---|
| Rule | 1 | The draft is my raw message ("news content fields main is not published on github, so my commit was commited to main"). It doesn't work as a rule. |
| Skill | 7 | Pairs of similar prompts from one stretch of work, named with keyword lists such as `agent-audit-readiness-project-run`. I'd accept none. |
| Hook | 10 | Accurate: the agent really does run `npx vitest run` after edits (90 times in 18 sessions). But each draft runs the whole command after every single edit, which is too slow for a test suite, and the agent already runs these on its own. A typecheck hook might be worth keeping; the rest I'd reject. |

### How useful is it?

For me, not very, at least in this form. My history holds about three lessons, and I can write them into `CLAUDE.md` in five minutes: control of git, plain-language explanations, and not changing things I didn't ask about. Most of my messages are questions and requests rather than corrections, so a correction miner has little to work with. Claude Code's own memory also covers part of the original idea, since it can save a correction as feedback when you give one.

Two things still seem worth something. distil shows its evidence, dated and quoted, so you can see why a rule is proposed. And it can measure whether a rule stuck by counting whether the same correction comes back after you add it; nothing else I use does that. Both would matter more for someone who corrects the agent often, or for a team pooling transcripts.

If you try it, expect a short list, and expect to reject most of what `review` shows you. I'd like to hear how it goes on a heavier history than mine.

### Where it would go next

- Group corrections by the agent action being corrected (git operations, edits outside the requested scope, explanations judged too technical), and fall back to word overlap only for the rest.
- Take skills and hooks out of the default review queue, since they crowd out the rules.
- Compile each well-supported correction into a rule plus an executable check (a `PreToolUse` hook), validated by replaying past transcripts. The idea comes from [TRACE](https://arxiv.org/abs/2606.13174), which found that prose memory left 57.5% of applicable preference checks violated, against 29.9% with compiled rules. This isn't implemented.

## How detection works (v0, no LLM)

| Layer | Signal | Example |
|---|---|---|
| interrupt | `[Request interrupted by user]` followed by an imperative | "Stop. Don't…" |
| lexical | rhetorical shape of a correction | "I said…", "never…", "instead…" |
| recovery | post-hoc undo language | "revert", "git reset", "force push" |
| branch | a protected-branch op you name that the agent actually ran since your last message | "push … main" after `git push origin main` |
| repeat | same instruction across sessions | "explain for a non-technical audience" |

Only your own words are checked: the first paragraph of each message, without code blocks or quoted lines, and nothing after a line ending in ":" (which usually introduces a paste). Background task notifications are ignored.

A rule needs evidence from at least 2 sessions (configurable) unless a strong signal (`branch`, or `recovery` with `interrupt`) is present. Single corrections wait in a backlog until a second session backs them up.

Repeated prompts are clustered by Jaccard similarity on content words. Hook proposals come from a check (tests, lint, typecheck, build) the agent runs right after editing files, at least 3 times across 2 or more sessions, which a `PostToolUse` hook could run automatically.

## Correction baseline

`scan` pairs each detected correction with the agent action it corrected (every agent turn since your previous message, including tool commands and file paths) and tags it with a symptom. `stats` then reports:

- paired: corrections that followed an agent action distil can see.
- mechanizable (candidate): corrections a check could plausibly enforce, meaning a prohibition with a command or file path to match (S3/S4) or a disputed claim of success (S7). It's an upper bound.
- recurrence despite correction: corrections that restate one you already gave, which shows how often being told once didn't stick. It relies on the same word grouping as the proposals, so it undercounts (see [What I found](#the-one-real-lesson-was-never-grouped)).

Symptom codes follow the misalignment taxonomy in [research/misalignment-taxonomy-20k-sessions.md](research/misalignment-taxonomy-20k-sessions.md).

## Config

`~/.config/distil/config.json` (override the directory with `DISTIL_HOME`):

```json
{
  "transcriptsDir": "~/.claude/projects",
  "corroboration": 2,
  "protectedBranches": ["main", "master", "production"],
  "include": [],
  "exclude": ["/subagents/"]
}
```

`include` and `exclude` match substrings of transcript paths. Subagent transcripts are excluded by default because their "user" turns are prompts written by the parent agent, not by you. Setting your own `exclude` replaces the default, so keep `"/subagents/"` in the list.

Each `scan` rebuilds the proposals from the transcripts it reads. Undecided (pending or deferred) proposals that the current transcripts no longer produce are dropped; accepted, rejected and edited ones keep their decision. So `scan --dir` on a different folder replaces the pending queue with that folder's proposals.

`scan` caches parsed transcripts in `cache.json` beside the store and re-parses only files whose size or mtime changed. `--full` ignores the cache. Deleting `cache.json` is always safe.

## Design constraints

- distil never edits agent config files.
- Transcript content never leaves your machine.
- Unknown transcript events are counted and skipped, never fatal.

## License

MIT. See [LICENSE](LICENSE).
