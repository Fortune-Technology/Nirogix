import { env } from '../../config/env';
import { AppError, Errors } from '../../http/error';
import { listDrugs } from '../pharmacy/pharmacy.service';
import { writeAudit } from '../audit/audit.service';

/**
 * AI prescription drafting (ADR-070).
 *
 * The boundaries that make this safe to ship:
 * - **Env-gated existence.** No `ANTHROPIC_API_KEY`, no feature — `aiCapabilities()`
 *   says so and the Portal renders nothing. There is never a stubbed button.
 * - **A draft, never an order.** The response fills the prescription rows in the
 *   consultation form; the doctor edits, accepts or discards, and nothing reaches
 *   `prescriptions` until they save — the same rows they could have typed by hand.
 * - **The formulary is the vocabulary.** The model is told what the hospital stocks
 *   and asked to prefer it, so drafts land on drug-master rows the pharmacy can
 *   actually dispense (free-text suggestions are still possible, flagged unmatched).
 * - **No PHI beyond the clinical minimum.** Complaint, diagnoses, vitals summary and
 *   age/gender go out; never the patient's name, UHID or contact details.
 */

type DraftInput = {
  chiefComplaint?: string | null;
  diagnoses: Array<{ icd10Code: string; icd10Term: string }>;
  ageYears?: number | null;
  gender?: string | null;
  vitalsSummary?: string | null;
};

export type DraftedPrescription = {
  drugName: string;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  /** Matched against the drug master by exact name (case-insensitive). */
  drugId: string | null;
};

export function aiDraftEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export async function draftPrescription(
  tenantId: string,
  input: DraftInput,
  actorUserId?: string,
): Promise<{ prescriptions: DraftedPrescription[]; note: string | null }> {
  if (!aiDraftEnabled()) throw Errors.notFound('AI drafting is not enabled on this deployment');
  if (!input.chiefComplaint?.trim() && input.diagnoses.length === 0) {
    throw Errors.validation(undefined, 'Enter a chief complaint or a diagnosis first. The draft needs clinical context');
  }

  const formulary = await listDrugs(tenantId);
  const formularyNames = formulary.slice(0, 80).map((d) => d.name);

  const system = [
    'You draft OPD prescriptions for an Indian outpatient clinic. You return STRICT JSON only.',
    'Rules: prefer drugs from the provided formulary EXACTLY as named; conservative adult dosing',
    'unless age says otherwise; at most 5 items; frequency in the 1-0-1 Indian convention;',
    'include route and plain-language instructions. If the presentation needs urgent/in-person',
    'escalation rather than medication, say so in "note" and keep the list short or empty.',
    'Output shape: {"prescriptions":[{"drugName":"","dose":"","frequency":"","duration":"","route":"","instructions":""}],"note":""}',
  ].join(' ');

  const user = JSON.stringify({
    chiefComplaint: input.chiefComplaint ?? null,
    diagnoses: input.diagnoses,
    ageYears: input.ageYears ?? null,
    gender: input.gender ?? null,
    vitals: input.vitalsSummary ?? null,
    formulary: formularyNames,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let raw: string;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.AI_DRAFT_MODEL,
        max_tokens: 1000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    raw = data.content?.find((c) => c.type === 'text')?.text ?? '';
  } catch {
    throw new AppError(502, 'AI_UNAVAILABLE', 'The AI draft service is unavailable. Write the prescription by hand');
  } finally {
    clearTimeout(timer);
  }

  let parsed: { prescriptions?: Array<Record<string, unknown>>; note?: unknown };
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    throw new AppError(502, 'AI_UNAVAILABLE', 'The AI draft could not be read. Write the prescription by hand');
  }

  const byName = new Map(formulary.map((d) => [d.name.toLowerCase(), d.id]));
  const prescriptions: DraftedPrescription[] = (parsed.prescriptions ?? []).slice(0, 5).map((p) => {
    const drugName = String(p.drugName ?? '').slice(0, 200);
    return {
      drugName,
      dose: p.dose ? String(p.dose).slice(0, 80) : null,
      frequency: p.frequency ? String(p.frequency).slice(0, 80) : null,
      duration: p.duration ? String(p.duration).slice(0, 80) : null,
      route: p.route ? String(p.route).slice(0, 40) : null,
      instructions: p.instructions ? String(p.instructions).slice(0, 500) : null,
      drugId: byName.get(drugName.toLowerCase()) ?? null,
    };
  }).filter((p) => p.drugName.trim().length > 0);

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'emr.ai_draft',
    resourceType: 'encounter',
    metadata: { items: prescriptions.length, model: env.AI_DRAFT_MODEL },
  });

  return { prescriptions, note: typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.trim() : null };
}
