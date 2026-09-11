# From Memory to Skills: Evidence-Grounded Co-Evolution Governance for Long-Horizon LLM Agents (MSCE)

- **arXiv ID:** 2607.16621 (v1 is the only version)
- **Submitted:** Sat, 18 Jul 2026 03:46:22 UTC (v1, 380 KB). Comments field: "Submitted into EMNLP'2026". Category: cs.CL. [abs]
- **Link:** https://arxiv.org/abs/2607.16621 (HTML: https://arxiv.org/html/2607.16621v1)
- **Authors:** Bo Tang, Yang Zhang, Guomian Zhuang, Wenqiang Wei, Gaoyang Zheng, Lindong Xie, Yanchao Tan, Feiyu Xiong, Qingyu Yang, Edward Chung, Zhiyu Li [abs]

Source keys: **[abs]** is the arXiv abstract page, **[§x / Tab. x]** is the arXiv HTML v1 full text, and **[code:file]** is the MemTensor/MemOS GitHub repo, `apps/memos-local-plugin/`, `main` branch as fetched 2026-09-10.

## Summary

- MSCE is a **training-free** framework. Its starting point is that agent memory systems usually feed old traces back in as passive context and don't turn them into executable capabilities. [abs]
- Memory has three tiers. **L1** holds grounded step traces (state, action, observation, self-reflection, value). **L2** holds procedural policies (trigger, procedure, verification, boundary, supporting L1 evidence). **L3** holds declarative "environmental cognition" (entity facts, action-response regularities, constraints), each item linked to L2 policies. [§4, memory-level definitions]
- An L2 policy is **crystallized into a callable skill** only if it has evidence and a positive estimated gain (G > θ_G = 0). The skill keeps its evidence links, applicability boundary, decision guidance, verification rule and reliability estimate. [abs; §4.3; Tab. 6]
- Every skill draft goes through a **deterministic verifier** before anyone sees it. The verifier checks the schema, checks that cited evidence IDs come from the support set, checks that declared tools are on the whitelist, and runs coverage tests. Drafts that fail are discarded. [§4.3]
- **Reflection-weighted value backfilling** spreads the sparse terminal reward R back across each step's self-reflection to give every trace a value: V(f_t) = α_t·R + (1−α_t)·γ·V(f_{t+1}). This value decides which traces are allowed to feed policy induction. [§4, Eq. 2]
- Skills have three states: **probationary → active → archived**. Reliability is a Laplace-smoothed success rate, η = (n_pass+1)/(n_trial+2). Explicit user feedback moves η by ±0.1. [§8.8; Tab. 6]
- **User corrections are first-class evidence.** A user rejection shrinks the skill's applicability boundary. Contrastive evidence, where the lower-valued action "is supported by failures or user corrections", becomes a decision-guidance item of the form "prefer a⁺ over a⁻ in context c". [Tab. 4; §8.10]
- Results: MSCE is best or tied on all 5 EvoAgentBench domains, e.g. SE 53.85 vs 38.46 and IR 26.15 vs 21.54 Pass@1. It also beats the best baseline on LoCoMo overall (61.23 vs 59.22). [Tab. 1, Tab. 2]
- In the ablations, removing skill crystallization costs 4.6–11.5 Pass@1 points per domain and raises cost. Replacing tiered memory with flat memory hurts even more. [Tab. 3]
- The authors say plainly that η, gains and values are **heuristic governance signals, not causal estimates**, and that the LLM-based operators can be noisy. [Limitations]

## Reusable for distil

**Method**
- **Evidence ladder: L1 trace → L2 policy → skill** [§4, §4.3]. This maps directly onto distil: a detected correction event is the L1 evidence, an induced rule is the L2 policy, and a rule packaged with a check is the "skill".
- **Promotion gates** [§4.3, Tab. 6]:
  - Only traces with V ≥ v_min = 0.1 are admitted.
  - L2 induction needs n_min = **2 distinct episodes**.
  - Promotion needs gain G > θ_G = 0.
  - A skill carries at most K = 6 evidence traces.
  - Retrieval returns k = 3 skills per task.
