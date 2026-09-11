# Research — Stage 1: correction → executable check

Background reading for turning each detected correction into an atomic rule paired with an executable check, while distil stays proposal-only. Each note cites its sources (abs page, HTML section, or repo file) and ends with a "Verification notes" section on what was fetched and where the brief was wrong.

**ID check:** all five arXiv IDs resolved to the expected titles. No substitutions.

**Source fidelity:** the TRACE and GovMem notes were written from the raw HTML/source text. The other three were read through a summarising fetcher. Their load-bearing tables were re-fetched and cross-checked, but treat their quoted sentences as near-verbatim, not guaranteed.

## Index

| # | Paper | One-line takeaway | What it changes in distil |
|---|---|---|---|
| 1 | [TRACE — Compiling User Corrections into Runtime Enforcement](trace-compiling-corrections.md) · 2606.13174 · Jun 2026 | Retrieving a preference isn't the same as complying with it. Memory-only (Mem0) leaves **57.5%** of applicable preference checks violated, and compiled rules cut that to **29.9%**. Checks are hook-run verifiers that block with exit 2 and are validated by replaying the original correction. | Gives us the rule schema (`rule_text`, `applies_when`, `does_not_apply_when`, `evidence_spans`) and three check tiers: deterministic PreToolUse/Stop hook, semantic model judge, and reminder-only. It also gives a four-stage check validation (parse → schema → unit → replay) and a NOOP/UPDATE/SUPERSEDE/SPLIT/NEW resolver against already-installed rules. |
| 2 | [How Coding Agents Fail Their Users](misalignment-taxonomy-20k-sessions.md) · 2605.29442 · May/Aug 2026 | 16k validated misalignment episodes. Constraint violation (S3) is 38% of episodes and 49% in CLI. Instruction-following failure (C6) is the top cause at 36%. 91.5% of visible fixes needed developer pushback. | Gives us a classification schema: symptom S1–S8, cause C1–C7 with an evidence tier, outcome split into severity and locus, and resolution split into status and resolver. It also gives a "visible pushback" gate plus 8 INVALID reasons as a false-positive filter. S3 and S7 map to mechanical checks; S2/C1 stay as prose. |
| 3 | [MSCE — From Memory to Skills](msce-memory-to-skills.md) · 2607.16621 · Jul 2026 | A skill is k = (trigger, procedure, verification, boundary, evidence anchors, decision guidance, reliability η). η = (n_pass+1)/(n_trial+2). A user rejection narrows the boundary. | Candidate output schema. A correction is a guidance item d = (context, a⁺, a⁻, evidence, reliability), and our executable check is a stronger κ than MSCE's free-text one. It also gives probationary → active → archived states (η > 0.6 / η < 0.2) and a deterministic verifier before anything is shown. |
| 4 | [Do Personalized Skills Help Coding Agents?](personalized-skills-negative-result.md) · 2608.10319 · Aug 2026 | Negative result: personalized +0.97 (p=.399), no better than a *random other developer's* skill. Pooled generic scored +3.78 (p=.063, also not significant). Personalization helped only with **≥6 task-related past sessions** (+10.17; n=12, one seed, no test). | Suggests a two-tier promotion threshold: 2–5 independent sessions = "observing", ≥6 = "propose" (configurable, not validated). Rules must be trigger-scoped rather than always-on, because 0 related sessions cost −6.33. LLM refinement of rules added nothing (+0.28, p=.792). |
| 5 | [When Not to Write Memory (GovMem)](false-promotion-correlated-traces.md) · 2607.02579 · Jun 2026 | Repeats that share a prompt, tool, context, parent event or source are not independent votes. Routing all correlated candidates to review cut false promotion from 0.371 to 0.033 on real traces. 0 of 133 externally-adjudicated candidates were safe to auto-promote. | Count **independent evidence groups**, not raw occurrences. Same-session repeats are echoes, not corroboration. Every proposal carries a promote / reject / needs-review routing label with dependency, scope and counterexample fields. A check passing on its source session is not proof. |

