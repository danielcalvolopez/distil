# Do Personalized Skills Help Coding Agents? An Empirical Study of Developer Interaction Histories

- **arXiv ID:** 2608.10319 (cs.SE; cs.AI)
- **Submitted:** v1 Mon 10 Aug 2026; v2 Sat 15 Aug 2026 (current). Source: abs page.
- **Link:** https://arxiv.org/abs/2608.10319 (HTML: https://arxiv.org/html/2608.10319v2)
- **Authors:** Shuyan Huang (UMass Amherst), Kai Du (OpenRefinery.ai), Andrew Lan (UMass Amherst)
- **Comments field:** 15 pages, 10 figures

## Summary

- The authors mine a "personalized skill" (a SKILL.md file of rules) from each developer's past coding-agent sessions and test whether it helps the agent on that developer's held-out sessions. [Abstract; §2]
- The data is **206 real sessions from 13 developers**, filtered from SWE-chat (8,866 public CLI coding-agent sessions collected via Entire.io, Jan–Jun 2026). Sessions are split 80/20 per developer into 164 "evolution" (mining) and 42 test sessions. [§3.1]
- Held-out sessions are replayed against the agent. A simulated developer (an LLM prompted with a task summary) issues follow-ups for up to 6 turns, and an LLM judge scores the result on SWE-chat's 100-point rubric. [§2.3; §3.2]
- **Headline (negative) result:** personalized skills score 65.99 against 65.02 for no skill (+0.97, paired t-test p=.399, not significant). They are no better than a *random other developer's* skill (65.94). [Table 1; §3.3]
- A **generic skill pooled across all developers** scores best at 68.80 (+3.78 over no skill, win rate 50.95%). That gain is also **not significant** (p=.063). [Table 1; §3.3]
- Personalized skills help only when the target task has **≥6 semantically related past sessions** (+10.17 over no skill, n=12 tasks). They do nothing at 1–5 related sessions and hurt at 0 (−6.33, n=3). This subgroup analysis is not significance-tested and uses one seed. [Table 2; §4.1]
- Per developer, only **6 of 13** do better with their personalized skill than with no skill. 8 of 13 do better with their own skill than with a mismatched developer's skill. [Appendix B]
- Personalized skills make the agent do *more* work: 597,120 vs 442,096 tokens, 2.22 vs 1.65 files changed, and 0.37 vs 0.29 unresolved follow-ups. Successful validation rises from 43.1% to 58.9%. [Table 3; §4.3]
- The authors attribute the failure mainly to **data scarcity**: short per-developer histories make it hard to "distinguish stable developer preferences from task-specific or one-off feedback". [Abstract; §4; Limitations]

## Reusable for distil (method and numbers)

**Mining pipeline** [§2.2]
1. *Bootstrap:* "lightweight pattern-matching rules" run over all developer turns in the evolution set. They extract communication style, work preferences, follow-up and correction behavior, and (when explicit) validation and commit preferences. The output is a SKILL.md with sections for scope, communication, work style, follow-up handling, validation, and representative interaction examples.
2. *Evidence-grounded refinement:* an LLM refiner treats the evolution sessions as primary evidence and the bootstrap rules as candidates, then retains, revises, or removes them and adds missed recurring preferences. **Support threshold:** "The refiner retains a rule only when it is supported by at least two independent developer turns from different evolution sessions."
3. The prompts (refiner Fig. 6, agent execution, task summary, simulator Fig. 9, scoring) are in Appendix C, Figs. 6–10. They are **images in the HTML**, so I could not quote them.