- **Stability gate:** recent evidence has to agree with the current trigger, procedure and boundary before promotion. [§4.3]
- **Deterministic verification before exposure.** Cited evidence IDs must be in the support set, and declared tools must be on the whitelist. [§4.3] The released code adds two concrete checks:
  - *tool coverage*: at least 50% of declared tools must appear in the evidence tool calls, otherwise `coverage-low`.
  - *evidence resonance*: at least 50% of evidence traces must share 2 or more non-stopword tokens (4+ chars) with the skill narrative, otherwise `resonance-low`.
  - Drafts with no evidence fail with `no-evidence`. [code:core/skill/verifier.ts]
- **Lifecycle events** (verbatim, Table 4):

| Event | Operation | Effect |
|---|---|---|
| successful invocation | reinforce | increase reliability |
| execution failure | repair | revise procedure or verification |
| user rejection | shrink | narrow applicability boundary |
| new counter-evidence | revise | add guidance or anti-patterns |
| source policy rewritten | rebuild | re-crystallize from evidence |
| long inactivity or low reliability | archive | remove from default retrieval |

- §8.8 adds that a skill is archived after "repeated failures, explicit user rejection, or negative source-policy gain". When the source policy changes substantially, the skill is rebuilt from fresh evidence "rather than patched in place". The paper gives **no inactivity window** value. [§8.8; Tab. 6]

**Formulas**
- Reliability: **η = (n_pass + 1) / (n_trial + 2)**. Explicit feedback adjusts it by δ = 0.1. The skill becomes active once η > 0.6 after n_prob ≥ 1 invocations, and is archived when η < 0.2. [§8.8; Tab. 6]
- Policy gain: **G(f⁽²⁾) = V̄_with − V̄_blend(S_without)**.
  - The "with" side is a softmax-weighted mean (τ_V = 0.5) when |S_with| ≥ 3.
  - The "without" side is shrunk toward b = 0.5 with pseudo-count N_0 = 5.

  [§4, Eq. 1; Tab. 6]
- Value backfill: **V(f_t) = α_t·R + (1−α_t)·γ·V(f_{t+1})**, with γ = 0.9. The reflection weight α_t is scored by an LLM prompt from the quality of the self-reflection. [§4, Eq. 2; Tab. 6]
- Reward weights: goal 0.45, process 0.30, satisfaction 0.25. [Tab. 6]
- L3 abstraction: minimum cohort m = 2, similarity θ_sim = 0.62, Jaccard edge θ_edge = 0.34. [Tab. 6]

**Numbers** (Pass@1 %; the Cost column is turns or tokens depending on the domain) [Tab. 1–3]

| | IR | Math | SE | Code | KW | LoCoMo overall / F1 |
|---|---|---|---|---|---|---|
| MSCE | 26.15 | 47.00 | 53.85 | 61.54 (cost 2.0) | 53.45 | 61.23 / 49.89 |
| Best baseline | 21.54 EverOS | 43.00 EverOS | 38.46 Vanilla/Memento/MemSkill | 61.54 EvoSkill (cost 3.9) | 48.28 EverOS/EvoSkill | 59.22 / 48.71 SkillFlow-Evolve |
| w/o skill crystallization | 20.00 | 39.00 | 42.31 | 53.85 | 44.83 | — |
| Flat memory | 10.77 | 31.00 | 34.62 | 56.41 | 37.93 | — |

- Cross-domain transfer improved all 6 pairs by +2.56 to +5.13 points (mean +3.93). Lifelong evolution from p0 to p100 improved Math by +17.00, SE by +15.39 and IR by +13.84. [§5.3, Figs. 2–3]
- Setup: OpenClaw v2026.5.7 runtime, GPT-5.2 as the agent, GPT-4o for the auxiliary operators. [§5.1]

## Skill record structure

The paper defines a skill as **k = (ϕ, π, κ, ℬ, 𝒜, 𝒟, η)**: "It inherits the trigger, procedure, verification rule, and boundary from L2, adding evidence anchors 𝒜, decision guidance 𝒟, and reliability η." [§4.3, verbatim]