## How the papers fit together

**Detection:**
- #2 says *what* counts as a correction, and how to reject false ones.
- #5 says which repeats count as *independent* evidence.
- #4 says *how many* independent repeats before personalization pays off.

**Compilation:** #1 says how to turn a correction into a rule plus a verifier and validate it. #3 gives the record shape and a reliability/lifecycle model.

## Open questions (the papers leave these to us)

1. **What's the promotion threshold?** The sources disagree:
   - TRACE filters on "appears at least twice across transcripts".
   - MSCE uses n_min = 2 episodes. Its released code quietly lowers this to 1.
   - The personalized-skills paper only sees gains at ≥6 *task-related* sessions, which is not the same as ≥6 observations of one preference.
   - GovMem refuses to give any number.

   We must pick a default and decide whether we count sessions, independent groups, or projects.
2. **What counts as "independent" in Claude Code transcripts?** GovMem defines correlation categorically (shared prompt/tool/context/parent/source) and never automates the labelling. We have to decide:
   - whether two sessions in the same project, under the same CLAUDE.md, count as one group or two;
   - whether a repeat after a `/clear` or resumed session is an echo.
3. **How do we generate checks?** TRACE's per-rule check compiler and its four-stage self-verify **are not in the released code**; the deterministic layer ships empty. It also **reports no detector precision/recall**. Nobody has published a correction → check generator we can reuse or benchmark against. Stage 1 also has to decide whether generation uses an LLM, which v0 doesn't, or templates keyed on check type.
4. **Can offline replay be compared to the 57.5% baseline?** TRACE measured compliance by *re-running agents* on 19 held-out tasks from one user. distil replays *static* transcripts, so it can measure "would this check have fired on the original violation, and stayed silent elsewhere?" but not "would the agent then have complied". We need to define our metric and state plainly how it differs from TRACE's.
5. **Where should checks run in Claude Code?** The paper's example is a PreToolUse-Bash hook. The released Claude Code skill uses only Stop and UserPromptSubmit, with streak-bypass after 3 consecutive blocks and fail-open on errors. Blocking false positives are costly. We need to choose the default hook point and the default mode (observe vs enforce) for what we propose.
6. **How narrow should scope be?**
   - Too broad: personalized-skills shows harm when rules fire on unrelated tasks (−6.33, and about +35% tokens).
   - Too narrow: tellonce warns against baking in incidental context ("'be concise' said while planning a trip remains broadly applicable").

   No paper gives an algorithm for deriving `applies_when` from evidence.
7. **How do we detect counterexamples?** GovMem and MSCE both want contradicting evidence considered, e.g. a later session where the user accepted the opposite behaviour. Neither says how to find it automatically in transcripts.
8. **What happens after install?** MSCE's η needs post-install trial counts. distil could infer these from later transcripts (trigger fired → re-correction or not), but only if it knows which proposals the user actually installed. `status: accepted` is a proxy, not proof. No paper covers a propose-only system's feedback loop.
9. **Generic or personal?** Pooled guidance beat per-developer guidance in #4. Should distil flag corrections that are really generic best practice, and would the user even want those?
10. **How reliable are the cause labels?** In #2, cause is the least reliable axis (0.65 human agreement; 26.85% "cannot determine"). If distil routes on cause, it inherits that noise. Routing on symptom (0.79) is safer.

## Licences, for any reuse of prompts or schemas

- TRACE_exp and tellonce: MIT
- coding-agent-misalignment (prompts plus label data; raw traces not redistributed): MIT
- MemOS (MSCE's linked code; doesn't mention MSCE): Apache-2.0
- GovMem and the personalized-skills paper: no code released
- The SWE-chat dataset underlying #4: ODC-By on Hugging Face (gated), MIT on GitHub
