/**
 * The ABDM evidence pack — every case NHA requires, and where we show it working.
 *
 * This is the document that goes to an assessor, and it is generated rather than written, for the
 * same reason the matrix is: a hand-maintained checklist drifts from the code the week after it is
 * written, and the last one could not even be reproduced (ADR-104).
 *
 * It joins two things that are deliberately kept apart:
 *
 *   · **Requirements** — derived from NHA's own workbooks by `abdm-audit.ts`. Not editable by us.
 *   · **Evidence** — asserted by a person in `abdm-evidence-map.ts`, and reviewable as a diff.
 *
 * A case with no evidence entry is reported as **NOT EVIDENCED**. That default is the whole point:
 * the pack should get *worse* when NHA adds a case and nobody looks at it, because the alternative
 * is a document that stays green while the gap grows.
 *
 *   npm run abdm:evidence -w hms_backend                    # mandatory + conditional, as Markdown
 *   npm run abdm:evidence -w hms_backend -- --all           # include optional and out-of-scope
 *   npm run abdm:evidence -w hms_backend -- --gaps          # only what is not demonstrable today
 *   npm run abdm:evidence -w hms_backend -- --role=government
 *
 * Reads files and prints. No database, no network.
 */

import { buildMatrix, type Case, type Role } from './abdm-audit';
import { EVIDENCE, type Evidence, type EvidenceStatus } from './abdm-evidence-map';

const LABEL: Record<EvidenceStatus | 'not-evidenced', string> = {
  built: 'BUILT',
  partial: 'PARTIAL',
  unverified: 'UNVERIFIED',
  'not-built': 'NOT BUILT',
  'not-evidenced': 'NOT EVIDENCED',
};

/** Ordered worst-first, because the reader's question is "what is missing". */
const SEVERITY: Array<EvidenceStatus | 'not-evidenced'> = [
  'not-evidenced',
  'not-built',
  'unverified',
  'partial',
  'built',
];

function evidenceFor(c: Case): { key: EvidenceStatus | 'not-evidenced'; ev?: Evidence } {
  const ev = EVIDENCE[c.id];
  return ev ? { key: ev.status, ev } : { key: 'not-evidenced' };
}

function escapeCell(s: string): string {
  // A pipe inside a workbook sentence would otherwise split the Markdown row.
  return s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function main(): void {
  const role: Role = process.argv.includes('--role=government') ? 'government' : 'private';
  const all = process.argv.includes('--all');
  const gapsOnly = process.argv.includes('--gaps');

  const matrix = buildMatrix(role);
  const inScope = matrix.filter((c) =>
    all ? true : c.requirement === 'mandatory' || c.requirement === 'conditional',
  );

  const rows = inScope
    .map((c) => ({ c, ...evidenceFor(c) }))
    .filter((r) => (gapsOnly ? r.key !== 'built' : true));

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);

  const out: string[] = [];
  out.push('# ABDM certification evidence pack');
  out.push('');
  out.push(
    `**Applicant type:** ${role} · **Scope:** ${all ? 'all cases' : 'mandatory and conditional only'}`,
  );
  out.push('');
  out.push(
    'Requirements are derived from NHA’s published workbooks in `docs/testcasesofficial/`; regenerate with ' +
      '`npm run abdm:audit`. Evidence is asserted in `abdm-evidence-map.ts` and reviewed as a diff. ' +
      'A case with no entry is reported as **NOT EVIDENCED** rather than assumed to pass.',
  );
  out.push('');
  out.push(
    '> This states what can be **demonstrated**. It does not claim a pass — that is NHA’s to decide during functional testing.',
  );
  out.push('');

  out.push('## Summary');
  out.push('');
  out.push('| Status | Cases |');
  out.push('|---|---|');
  for (const k of SEVERITY) {
    const n = counts.get(k) ?? 0;
    if (n > 0) out.push(`| ${LABEL[k]} | ${n} |`);
  }
  out.push(`| **Total** | **${rows.length}** |`);
  out.push('');

  const blocking = (counts.get('not-evidenced') ?? 0) + (counts.get('not-built') ?? 0);
  if (blocking > 0) {
    out.push(
      `**${blocking} case(s) cannot be demonstrated today.** They are listed first below. ` +
        'Everything marked UNVERIFIED is built but has never run against the real registry.',
    );
    out.push('');
  }

  // Grouped by milestone, worst status first inside each — an assessor reads for gaps, not order.
  const milestones = [...new Set(rows.map((r) => r.c.milestone))];
  for (const m of milestones) {
    const mine = rows
      .filter((r) => r.c.milestone === m)
      .sort(
        (a, b) => SEVERITY.indexOf(a.key) - SEVERITY.indexOf(b.key) || a.c.id.localeCompare(b.c.id),
      );
    if (mine.length === 0) continue;

    out.push(`## ${m}`);
    out.push('');
    out.push('| Case | Requirement | What NHA asks | Status | Where it is demonstrated |');
    out.push('|---|---|---|---|---|');
    for (const r of mine) {
      const what = escapeCell(r.c.functionality || r.c.testCase).slice(0, 110);
      const where = r.ev ? escapeCell(r.ev.where) : '—';
      const note = r.ev?.note ? ` <br>_${escapeCell(r.ev.note)}_` : '';
      out.push(
        `| \`${r.c.id}\` | ${r.c.requirement} | ${what} | **${LABEL[r.key]}** | ${where}${note} |`,
      );
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    `Generated by \`npm run abdm:evidence -w hms_backend\`. ` +
      `Regenerate after any change to the workbooks or the evidence map — do not edit this output by hand.`,
  );
  process.stdout.write(`${out.join('\n')}\n`);
}

main();
