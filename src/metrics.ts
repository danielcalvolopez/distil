import type { CorrectionMetrics, CorrectionRecord, Symptom } from "./types.js";
import { clusterByText } from "./detect/cluster.js";
import { isMechanizable } from "./detect/pairing.js";

export function correctionMetrics(records: CorrectionRecord[], now = Date.now()): CorrectionMetrics {
  const bySymptom: Record<Symptom, number> = { S3: 0, S4: 0, S7: 0, unclassified: 0 };
  for (const r of records) bySymptom[r.symptom]++;

  const clusters = clusterByText(records, (r) => r.correction.excerpt);
  let recurring = 0;
  let recurringCrossSession = 0;
  let preferencesRecurred = 0;
  for (const c of clusters) {
    if (c.length > 1) preferencesRecurred++;
    const stated = new Set<string>();
    const ordered = c.slice().sort((a, b) => a.correction.ts - b.correction.ts);
    for (const [i, r] of ordered.entries()) {
      if (i > 0) {
        recurring++;
        if (!stated.has(r.correction.sessionId)) recurringCrossSession++;
      }
      stated.add(r.correction.sessionId);
    }
  }

  return {
    corrections: records.length,
    paired: records.filter((r) => r.violation !== null).length,
    mechanizable: records.filter(isMechanizable).length,
    bySymptom,
    preferences: clusters.length,
    preferencesRecurred,
    recurring,
    recurringCrossSession,
    computedAt: now,
  };
}

function pct(n: number, d: number): string {
  return d ? `${Math.round((100 * n) / d)}%` : "n/a";
}

export function formatMetrics(m: CorrectionMetrics): string {
  const s = m.bySymptom;
  return [
    `Corrections: ${m.corrections}  paired with the agent action: ${m.paired} (${pct(m.paired, m.corrections)})  mechanizable (candidate): ${m.mechanizable} (${pct(m.mechanizable, m.corrections)})`,
    `Symptoms: S3 ${s.S3} · S4 ${s.S4} · S7 ${s.S7} · unclassified ${s.unclassified}`,
    `Recurrence despite correction: ${m.recurring} of ${m.corrections} corrections (${pct(m.recurring, m.corrections)}) restate an earlier one; ${m.recurringCrossSession} in a later session. Preferences re-violated: ${m.preferencesRecurred} of ${m.preferences}.`,
  ].join("\n");
}
