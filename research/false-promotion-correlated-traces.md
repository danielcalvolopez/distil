# When Not to Write Memory: Governing False Promotion from Correlated Agent Traces

- **arXiv ID:** 2607.02579 (v1 only; `/abs/2607.02579v2` returns 404)
- **Submitted:** 30 Jun 2026 (v1, Tue 30 Jun 2026 21:27:41 UTC)
- **Category:** cs.SE. Comments field: "Accepted by mlise 2026"
- **Link:** https://arxiv.org/abs/2607.02579 · HTML: https://arxiv.org/html/2607.02579v1 · PDF: https://arxiv.org/pdf/2607.02579v1 (7 pages)
- **Authors:** Yijiashun Qi (University of Michigan, corresponding), Xiang Xu (ByteDance Inc.), Yuxuan Li (University of Pennsylvania)
- **Paper licence:** CC BY 4.0 (HTML header and PDF metadata)

## Summary

- The core claim: when several agents repeat the same observation, those repeats aren't independent votes. They can come from a copied source, a shared prompt, shared tools or context, a stale environment, or a narrower scope. Promoting repeated claims naively makes memory "a persistence layer for correlated errors". (§I)
- Writing memory is framed as an evidence-governance decision, not summarisation. Each candidate memory is routed to **Promote**, **Reject** or **NeedsReview**. (§III)
- **GovMem** is a "conservative side agent". It is a task-independent auditor between the memory proposer and long-term storage, and it must inspect event-level lineage, not post-hoc summaries. (§III)
- Four steps: (1) aggregate similar observations into a candidate and keep provenance; (2) estimate *effective support* by grouping observations by dependency structure; (3) retrieve and classify counterevidence and check scope compatibility; (4) apply dependency-aware verification and route. (§III)
- Synthetic benchmark: false promotion drops from **0.597** (raw frequency) to **0.040**, with 0.960 recall and 0.151 review burden. (Abstract; §IV, Table III)
- Real traces (120 candidates from 79 project-internal traces): false promotion drops from **0.371** (source+scope) to **0.032**. The cost is **0.692** review burden, and direct recall falls to **0.448**. Held-out false promotion is still **0.111**. (§V, Table IV)
- A very simple baseline, **review-all-correlated**, almost matches GovMem: 0.033 vs 0.032 false promotion, with better recall (0.881 vs 0.448) and lower review burden (0.492 vs 0.692). The authors say GovMem "does not yet dominate simple correlated-evidence review." (§V, §VII)
- External SWE-agent/OpenHands stress test: humans adjudicated 133 high-impact candidates and approved **none** for automatic promotion. All 11 "verification-gate positives" were rejected as boilerplate, shared-tool artifacts, file dumps or non-reusable debugging traces. (§VI, Table VIII)
- Human agreement on promote/reject/review is low: 58.6% exact agreement, Cohen's κ = 0.208. Even people find this call hard. (§III)
- The authors call it a diagnostic design point, not a validated automatic memory writer. The downstream-harm experiment was scaffolded but never run. (§VI, §VII)

## Reusable for distil

**Method (§III).** There is no formula. The paper gives no equation, score, weight or numeric threshold for independence or effective support. "Effective support" means grouping observations by dependency category rather than counting raw occurrences or deduplicating sources: "observations that share prompts, tools, intermediate context, or parent events should not count as independent votes." Provenance fields per observation are: source, prompt family, parent event, environment, trust. (§III)

**Annotation schema (Table II, §III).** This is the most directly reusable artifact: one record per candidate memory.

| Field | Values |
|---|---|
| Candidate | normalized reusable claim |
| Evidence refs | trace, event, or document refs |
| Dependency | independent, copied source, shared prompt/tool, echo, low trust, unknown |
| Validity | valid, invalid, scope-limited, stale, uncertain |
| Scope | task, repo, version, environment, preconditions |
| Counterexamples | contradicting or narrowing refs |
| Decision | yes, no, needs-review |
| Rationale | short human explanation |

**Baselines (§IV–V).** These are useful as distil's own ablation ladder: raw frequency, unique-source counting, source+scope gating, confidence-like scoring, counterexample-only promotion, GovMem-lite, GovMem-verified, a full-split GPT-5.5 judge, and review-all-correlated. Review-all-correlated sends every non-independent dependency type to review and applies source+scope only to independent candidates. (§V)

**Metrics (§IV).** Precision, recall, false-promotion rate, review burden, budgeted downstream utility (B@1, B@3), AUPRC. §V also separates *direct recall* (positives auto-promoted) from *actionable recall* (positives promoted or routed to review).

**Headline numbers.**

