# distil

Mine your Claude Code session transcripts for two things that quietly cost you time:

1. **Corrections you keep giving the agent** → proposed `CLAUDE.md` rules
2. **Work you keep asking for / the agent keeps re-deriving** → proposed skills and hooks

It **proposes, never acts**. Nothing is written to `CLAUDE.md`, skills, or settings. You review each proposal with its transcript evidence and accept, reject, or edit. Every decision is stored locally and becomes the label set that sharpens detection over time.

Local-first: reads `~/.claude/projects/**/*.jsonl` on your machine. No server, no telemetry.

## Quick start

```bash
npm install && npm run build && npm link   # or: npx tsx src/cli.ts <cmd>
distil scan          # parse transcripts, build proposals
distil review        # a / r / e / d / v / q
distil export        # accepted proposals as paste-ready blocks per target file
distil report --json # machine-readable pending list
distil stats         # precision, signal breakdown, backlog, correction baseline
```

Try it on the fixtures: `DISTIL_HOME=/tmp/d distil scan --dir test/fixtures && DISTIL_HOME=/tmp/d distil review`

## How detection works (v0, no LLM)

| Layer | Signal | Example |
|---|---|---|
| interrupt | `[Request interrupted by user]` followed by an imperative | "Stop. Don't…" |
| lexical | rhetorical shape of a correction | "I said…", "never…", "instead…" |
| recovery | post-hoc undo language | "revert", "git reset", "force push" |
| branch | destructive op naming a protected branch | "push … main" |
| repeat | same instruction / tool chain across sessions | "explain for a non-technical audience" |

Corroboration gate: a rule needs evidence from ≥2 sessions (configurable) unless a strong signal (`branch`, or `recovery`+`interrupt`) is present. Singletons wait in a backlog and surface once a second session corroborates them.

Repeated prompts are clustered by Jaccard similarity on content words; recurring tool n-grams (`Read → Edit → Bash`) are counted between human turns.

## Correction baseline

`scan` pairs each detected correction with the agent action it corrected (every agent turn since your previous message, including tool commands and file paths), tags it with a symptom, and `stats` reports:

- **paired**: corrections that followed an agent action distil can see
- **mechanizable (candidate)**: corrections a check could plausibly enforce: a prohibition with a command or file path to match (S3/S4), or a disputed claim of success (S7). It's an upper bound; later milestones validate real checks.
- **recurrence despite correction**: corrections that restate one you already gave. This is how often being told once didn't stick.

Symptom codes follow the misalignment taxonomy in [research/misalignment-taxonomy-20k-sessions.md](research/misalignment-taxonomy-20k-sessions.md).

## Config

`~/.config/distil/config.json` (override dir with `DISTIL_HOME`):

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

`scan` caches parsed transcripts in `cache.json` beside the store and re-parses only files whose size or mtime changed; `--full` ignores the cache. Deleting `cache.json` is always safe.

## Roadmap

- v0.1 — LLM classification pass over candidates with a versioned rubric; use stored decisions as few-shot examples
- v0.2 — ingest Superpowers SDD ledgers (`progress.md` rulings) as pre-adjudicated corrections
- v0.3 — `SessionEnd` hook for incremental scans; SQLite store
- Later — parser adapters for Codex / Copilot CLI transcripts

## Design constraints (permanent)

- Never edits agent config files.
- Never sends transcript content anywhere except candidate snippets to the classifier you configure.
- Unknown transcript events are counted and skipped, never fatal.