| Field | Meaning | Type (paper → code) | How populated | How updated |
|---|---|---|---|---|
| ϕ trigger | Semantic condition matched against the current state [§4.3] | NL string → `PolicyRow.trigger: string` | Inherited from the L2 policy | Rebuilt when the source policy is rewritten [Tab. 4] |
| π procedure | Natural-language procedural steps [§4.3] | NL → `procedureJson` (`SkillProcedure`: `summary`, `parameters[]`, `preconditions[]`, `steps[{title, body}]`, `examples[{input, expected}]`, `tags[]`, `tools[]`) [code:core/skill/types.ts] | The Π_skill prompt drafts it from the policy, evidence anchors, tool whitelist and guidance seeds [§4.3] | **Repair** after an execution failure [Tab. 4] |
| κ verification rule | "verification or fallback criteria" [§4.3] | NL → `PolicyRow.verification: string` | Inherited from L2 | **Repair** after a failure [Tab. 4] |
| ℬ applicability boundary | Scope constraints / anti-patterns [§4.3] | NL → `PolicyRow.boundary: string` | Inherited from L2, taken from counter-evidence | **Shrink** on user rejection or boundary violation [Tab. 4; §8.8] |
| 𝒜 evidence anchors | Links to the supporting L1 traces [§4.3] | Set of trace IDs, at most K = 6 → `evidenceAnchors: TraceId[]`, plus `sourcePolicyIds`, `sourceWorldModelIds` | Taken from the L2 support set. The verifier requires every cited ID to be in that set [§4.3] | Replaced on rebuild |
| 𝒟 decision guidance | Set of items d = (c, a⁺, a⁻, e, ξ): context, preferred action, action to avoid, evidence links, guidance reliability [§8.10] | → code simplifies it to `{ preference: string[]; antiPattern: string[] }` with no c/e/ξ [code:core/types.ts] | Built when similar contexts give very different values "and the lower-valued pattern is supported by failures or user corrections" [§8.10] | **Revise** when new counter-evidence arrives; injected only when c matches the trigger [§8.10; Tab. 4] |
| η reliability | Smoothed success rate [§8.8] | Float in [0, 1] → `eta: number`, `trialsAttempted`, `trialsPassed` | Paper: starts from the Laplace prior (0.5). Code: seeded from policy gain [code:ARCHITECTURE.md] | η = (n_pass+1)/(n_trial+2); ±δ on explicit feedback [§8.8] |
| (state) | probationary / active / archived [§8.8] | → `status: "candidate" \| "active" \| "archived"` | New skills start probationary | Rules: η > 0.6 after ≥ 1 trial activates; η < 0.2 or inactivity archives [Tab. 6] |

The code also stores `support`, `gain`, `vec` (embedding), `version`, `usageCount`, `lastUsedAt`, `createdAt`, `updatedAt` and `invocationGuide`. [code:core/types.ts `SkillRow`]

**Example.** The paper gives **no complete skill record**. The case study in §9 (traces in Tab. 5) only shows the induced **L2 policy** fields. Verbatim, as extracted:
- Trigger: "pip install fails due to missing system libraries in container"
- Procedure: "Parse missing component → identify OS package manager → install corresponding -dev library → retry pip"
- Boundary: "Containers only; excludes native systems"
- Evidence: the anchor traces f₁,₁⁽¹⁾ and f₂,₁⁽¹⁾ from Tab. 5.

The paper shows no values for κ, 𝒟 or η in this example. [§9; Tab. 5]

## Code & data

- The paper links `[Code] https://github.com/MemTensor/MemOS` in its correspondence header. [paper header]
- **Licence: Apache License 2.0**, confirmed from the actual LICENSE file ("Copyright 2025 - Present MemTensor Research"). The arXiv paper itself carries the arXiv perpetual non-exclusive licence.
- The relevant implementation is `apps/memos-local-plugin/`, written in TypeScript and tested with vitest. The skill pipeline is in `core/skill/`: `skill.ts`, `types.ts`, `crystallize.ts`, `verifier.ts`, `packager.ts`, `lifecycle.ts`. The README describes "tiered skill evolution (L1 traces / L2 policies / L3 world model)". [code:README, ARCHITECTURE.md]
- The repo **does not name MSCE or cite the paper**, so the link between the two rests only on the paper's own [Code] link.
- **No dataset release was found.** The benchmarks (EvoAgentBench, LoCoMo) are existing public benchmarks.
- **The code defaults differ from paper Table 6** [code:core/config/defaults.ts]:

| Parameter | Paper | Code default |
|---|---|---|
| Minimum support / episodes | 2 | 1 (`minSupport`, `minEpisodesForInduction`) |
| Minimum gain | 0 | 0.02 (`minGain`) |
| Activation threshold | 0.6 | 0.1 (`minEtaForRetrieval`) |
| Archive threshold | 0.2 | 0.1 (`archiveEta`) |
| Minimum trace value | 0.1 | 0.005 (`minTraceValue`) |

  The code comments say the support and gain values were deliberately lowered ("lowered from 2 → 1", "0.1 → 0.02").
- **The η update also differs.** The code treats the prior η as a single pseudo-observation and folds in the trial results, blends reward drift as `0.7·η + 0.3·bounded`, and clamps η to [0, 1]. This is not the paper's Laplace formula. [code:core/skill/lifecycle.ts]

## Implications for distil

- **Use the skill tuple as distil's output schema, re-cast for corrections.**
  - `trigger` (ϕ): the context in which the rule applies.
  - `rule`: the procedure π, written as an atomic instruction.
  - `check`: an **executable** version of κ. MSCE's κ is natural language, so distil's check is the stronger version of it.
  - `boundary` (ℬ).
  - `evidence` (𝒜): session file, turn IDs and a quoted correction, at most around 6 entries.
  - `guidance` (𝒟): use the paper's full d = (c, a⁺, a⁻, e, ξ). A correction is exactly a "do a⁺, not a⁻" pair with evidence, and the paper names user corrections as a source for 𝒟 (§8.10). Avoid the code's lossy `{preference[], antiPattern[]}`.
  - `reliability` (η).
- **Borrow the promotion gates, and keep the paper's stricter values, not the code defaults.**
  - Only propose a rule when the correction recurs across **at least 2 distinct sessions** (n_min = 2).
  - Run a deterministic verifier before emitting: evidence IDs must resolve to real transcript turns, and the check must parse and run. Drop failing drafts silently, as §4.3 does.
  - Mark new proposals "probationary".
- **Reliability can be computed offline from later transcripts.**
  - Once the human has installed a rule+check, count n_trial as later sessions where the trigger fired and n_pass as those where the check passed with no re-correction. Then η = (n_pass+1)/(n_trial+2).
  - If the same correction recurs, that is a "user rejection". Distil should *propose* a narrower ℬ or a revised 𝒟 (Tab. 4), not make the edit itself.
  - Suggest retiring a rule when η < 0.2.
  - Treat all of these as ranking signals, not guarantees, as the paper's Limitations section warns.

## Verification notes

**What I fetched**
- The abs page loaded and the title matches exactly. The date, authors and comments field come from it.
- HTML v1 loaded. It is the only version; I did not try v2 because the abs page lists v1 only.
- The GitHub repo page, the LICENSE file (raw), `ARCHITECTURE.md`, `core/types.ts`, `core/skill/types.ts`, `core/skill/lifecycle.ts`, `core/skill/verifier.ts` and `core/config/defaults.ts` all loaded.

**How reliable the details are**
- Everything was read through WebFetch's summarising model, not as raw text.
- I re-fetched the load-bearing items and they came back consistent: Table 4, Table 6, the §8.8 text, the §8.10 d-tuple and the Tab. 1–3 numbers.
- The §9 example strings and the equation symbols come from single extractions, so treat them as close paraphrase-level quotes.

**Discrepancies with the brief**
- The brief asks for a "verbatim example record". **None exists**: the paper only instantiates the L2 policy fields, not a full skill.
- The brief expects "applicability boundaries … verification rules" as structured fields. In both the paper and the code they are **free-text strings**, and κ is not an executable check.
- "Retirement/decay": the paper has archive-on-inactivity but gives no inactivity window and no time-decay formula.
- The released code diverges from the paper's thresholds and η formula, and never mentions MSCE.