| Setting | Method | False prom. | Recall | Review burden | Source |
|---|---|---|---|---|---|
| Synthetic GovMem-Bench | raw-frequency | 0.597 | 1.000 | 0.000 | Table III |
| | unique-source | 0.625 | 0.500 | 0.000 | Table III |
| | source+scope | 0.500 | 0.500 | 0.000 | Table III |
| | confidence | 0.729 | 0.372 | 0.000 | Table III |
| | govmem-lite | 0.000 | 0.500 | 0.000 | Table III |
| | govmem-verified | 0.040 | 0.960 | 0.151 | Table III |
| Real traces, n=120 | raw-frequency | 0.442 | 1.000 (direct) | 0.000 | Table IV |
| | source+scope | 0.371 [0.282, 0.467] | 0.985 | 0.042 | Table IV, §V |
| | dependency-aware | 0.032 [0.000, 0.100] | 0.448 direct / 1.000 action | 0.692 | Table IV, §V |
| | GPT-5.5 judge | 0.097 | 0.970 | 0.375 | Table IV |
| | review-all-correlated | 0.033 | 0.881 | 0.492 | §V text |
| Held-out split (n=35) | source+scope vs dependency-aware | 0.400 [0.226, 0.581] vs 0.111 [0.000, 0.375] | — | — | §V, Fig. 3 |
| External pilots (2×50 trajectories) | raw / unique-source / source+scope | 0.500 each | — | — | §VI |
| | dependency-aware | 0.000 | 0.500 (action 1.000) | 0.750 | §VI |
| External V2 packet (n=133) | all auto-promotion candidates | 0/133 safe; 114 no, 19 review | — | — | Table VIII |

Brackets are bootstrap intervals over 1000 resamples (§V).

**False promotion by dependency type** (83-candidate diagnostic subset; Raw = raw frequency, S+S = source+scope, DA = dependency-aware). The HTML labels this table "TABLE VI" but prints Table V's caption; the prose in §V describes it correctly.

| Dependency | n | Raw FP | S+S FP | DA promoted | DA review | DA FP |
|---|---|---|---|---|---|---|
| copied-source | 3 | 1.000 | 0.000 | 0 | 3 | 0.000 |
| independent | 46 | 0.152 | 0.049 | 16 | 25 | 0.000 |
| low-trust | 8 | 1.000 | 1.000 | 0 | 8 | 0.000 |
| same-agent echo | 7 | 0.714 | 0.667 | 2 | 4 | 0.000 |
| shared-prompt | 4 | 1.000 | 1.000 | 0 | 4 | 0.000 |
| shared-tool | 8 | 0.500 | 0.429 | 3 | 5 | 0.000 |
| unknown | 7 | 1.000 | 1.000 | 0 | 7 | 0.000 |

The takeaway (§V): GovMem is safe mainly because it routes dependency-risky categories to review, not because it scores evidence cleverly. Copied-source, low-trust, shared-prompt and unknown candidates are never auto-promoted.

## False-promotion criteria

The paper has no single rule list. Below is everything it gives, merged from the labeling protocol (§III), the GovMem steps (§III), the benchmark trap types (§IV) and the failure analysis (§VI).

**A candidate is safe to auto-promote ("yes") only if ALL of these hold (§III):**
1. The evidence supports the claim.
2. The support is independent, or explicitly verified.
3. The reusable scope is clear.
4. No strong counterexample is visible.
5. Writing it would not mislead a future agent.

**Reject ("no") if any of these hold (§III):**
- It is contradicted.
- It is stale (true under an old environment or version).
- It is over-broad (claims more scope than the evidence covers).
- It rests on failed or low-trust evidence.
- It is boilerplate, task-local narration, a source dump, or other non-reusable trace content.

**Route to review ("needs-review") when (§III):** the claim may be useful, but evidence independence, scope, trust or external context is unresolved.

**Evidence that does not count as independent support ("correlated traces", §I, §III, Table II):**
- Observations that share a **prompt** or prompt family.
- Observations that share **tools**.
- Observations that share **intermediate context**.
- Observations that share a **parent event**.
- **Copied source**: one note echoed into several traces.
- **Same-agent echo**: the same agent repeating itself.
- **Low-trust** provenance.
- **Unknown** dependency, which is treated as risky: DA never auto-promoted it (Table VI).

The paper defines correlation only through these categorical provenance labels. There is no statistical correlation measure. It also does not explain how dependency labels are inferred automatically without oracle metadata; §V only mentions "GPT-assisted pre-labeling" and human gold labels.

**Synthetic trap types (§IV):** true copied, false copied, false correlated, stale, adversarial, out-of-scope. It also injects clustering noise, where extraction merges or splits candidates.