**Models** [§3.2]: "Codex with GPT-5.5" handles skill generation, agent execution, developer simulation, and scoring. The same model family plays judge and agent, which is a possible bias (my observation, not the paper's).

**Evaluation** [§3.2; Table 1 caption]
- 5 random seeds for the per-developer split, giving 210 replay instances per condition (42 × 5).
- Metrics: judge score (0–100), follow-up rate ("% of replay instances in which the simulated developer issues at least one non-terminal follow-up"), and win/tie/loss against no skill.
- Simulator fidelity: 89.47% semantic alignment with the real developer's follow-ups (59.65% exact, 29.82% partial, 10.53% mismatch; n=171). [§4.2]

**Table 1 (main results; identical in v1 and v2)**

| Condition | Score | Follow-up rate | Win/Tie/Loss vs A |
|---|---|---|---|
| A No skill | 65.02±3.24 | 24.76% (52/210) | – |
| B Personalized | 65.99±2.14 | 30.95% (65/210) | 41.43/14.76/43.81 |
| C Random other developer's skill | 65.94±3.66 | 27.62% (58/210) | 43.33/17.62/39.05 |
| D Generic (pooled) | 68.80±2.26 | 30.00% (63/210) | 50.95/14.76/34.29 |

- p-values are paired t-tests: B vs A p=.399; D vs A p=.063. No B vs D test is reported. [§3.3]
- The "generic" skill is built "from the pooled evolution sessions of all developers, **including those of the target developer**", so it is not leave-one-out. [§3.3]

**Ablation (Table 5, Appendix A):** bootstrap-only scores 65.71±1.65 and bootstrap + LLM refinement scores 65.99±2.14 (+0.28, p=.792). Follow-up rates are identical. The LLM refinement step adds essentially nothing measurable.

**Skill content (Table 4, §4.4)**

| | Personalized | Generic |
|---|---|---|
| Rules per skill | 14.15 | 25.00 |
| Words per rule | 16.70 | 15.32 |
| Commit rules | 7.6% | 16.0% |
| Follow-up rules | 28.3% | 24.0% |

- Similarity of personalized skills to the generic one is 0.517, and 0.443 between developers.
- 64.7% of personalized rules are "unique developer-specific". The authors note that lexical uniqueness "does not imply that a rule is broadly applicable or relevant to held-out tasks, nor does it guarantee that the coding agent will follow the rule".

## Frequency / repetition conditions

The only quantitative frequency analysis is **Table 2 (§4.1)**. The binning variable is **not** "how often a preference recurred". It is **the number of the developer's evolution sessions that an LLM judged "semantically related" to the held-out task**. Quote: "For each of the 42 held-out tasks in one random seed, we use an LLM to review all evolution sessions from the same developer and identify those that are semantically related to the held-out task."

**Table 2 (identical in v1 and v2)**

| Relevant evolution sessions | n tasks | B−A | B−C | B−D |
|---|---|---|---|---|
| 0 | 3 | −6.33 | +15.00 | −8.00 |
| 1–2 | 16 | 0.00 | −1.38 | −3.81 |
| 3–5 | 11 | +0.10 | +0.20 | −7.20 |
| **≥6** | **12** | **+10.17** | **+8.92** | **+5.67** |

- **Threshold:** the gain appears only in the ≥6 bin. The authors: "When at least six relevant sessions are available, the personalized skill substantially outperforms both the no-skill baseline" and the other conditions; below six "the personalized skill shows little or no advantage". [§4.1]
- **Effect sizes:** at ≥6, +10.17 points over no skill on a 100-point scale, and the only bin where personalized beats generic (+5.67). At 3–5, personalized trails generic by 7.20.
- **Significance:** there is **no statistical test per bin**. The table has **one seed**, small bins (3/16/11/12, total 42), and no CIs. The authors caveat that the "strict filtering criterion establishes a rigorous evaluation setup but limits our ability to draw definitive conclusions". The ≥6 result is suggestive, not established.
- **Rule-level floor:** separately, a rule is kept only with support from ≥2 independent developer turns in different sessions. [§2.2] The paper does not analyse whether rules with more support help more.
- **Authors' framing:** "personalized skills become more effective when developer preferences manifest frequently, especially when they work on similar tasks over time" [Conclusion]. The abstract says personalization works best when preferences occur frequently and relate to future tasks.

## Code & data

- **Paper code / skills / replay harness:** not found. There is no availability statement or GitHub URL in the abs metadata, the HTML full text (v1 or v2), a GitHub search, or the first author's homepage (sonyawong.github.io). The only footnote URL found was Codex (https://chatgpt.com/codex/).
- **Underlying dataset, SWE-chat** (Baumann et al. 2026, arXiv 2604.20779):
  - Hugging Face `SALT-NLP/SWE-chat`, licence tag **odc-by**. Access is gated (you must share contact info). The card shows 5,851 sessions, which differs from the 8,866 the paper cites, probably a different snapshot.
  - GitHub `SALT-NLP/SWE-chat`, **MIT License** ("Copyright (c) 2026 SALT"), confirmed from the raw LICENSE file. The README says "data and code coming soon".
  - SWE-chat sessions come from Claude Code, Codex, Gemini CLI and others via the Entire.io CLI, per the SWE-chat HF/arXiv pages.
- **Licence of the paper's own artifacts:** not found (none released).

## Implications for distil

1. **Promotion threshold (our inference, not the paper's claim):** promote a correction to a rule+check proposal only when it recurs in **≥6 distinct sessions**. Treat **2–5 distinct sessions** as a "candidate, keep observing" tier (it clears the paper's ≥2-independent-turns retention floor [§2.2] but falls in the no-benefit bins of Table 2). Never promote from one session. The caveat: Table 2 bins by task-relevant sessions, is untested for significance, and rests on n=12 tasks and one seed. Treat 6 as a starting default, not a validated constant, and make it configurable.
2. **Scope every rule to where it applies.** With 0 relevant sessions, personalized skills cost −6.33 points [Table 2], and they raised token use by about 35% and files changed by about 35% [Table 3]. So each rule's executable check should carry a trigger condition (file globs, tool, command pattern) and stay silent outside it. It should not be an always-on prompt instruction. This matches the authors' future-work suggestion to retrieve "task-relevant guidance" instead of injecting whole skills [Conclusion].
3. **Don't over-invest in LLM "refinement" or in developer-uniqueness.** LLM refinement added +0.28 (p=.792) [Table 5]. A random developer's skill matched the user's own [Table 1], and pooled generic guidance won overall. distil should rank proposals by recurrence count and checkability rather than polish. It should also flag when a correction is really a generic best practice, which may be better served by an existing shared rule.

## Verification notes

- **Fetched OK:**
  - abs page (title, authors, dates, abstract confirmed as the requested paper).
  - HTML v2 and v1: Tables 1 and 2 are numerically identical across versions.
  - SWE-chat HF card and GitHub repo, including the raw LICENSE.
  - WebSearch for code.
- **Failed or partial:**
  - PDF text extraction failed: the WebFetch summariser saw binary, and there is no local poppler/pypdf.
  - Figs. 6–10 (the prompts) are images in the HTML, so the prompt text is not quoted here.
  - All paper numbers came through WebFetch's summarising model rather than raw text. I cross-checked Tables 1 and 2 across two separate fetches (v1, v2), and they matched.
  - "11 of 13 developers benefited from generic skills" (Appendix B, Fig. 5) came from a single fetch and is not cross-checked, so I left it out of the summary.
- **Discrepancies with the brief:**
  - The "negative result" framing is **supported**: personalized is +0.97, p=.399, and no better than another developer's skill.
  - "Pooled/generic did better" is **supported in means** (68.80) but **not statistically significant** (p=.063).
  - "Personalized helped more when a preference recurred frequently" is **only partly accurate**. The measured variable is the *number of past sessions semantically related to the test task* (task similarity/recurrence), not a count of how often a specific preference was observed. The frequency wording comes from the abstract and conclusion; the numbers come from Table 2's relevance bins.
  - There are no recurrence-rate percentages, per-bin significance tests, or CIs for the frequency analysis.
  - There were four conditions, not three: a random-other-developer skill (C) was also tested.
