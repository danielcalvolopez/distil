import type { Symptom } from "../types.js";

const A = "['’]?"; // straight or curly apostrophe, or none

/** S7: the user disputes the agent's account of its own work. */
const S7: RegExp[] = [
  new RegExp(`\\b(it${A}s|that${A}s|this is|it is)\\s+(still\\s+)?not\\s+(actually\\s+)?(fixed|working|done|passing|resolved)\\b`, "i"),
  new RegExp(`\\byou\\s+(didn${A}t|did not|never)\\s+(actually\\s+)?(run|test|check|verify|build)\\b`, "i"),
  /\bstill\s+(fails|failing|broken|errors?|not working)\b/i,
  /\byou said (it|they|that) (was|were|is|are) (fixed|working|done|passing)\b/i,
];

/** S4: the user rejects work they did not ask for. */
const S4: RegExp[] = [
  new RegExp(`\\b(i\\s+)?(didn${A}t|did not|never)\\s+ask(ed)?\\s+(you\\s+)?(to|for)\\b`, "i"),
  /\b(no one|nobody)\s+asked\b/i,
  /\bwhy did you\s+(add|create|install|delete|remove|rename|change|touch|refactor)\b/i,
];

/** S3: a prohibition, or an instruction the user is restating. */
const S3: RegExp[] = [
  new RegExp(`^(no|nope|stop|don${A}t|never)\\b`, "i"),
  new RegExp(`\\b(don${A}t|do not|never|stop)\\s+\\w+`, "i"),
  /\b(always|i said|i told you|as i said|again|i already|from now on)\b/i,
];

export function classifySymptom(text: string): Symptom {
  if (S7.some((r) => r.test(text))) return "S7";
  if (S4.some((r) => r.test(text))) return "S4";
  if (S3.some((r) => r.test(text))) return "S3";
  return "unclassified";
}