**Signals that look like verification but aren't (§VI):**
- **Boilerplate verification:** pytest output, warning banners or command echoes taken as proof.
- **Task-local narration:** what the agent tried in one issue, which won't transfer.
- **File dumps:** source listings or repo inventories turned into procedural memory.
- **Non-reusable debugging traces:** failed edits, read-only inspections, speculative diagnoses.
- Patch-success claims that were read-only, failed, or lacked independent outcome evidence.

**Adjudication rule (§III):** when reviewers disagree, pick "the narrowest safe non-misleading label". A disputed positive or review label is not upgraded to yes unless both the claim and its evidence path survive re-inspection.

**Governance lifecycle: not in the paper.** The paper's governance is only the write-time three-way gate with an explicit human review path. It describes no quarantine, decay, expiry, revocation or post-write correction. It gives no numeric promotion threshold, such as a minimum count of independent groups.

## Code & data

- **None released.** The HTML and PDF contain no GitHub, dataset or artifact-availability link. The only URLs in the PDF are the CC BY 4.0 licence, the arXiv abs/DOI, and font/tool metadata. GovMem-Bench, the 120-candidate real-trace set and the 133-row V2 packet are not published.
- **Code licence:** not found, because there is no code.
- **Same-name repos that are NOT this paper's code:**
  - https://github.com/digit50/govmem is a governed shared-memory store (scope, provenance, supersession).
  - https://github.com/YoutingWang/govmem is "GovMem: Governed Memory for LLM Agents", with write-time quarantine, revocation and lineage repair. It was created April 2026, before this paper.
  - Neither README cites arXiv 2607.02579 or these authors, and GitHub detects no licence file in either.
- The paper appears in the curated list https://github.com/tfatykhov/awesome-agent-memory (per WebSearch).

## Implications for distil

- **Count independent evidence groups, not occurrences.** Before a cluster of corrections can back a rule, collapse repeats that share a parent event: the same session, the same originating instruction, or the same agent re-hitting the same mistake after one correction. By default, also collapse repeats that share the same project CLAUDE.md or tool. That's the paper's shared-prompt, shared-tool and same-agent-echo categories (§III, Table VI). Mapping "same session" and "same project" onto these categories is my inference; the paper never mentions sessions or projects. Cross-session, cross-project recurrence is the closest analogue to "independent".
- **Default to review-all-correlated, emit a routing label, and never auto-promote.** Tag each proposed rule+check promote / reject / needs-review. Send anything whose support isn't independent, or whose dependency is unknown, to needs-review. The paper shows this simple rule nearly matches GovMem's false promotion (0.033 vs 0.032) with far better recall (§V). It also fits distil's propose-only design, since the human is the review path. Store the Table II fields (evidence refs, dependency, validity, scope, counterexamples, rationale) with every proposal so the reviewer can audit it.
- **Treat an executable check as a claim, not proof.** The paper's harshest result: all 11 verification-gate positives were rejected because the "verification" was boilerplate or task-local (§VI, Table VIII). A check passing once in the session it came from doesn't validate the rule. Scope each rule explicitly (repo, version, preconditions). Reject candidates drawn from failed edits, read-only exploration or one-off task narration. Look for counterexamples before proposing: a later session where the human accepted the opposite behaviour.

## Verification notes

- **Fetched OK:**
  - The abs page (title matches exactly; v1 only, 30 Jun 2026).
  - The full HTML at `/html/2607.02579v1`, downloaded and converted to text, so all quotes and numbers above come from it directly.
  - The PDF (7 pages): scanned for URLs and code/appendix keywords, none found. The PDF text was not fully extracted (no pdftotext); I relied on the HTML.
- **Failed / absent:** `/abs/2607.02579v2` is 404. There is no appendix in the HTML or PDF. There is no code or data release.
- **Differences from the brief:**
  1. The brief expected formulas and thresholds for evidence independence. The paper has none; independence is purely categorical.
  2. The brief expected governance steps such as quarantine, decay and revocation. Only the write-time promote / reject / needs-review gate with human review exists.
  3. The brief expected "same-session repetition" and "single-source" as named criteria. The paper names neither. Its nearest categories are same-agent echo, shared prompt/tool/context/parent event, and copied source, and unique-source counting appears only as a weak baseline (Table III false promotion 0.625).
  4. The brief expected "confounded outcomes". The closest in the paper is failed or read-only patch claims lacking independent outcome evidence (§III, Table VIII).
  5. Paper-internal inconsistency: the HTML "TABLE VI" repeats Table V's caption; its contents match the §V description of per-dependency false promotion on 83 candidates.
  6. An earlier WebFetch summary (a model paraphrase) said "No appendix" and "no revocation, decay, or quarantine". The full-text read confirms both.
